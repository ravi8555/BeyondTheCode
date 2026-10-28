import express, { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { healthCheck } from './middleware/health-check.js';
import { deploymentHeader } from './middleware/deployment-header.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

export interface AppOptions {
  port: number;
  deployVersion: string;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Observability middleware
  app.use(deploymentHeader({ logger, metrics }));

  // Health endpoint — used by K8s liveness/readiness probes
  app.get('/healthz', healthCheck({ logger, metrics }));

  // Status endpoint — returns deploy metadata for CI/CD verification
  app.get('/api/v1/status', (_req: Request, res: Response) => {
    metrics.inc('status_requests_total');
    res.json({
      status: 'ok',
      deployVersion: opts.deployVersion,
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    });
  });

  // Demo API endpoint
  app.get('/api/v1/items', (_req: Request, res: Response) => {
    metrics.inc('items_requests_total');
    res.json({
      items: [
        { id: 1, name: 'canary-check', status: 'healthy' },
        { id: 2, name: 'rollout-verify', status: 'pending' },
      ],
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    metrics.inc('not_found_requests_total');
    res.status(404).json({ error: 'not_found' });
  });

  // Error handler
  const errorHandler: ErrorRequestHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ event: 'unhandled_error', error: err.message });
    metrics.inc('unhandled_errors_total');
    res.status(500).json({ error: 'internal_server_error' });
  };
  app.use(errorHandler);

  return app;
}