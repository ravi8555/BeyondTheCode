import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { slidingWindowLimiter } from '../src/limiter/sliding-window.js';

const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

let redis: Redis | null = null;
try {
  const probe = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  });
  await probe.ping();
  redis = probe;
} catch {
  redis = null;
}

afterAll(async () => {
  await redis?.quit();
});

describe.runIf(redis !== null)('POST /v1/forms/:id/submissions (end-to-end)', () => {
  it('returns 201 until the limit, then 429 with headers', async () => {
    const r = redis as unknown as Redis;
    const app = createApp({
      redisLimiter: slidingWindowLimiter(r),
      submitLimit: 3,
      submitWindowMs: 60_000,
    });
    const formId = randomUUID(); // isolates the limit key per test run
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post(`/v1/forms/${formId}/submissions`)
        .send({ q1: 'hello' });
      statuses.push(res.status);
      if (i === 3) {
        expect(res.body.error).toBe('rate_limit_exceeded');
        expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      } else {
        expect(res.headers['ratelimit-remaining']).toBeDefined();
      }
    }
    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it('rejects empty payloads with 400 (after the limiter allowed them)', async () => {
    const r = redis as unknown as Redis;
    const app = createApp({
      redisLimiter: slidingWindowLimiter(r),
      submitLimit: 10,
      submitWindowMs: 60_000,
    });
    const res = await request(app)
      .post(`/v1/forms/${randomUUID()}/submissions`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('answers_required');
  });

  it('healthz stays reachable (does not depend on the limiter)', async () => {
    const r = redis as unknown as Redis;
    const app = createApp({
      redisLimiter: slidingWindowLimiter(r),
      submitLimit: 1,
      submitWindowMs: 60_000,
    });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe.runIf(redis === null)('end-to-end suite (Redis unavailable)', () => {
  it('is skipped — start Redis via `docker compose up -d` and re-run', () => {
    expect(true).toBe(true);
  });
});
