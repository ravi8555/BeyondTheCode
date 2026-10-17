import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Limiter } from './limiter/types.js';
import { rateLimit } from './middleware/rate-limit.js';

export interface AppOptions {
  redisLimiter: Limiter;
  submitLimit: number;
  submitWindowMs: number;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by'); // do not advertise the framework
  // Bounded body size: a limiter protects count, not bytes (chapter 01, s.6).
  app.use(express.json({ limit: '16kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const submitLimit = rateLimit(opts.redisLimiter, {
    name: 'form-submit',
    limit: opts.submitLimit,
    windowMs: opts.submitWindowMs,
    // req.ip respects Express 'trust proxy' — configure it consciously.
    keyBuilder: (req) => `${String(req.params.formId)}:${req.ip}`,
    // Public respondent path: an outage of the limiter should not stop
    // respondents (chapter 01, section 5 blast-radius reasoning).
    failureMode: 'fail-open',
  });

  app.post('/v1/forms/:formId/submissions', submitLimit, (req, res) => {
    const answers = req.body as Record<string, unknown> | undefined;
    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      res.status(400).json({ error: 'answers_required' });
      return;
    }
    // Deliberately omitted (production list in chapter 01, section 5):
    // persistence to PostgreSQL, abuse scoring, event emission to workers.
    res.status(201).json({
      id: randomUUID(),
      formId: req.params.formId,
      receivedAt: new Date().toISOString(),
    });
  });

  return app;
}
