import type { Redis } from 'ioredis';
import type { Limiter, RateLimitDecision } from './types.js';

/**
 * Sliding window counter (chapter 01, section 2.3).
 *
 * The entire read -> decide -> write sequence runs as one Lua script inside
 * Redis, which executes scripts atomically: concurrent requests cannot
 * interleave between the estimate and the increment (the TOCTOU trap of a
 * naive GET-then-INCR limiter).
 *
 * `now` is an argument (not TIME inside the script) so tests can walk through
 * window boundaries deterministically without sleeping. Production callers
 * pass Date.now(); for multi-writer skew tolerance you may prefer the Redis
 * TIME command inside the script (chapter 01, section 6, case 8).
 *
 * Redis Cluster note: both keys must hash to one slot. When composing keys
 * outside, include a hash tag, e.g. rl:{form:f1:ip:203.0.113.4}:1734...
 */
const SLIDING_WINDOW_LUA = `
local currKey    = KEYS[1]
local prevKey    = KEYS[2]
local limit      = tonumber(ARGV[1])
local windowMs   = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local cost       = tonumber(ARGV[4])

local curr = tonumber(redis.call('GET', currKey) or '0')
local prev = tonumber(redis.call('GET', prevKey) or '0')

local windowStart = now - (now % windowMs)
local elapsedRatio = (now - windowStart) / windowMs
local estimated = prev * (1 - elapsedRatio) + curr

if estimated + cost > limit then
  local retryAfterMs = windowMs - (now - windowStart)
  return {0, math.max(0, math.floor(limit - estimated)), retryAfterMs}
end

redis.call('INCRBY', currKey, cost)
-- TTL = 2 windows: the previous window's counter must survive long enough
-- to be read by the next window's requests, then Redis reaps both keys.
redis.call('PEXPIRE', currKey, windowMs * 2)
return {1, math.max(0, math.floor(limit - estimated - cost)), 0}
`;

type RedisWithScript = Redis & {
  slidingWindow: (
    currKey: string,
    prevKey: string,
    limit: number,
    windowMs: number,
    now: number,
    cost: number,
  ) => Promise<[number, number, number]>;
};

/** Registers the script once per Redis connection. */
export function install(redis: Redis): void {
  (redis as RedisWithScript).defineCommand('slidingWindow', {
    numberOfKeys: 2,
    lua: SLIDING_WINDOW_LUA,
  });
}

export function slidingWindowLimiter(redis: Redis): Limiter {
  install(redis);
  return {
    async check(key, limit, windowMs, cost = 1): Promise<RateLimitDecision> {
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const [allowed, remaining, retryAfterMs] = await (redis as RedisWithScript).slidingWindow(
        `${key}:${windowStart}`,
        `${key}:${windowStart - windowMs}`,
        limit,
        windowMs,
        now,
        cost,
      );
      return { allowed: allowed === 1, remaining, retryAfterMs };
    },
  };
}
