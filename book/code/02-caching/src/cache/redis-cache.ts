import type { Redis } from 'ioredis';

export interface CacheEntry {
  v: 1;
  kind: 'form' | 'negative';
  value: { id: string; slug: string; title: string; schema: unknown } | null;
  /** Epoch ms: freshness is computed from this, not from the Redis TTL. */
  storedAt: number;
}

/**
 * Symmetric ±ratio spread of ttlMs: uniform in [ttl*(1-ratio), ttl*(1+ratio)].
 * ratio 0.1 => [900, 1100] for a 1000ms TTL. Avalanche prevention.
 *
 * Owned by the policy layer (FormCache.loadAndStore); RedisCache.set() does
 * NOT call this, to avoid double-jittering.
 */
export function jitter(ttlMs: number, ratio = 0.1, rand = Math.random): number {
  return Math.max(1, Math.round(ttlMs * (1 - ratio + 2 * ratio * rand())));
}

/**
 * The cache store interface RedisCache implements — tests inject fakes.
 * Chapter 02, section 5 requires injectable observability; this keeps the
 * FormCache independent of ioredis exactly like Chapter 01's Limiter.
 */
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class RedisCache implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  }

  async set(key: string, entry: CacheEntry, ttlMs: number): Promise<void> {
    // TTL covers the ENTIRE lifetime (fresh + stale windows); freshness is
    // enforced by storedAt so SWR decisions stay app-side and testable.
    // Jitter is applied by FormCache (policy layer) — never here, to avoid
    // double-jittering. See form-cache.ts loadAndStore.
    await this.redis.set(key, JSON.stringify(entry), 'PX', ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key); // delete-on-write (never overwrite; ch 02 s.3)
  }
}
