import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { slidingWindowLimiter, install } from '../src/limiter/sliding-window.js';
import { tokenBucketLimiter } from '../src/limiter/token-bucket.js';
import { probeRedis } from './helpers/redis.js';

// Shared probe: disconnects the probe on failure, warns loudly, and throws
// when REQUIRE_REDIS=1 (CI) — a green run without Redis proves nothing about
// Redis behavior, so skips must be visible, not silent.
const redis = await probeRedis();

afterAll(async () => {
  await redis?.quit();
});

describe.runIf(redis === null)('SKIPPED: Redis integration (Redis unreachable)', () => {
  it('visible skip marker — start Redis (docker compose up -d) and re-run; REQUIRE_REDIS=1 fails instead of skipping', () => {
    expect(true).toBe(true);
  });
});

describe.runIf(redis !== null)('sliding window limiter (real Redis)', () => {
  it('allows exactly `limit` requests, then denies with retryAfterMs', async () => {
    const r = redis as unknown as Redis;
    const limiter = slidingWindowLimiter(r);
    const key = `rl:test:${randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      expect((await limiter.check(key, 5, 60_000)).allowed).toBe(true);
    }
    const denied = await limiter.check(key, 5, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('sets a TTL on counter keys (no unbounded memory)', async () => {
    const r = redis as unknown as Redis;
    const limiter = slidingWindowLimiter(r);
    const key = `rl:test:${randomUUID()}`;
    const now = Date.now();
    const windowStart = Math.floor(now / 60_000) * 60_000;
    await limiter.check(key, 5, 60_000);
    const ttl = await r.ttl(`${key}:${windowStart}`);
    expect(ttl).toBeGreaterThan(0);
  });

  it('never allows more than the limit under concurrency (100 parallel, limit 10)', async () => {
    const r = redis as unknown as Redis;
    const limiter = slidingWindowLimiter(r);
    const key = `rl:test:${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 100 }, () => limiter.check(key, 10, 60_000)),
    );
    expect(results.filter((d) => d.allowed).length).toBeLessThanOrEqual(10);
  });

  it('deterministic window walk with synthetic `now` (no sleeping)', async () => {
    const r = redis as unknown as Redis;
    install(r);
    const scriptRedis = r as unknown as {
      slidingWindow: (
        a: string, b: string, l: number, w: number, n: number, c: number,
      ) => Promise<[number, number, number]>;
    };
    const base = 1_700_000_000_000; // arbitrary fixed epoch ms
    const windowMs = 60_000;
    const key = `rl:test:now:${randomUUID()}`;
    const k1 = `${key}:${base}`;
    const k0 = `${key}:${base - windowMs}`;
    // Fill window A to its limit.
    for (let i = 0; i < 5; i++) {
      const [allowed] = await scriptRedis.slidingWindow(k1, k0, 5, windowMs, base + 100, 1);
      expect(allowed).toBe(1);
    }
    const [blocked] = await scriptRedis.slidingWindow(k1, k0, 5, windowMs, base + 200, 1);
    expect(blocked).toBe(0);
    // Middle of the NEXT window: previous weight is ~50%, so only ~2 admits.
    const next = base + windowMs + Math.floor(windowMs / 2);
    let admits = 0;
    for (let i = 0; i < 5; i++) {
      const [allowed] = await scriptRedis.slidingWindow(
        `${key}:${base + windowMs}`, k1, 5, windowMs, next, 1,
      );
      if (allowed === 1) admits++;
    }
    expect(admits).toBeGreaterThan(0);
    expect(admits).toBeLessThan(5); // decay working, not a full fresh quota
  });
});

describe.runIf(redis !== null)('token bucket limiter (real Redis)', () => {
  it('enforces burst capacity then denies with a refill estimate', async () => {
    const r = redis as unknown as Redis;
    const limiter = tokenBucketLimiter(r, { capacity: 5, refillPerSec: 1 });
    const key = `rl:tb:${randomUUID()}`;
    // limit/windowMs are IGNORED by the token-bucket implementation —
    // capacity/refill are its factory-time configuration (see the Limiter
    // contract in types.ts). 0 here is a documented placeholder, not config.
    const IGNORED_GENERIC_ARGS = 0;
    for (let i = 0; i < 5; i++) {
      expect((await limiter.check(key, IGNORED_GENERIC_ARGS, IGNORED_GENERIC_ARGS)).allowed).toBe(true);
    }
    const denied = await limiter.check(key, IGNORED_GENERIC_ARGS, IGNORED_GENERIC_ARGS);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('rejects invalid options at construction', () => {
    const r = redis as unknown as Redis;
    expect(() => tokenBucketLimiter(r, { capacity: 0, refillPerSec: 1 })).toThrow();
  });
});
