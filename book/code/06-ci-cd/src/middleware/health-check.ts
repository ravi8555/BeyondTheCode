import type { Request, Response, NextFunction } from 'express';
import { metrics } from '../metrics.js';
import { logger } from '../logger.js';

export interface HealthCheckDeps {
  logger?: typeof logger;
  metrics?: typeof metrics;
}

/**
 * Simple health endpoint used by Kubernetes liveness/readiness probes.
 * Returns 200 when the process is up; optional dependency checks can be added
 * (Redis, Postgres) without failing fast — probes should degrade gracefully.
 */
export function healthCheck(deps: HealthCheckDeps = {}) {
  const log = deps.logger ?? logger;
  const counters = deps.metrics ?? metrics;
  return (_req: Request, res: Response): void => {
    counters.inc('health_check_requests_total', { endpoint: '/healthz' });
    log.info({ event: 'health_check', path: '/healthz' });
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  };
}

/**
 * Middleware that stamps every response with the deployed version.
 * CI injects DEPLOY_VERSION (git SHA) at build time; this header lets
 * operators and ArgoCD verify which rollout is actually serving traffic.
 */
export function deploymentHeader(deps: HealthCheckDeps = {}) {
  const log = deps.logger ?? logger;
  return (_req: Request, res: Response, next: NextFunction): void => {
    const version = process.env.DEPLOY_VERSION ?? 'unknown';
    res.setHeader('X-Deploy-Version', version);
    res.setHeader('X-Deploy-Env', process.env.NODE_ENV ?? 'development');
    log.debug({ event: 'deployment_header', version });
    next();
  };
}