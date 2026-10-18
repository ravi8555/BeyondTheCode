import type { Redis } from 'ioredis';
import type { Limiter, RateLimitDecision } from './types.js';

/**
 * Token bucket (chapter 01, section 2.4): capacity = allowed burst,
 * refillPerSec = sustained rate.
 *
 * Configuration is EXPLICIT and happens at factory time via
 * TokenBucketOptions. The generic Limiter.check() `limit` and `windowMs`
 * parameters are intentionally IGNORED by this implementation (see the
 * Limiter contract in types.ts): capacity/refill are the real knobs, and
 * smuggling them through check() per request would be misleading. The
 * middleware still passes its rule values for interface uniformity.
 */

const TOKEN_BUCKET_LUA = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local cost       = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

local deltaSec = math.max(0, (now - ts) / 1000.0)
tokens = math.min(capacity, tokens + deltaSec * refillPerSec)

local allowed = 0
local retryAfterMs = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  local missing = cost - tokens
  retryAfterMs = math.ceil((missing / refillPerSec) * 1000.0)
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
-- Keep the key for a full refill period (x2) after the last touch, then drop it.
redis.call('PEXPIRE', key, math.ceil((capacity / refillPerSec) * 1000.0) * 2)
return {allowed, math.floor(tokens), retryAfterMs}
`;

type RedisWithBucket = Redis & {
  tokenBucket: (
    key: string,
    capacity: number,
    refillPerSec: number,
    now: number,
    cost: number,
  ) => Promise<[number, number, number]>;
};

export interface TokenBucketOptions {
  /** Burst size. */
  capacity: number;
  /** Sustained rate in tokens per second. */
  refillPerSec: number;
}

export function tokenBucketLimiter(
  redis: Redis,
  opts: TokenBucketOptions,
): Limiter {
  const { capacity, refillPerSec } = opts;
  if (capacity <= 0 || refillPerSec <= 0) {
    throw new Error('token bucket capacity and refillPerSec must be > 0');
  }
  (redis as RedisWithBucket).defineCommand('tokenBucket', {
    numberOfKeys: 1,
    lua: TOKEN_BUCKET_LUA,
  });
  return {
    async check(key, _limit, _windowMs, cost = 1): Promise<RateLimitDecision> {
      const now = Date.now();
      const [allowed, tokens, retryAfterMs] = await (redis as RedisWithBucket).tokenBucket(
        key,
        capacity,
        refillPerSec,
        now,
        cost,
      );
      return { allowed: allowed === 1, remaining: tokens, retryAfterMs };
    },
  };
}
