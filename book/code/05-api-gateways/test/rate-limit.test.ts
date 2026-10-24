import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../src/gateway/rate-limit.js';

/** Minimal fake Redis implementing eval/connect/quit used by RateLimiter. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  const evalImpl = vi.fn(async (_script: string, ...rest: unknown[]) => {
    // ioredis eval: eval(script, numkeys, key1..keyN, arg1..argM)
    const numkeys = Number(rest[0]);
    const key = rest[1];
    const ttl = Number(rest[2]);
    const current = store.get(String(key));
    if (current === undefined) {
      store.set(String(key), '1');
      if (ttl > 0) store.set(`__ttl__${key}`, String(ttl));
      return [1, ttl];
    }
    const next = Number(current) + 1;
    store.set(String(key), String(next));
    return [next, ttl];
  });
  return {
    eval: evalImpl,
    connect: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
    store,
  };
}

describe('RateLimiter', () => {
  let redis: ReturnType<typeof makeFakeRedis>;
  let limiter: RateLimiter;

  beforeEach(() => {
    redis = makeFakeRedis();
    limiter = new RateLimiter(redis as unknown as Parameters<typeof RateLimiter>[0], 60_000, 3);
  });

  it('allows requests up to the limit, then rejects', async () => {
    const r1 = await limiter.consume('ws_1');
    const r2 = await limiter.consume('ws_1');
    const r3 = await limiter.consume('ws_1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await limiter.consume('ws_1');
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });

  it('limits are per workspace', async () => {
    await limiter.consume('ws_1');
    await limiter.consume('ws_1');
    await limiter.consume('ws_1'); // ws_1 at limit
    const r = await limiter.consume('ws_2'); // ws_2 untouched
    expect(r.allowed).toBe(true);
  });

  it('calls Redis eval with the workspace-scoped key', async () => {
    await limiter.consume('ws_42');
    const [_script, ...rest] = redis.eval.mock.calls[0];
    expect(typeof _script).toBe('string');
    // eval(script, numkeys=1, key, ttl)
    expect(rest[0]).toBe(1);
    expect(String(rest[1])).toMatch(/^rl:ws_42:\d+$/);
  });
});
