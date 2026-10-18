import { jitter, CacheStore, type CacheEntry } from './cache/redis-cache.js';
import { SingleFlight } from './cache/single-flight.js';
import type { FormRow, FormStore } from './db.js';

export interface MetricsLike {
  inc(name: string, labels?: Record<string, string>): void;
}
export interface LoggerLike {
  warn(obj: object, msg?: string): void;
}

export interface CacheDeps {
  cache: CacheStore;
  store: FormStore;
  freshTtlMs: number;
  staleWindowMs: number;
  negativeTtlMs: number;
  jitterRatio: number;
  metrics: MetricsLike;
  logger: LoggerLike;
  /** Injectable clock — deterministic SWR tests, no sleeps (ch 02, s.4). */
  now?: () => number;
}

export type ReadResult =
  | { kind: 'form'; source: 'hit' | 'stale' | 'miss'; form: FormRow }
  | { kind: 'not_found'; source: 'hit' | 'miss' };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cache-aside + stale-while-revalidate + negative caching + coalescing.
 * Freshness from entry.storedAt; cleanup from Redis TTL (jittered).
 * Failure mode: fail-open — cache errors degrade reads to the DB (s.5).
 */
export class FormCache {
  private readonly flight = new SingleFlight();

  constructor(private readonly deps: CacheDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private key(slug: string): string {
    return `form:v1:slug:${slug}`;
  }

  async getBySlug(slug: string): Promise<ReadResult> {
    const { freshTtlMs, staleWindowMs, metrics } = this.deps;
    const now = this.now();
    const key = this.key(slug);
    const entry = await this.safeGet(key);

    if (entry?.kind === 'form' && entry.value) {
      const age = now - entry.storedAt;
      if (age <= freshTtlMs) {
        metrics.inc('cache_requests_total', { result: 'hit' });
        return { kind: 'form', source: 'hit', form: entry.value };
      }
      if (age <= freshTtlMs + staleWindowMs) {
        // SWR: serve stale now; one coalesced background refresh per key.
        metrics.inc('cache_requests_total', { result: 'stale_hit' });
        void this.flight.do(key, () => this.loadAndStore(slug)).catch(() => undefined);
        return { kind: 'form', source: 'stale', form: entry.value };
      }
      // Older than the stale window: fall through to a blocking reload.
    }
    if (entry?.kind === 'negative') {
      metrics.inc('cache_requests_total', { result: 'negative_hit' });
      return { kind: 'not_found', source: 'hit' };
    }

    // True miss: coalesced — one loader per key per instance.
    const form = await this.flight.do(key, () => this.loadAndStore(slug));
    metrics.inc('cache_requests_total', { result: 'miss' });
    return form
      ? { kind: 'form', source: 'miss', form }
      : { kind: 'not_found', source: 'miss' };
  }

  /** Delete-on-write. A failed DEL does not fail the write — the TTL is the
   *  backstop; the error is logged and counted. */
  async invalidate(slug: string): Promise<void> {
    try {
      await this.deps.cache.del(this.key(slug));
    } catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'del' });
      this.deps.logger.warn({
        event: 'cache_del_error',
        slug,
        error: errMsg(err),
      });
    }
  }

  private async loadAndStore(slug: string): Promise<FormRow | null> {
    const { cache, store, freshTtlMs, staleWindowMs, negativeTtlMs, jitterRatio } =
      this.deps;
    const form = await store.getBySlug(slug); // parameterized SQL (db.ts)
    const storedAt = this.now();
    if (form) {
      await this.safeSet(
        this.key(slug),
        { v: 1, kind: 'form', value: form, storedAt },
        jitter(freshTtlMs + staleWindowMs, jitterRatio),
      );
    } else {
      await this.safeSet(
        this.key(slug),
        { v: 1, kind: 'negative', value: null, storedAt },
        jitter(negativeTtlMs, jitterRatio),
      );
    }
    return form;
  }

  private async safeGet(key: string): Promise<CacheEntry | null> {
    try {
      return await this.deps.cache.get(key);
    } catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'get' });
      this.deps.logger.warn({ event: 'cache_get_error', error: errMsg(err) });
      return null; // fail-open -> DB path
    }
  }

  private async safeSet(key: string, entry: CacheEntry, ttlMs: number): Promise<void> {
    try {
      await this.deps.cache.set(key, entry, ttlMs);
    } catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'set' });
      this.deps.logger.warn({ event: 'cache_set_error', error: errMsg(err) });
    }
  }
}
