import { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
}

/**
 * Per-tenant fixed-window rate limiter backed by Redis.
 *
 * Key shape: `rl:{workspaceId}:{windowStartSeconds}`. Each request INCRs the
 * counter and sets an expiry equal to the window length. The Lua script runs the
 * check + increment atomically so concurrent requests cannot race past the limit.
 *
 * This mirrors Chapter 01's rate limiter but is keyed by workspace (tenant) rather
 * than raw IP, because the gateway sits behind a reverse proxy and sees the
 * proxy's IP unless trust-proxy + forwarded headers are configured.
 */
export class RateLimiter {
  private readonly redis: Redis;
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(redis: Redis, windowMs: number, maxRequests: number) {
    this.redis = redis;
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async consume(workspaceId: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const key = `rl:${workspaceId}:${windowStart}`;
    const resetAt = windowStart + this.windowMs;

    const script = `
      local current = redis.call('GET', KEYS[1])
      if current == false then
        redis.call('SET', KEYS[1], 1)
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        return {1, tonumber(ARGV[2])}
      end
      local next = tonumber(current) + 1
      redis.call('SET', KEYS[1], next)
      return {next, tonumber(ARGV[2])}
    `;

    const ttlSeconds = Math.ceil(this.windowMs / 1000);
    const result = (await this.redis.eval(script, 1, key, String(ttlSeconds))) as unknown as [number, number];

    const count = result[0];
    const allowed = count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - count);

    return {
      allowed,
      remaining,
      resetAt,
      ...(allowed ? {} : { retryAfterMs: resetAt - now }),
    };
  }
}
