import express from 'express';
import type { AppConfig } from './config.js';

export interface AppDeps {
  config: AppConfig;
  // Fail mode shared across the process; test endpoints flip it.
  failMode: boolean;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);
  app.use(express.json({ limit: '16kb' }));

  // Identify which instance handled the request — the observable the tests use.
  app.use((_req, res, next) => {
    res.setHeader('X-Instance-Id', deps.config.instanceId);
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', instance: deps.config.instanceId });
  });

  app.get('/v1/forms/:formId/submissions', (_req, res) => {
    if (deps.failMode) {
      res.status(500).json({ error: 'backend_injected_failure' });
      return;
    }
    res.status(201).json({
      id: String(Date.now()),
      formId: _req.params.formId,
      instance: deps.config.instanceId,
    });
  });

  // --- Test-only admin endpoints (dev environment only) ------------------
  if (deps.config.enableTestEndpoints) {
    app.post('/_test/fail', (_req, res) => {
      deps.failMode = true;
      res.json({ ok: true, instance: deps.config.instanceId, failMode: true });
    });
    app.post('/_test/recover', (_req, res) => {
      deps.failMode = false;
      res.json({ ok: true, instance: deps.config.instanceId, failMode: false });
    });
    app.get('/_test/status', (_req, res) => {
      res.json({
        instance: deps.config.instanceId,
        failMode: deps.failMode,
      });
    });
  }

  return app;
}
