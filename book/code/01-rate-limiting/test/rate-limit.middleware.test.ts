import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Limiter } from '../src/limiter/types.js';
import { rateLimit } from '../src/middleware/rate-limit.js';

/** Unit tests: no Redis. Fakes injected through the Limiter interface. */

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
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.post(
    '/submit',
    rateLimit(limiter, {
      name: 'unit',
      limit: 10,
      windowMs: 60_000,
      keyBuilder: () => 'client-a',
      failureMode,
    }),
    (_req, res) => {
      res.status(201).json({ ok: true });
    },
  );
  return app;
}

describe('rateLimit middleware (unit)', () => {
  it('allows and sets RateLimit-* headers', async () => {
    const res = await request(appWith(allowAll, 'fail-closed'))
      .post('/submit')
      .send({});
    expect(res.status).toBe(201);
    expect(res.headers['ratelimit-limit']).toBe('10');
    expect(res.headers['ratelimit-remaining']).toBe('5');
  });

  it('denies with 429, Retry-After and JSON body', async () => {
    const res = await request(appWith(denyAll, 'fail-closed'))
      .post('/submit')
      .send({});
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(res.body.error).toBe('rate_limit_exceeded');
  });

  it('fail-closed returns 503 when the store throws', async () => {
    const res = await request(appWith(storeDown, 'fail-closed'))
      .post('/submit')
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('rate_limit_unavailable');
  });

  it('fail-open calls next() when the store throws', async () => {
    const res = await request(appWith(storeDown, 'fail-open'))
      .post('/submit')
      .send({});
    expect(res.status).toBe(201);
  });
});
