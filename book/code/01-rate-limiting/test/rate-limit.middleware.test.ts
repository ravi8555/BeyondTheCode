import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { pino } from 'pino';
import type { Limiter } from '../src/limiter/types.js';
import { rateLimit } from '../src/middleware/rate-limit.js';
import { createMetrics } from '../src/metrics.js';

/** Unit tests: no Redis. Fakes injected through the Limiter interface;
 *  silent logger + isolated metrics registry per app. Beyond HTTP behavior
 *  we assert the observability side effects (store-error and decision
 *  counters) — the signals production alerting depends on. */

const silentLogger = pino({ enabled: false });

const allowAll: Limiter = {
  check: async () => ({ allowed: true, remaining: 5, retryAfterMs: 0 }),
};
const denyAll: Limiter = {
  check: async () => ({ allowed: false, remaining: 0, retryAfterMs: 42_000 }),
};
const storeDown: Limiter = {
  check: async () => {
    throw new Error('redis down');
  },
};

function appWith(limiter: Limiter, failureMode: 'fail-open' | 'fail-closed') {
  const counters = createMetrics();
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.post(
    '/submit',
    rateLimit(
      limiter,
      {
        name: 'unit',
        limit: 10,
        windowMs: 60_000,
        keyBuilder: () => 'client-a',
        failureMode,
      },
      { logger: silentLogger, metrics: counters },
    ),
    (_req, res) => {
      res.status(201).json({ ok: true });
    },
  );
  return { app, counters };
}

describe('rateLimit middleware (unit)', () => {
  it('allows and sets RateLimit-* headers', async () => {
    const { app, counters } = appWith(allowAll, 'fail-closed');
    const res = await request(app).post('/submit').send({});
    expect(res.status).toBe(201);
    expect(res.headers['ratelimit-limit']).toBe('10');
    expect(res.headers['ratelimit-remaining']).toBe('5');
    expect(counters.get('rate_limit_decisions_total', { rule: 'unit', action: 'allow' })).toBe(1);
  });

  it('denies with 429, Retry-After and JSON body; counts the deny', async () => {
    const { app, counters } = appWith(denyAll, 'fail-closed');
    const res = await request(app).post('/submit').send({});
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(res.body.error).toBe('rate_limit_exceeded');
    expect(counters.get('rate_limit_decisions_total', { rule: 'unit', action: 'deny' })).toBe(1);
  });

  it('fail-closed returns 503 when the store throws; counts the store error', async () => {
    const { app, counters } = appWith(storeDown, 'fail-closed');
    const res = await request(app).post('/submit').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('rate_limit_unavailable');
    expect(counters.get('rate_limit_store_errors_total', { rule: 'unit' })).toBe(1);
    expect(counters.get('rate_limit_decisions_total', { rule: 'unit', action: 'store_error_503' })).toBe(1);
  });

  it('fail-open calls next() when the store throws; still counts the store error', async () => {
    const { app, counters } = appWith(storeDown, 'fail-open');
    const res = await request(app).post('/submit').send({});
    expect(res.status).toBe(201);
    expect(counters.get('rate_limit_store_errors_total', { rule: 'unit' })).toBe(1);
    expect(counters.get('rate_limit_decisions_total', { rule: 'unit', action: 'fail_open_allow' })).toBe(1);
  });
});
