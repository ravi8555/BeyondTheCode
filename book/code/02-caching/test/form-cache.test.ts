import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { probeInfra } from './helpers/infra.js';
import { createDb, type FormStore } from '../src/db.js';
import { RedisCache, jitter } from '../src/cache/redis-cache.js';
import { FormCache } from '../src/form-cache.js';
import { createMetrics } from '../src/metrics.js';

const infra = await probeInfra();
const silent = pino({ enabled: false });

afterAll(async () => {
  try { await infra?.redis.quit(); } catch {}
  try { await infra?.pool.end(); } catch {}
});

function countingStore(pool: Pool) {
  const inner = createDb(pool);
  let calls = 0;
  const store: FormStore = {
    getBySlug: (slug: string) => {
      calls++;
      return inner.getBySlug(slug);
    },
    updateTitle: (slug: string, title: string) => inner.updateTitle(slug, title),
  };
  return {
    store,
    get calls() {
      return calls;
    },
    reset() {
      calls = 0;
    },
  };
}

async function seedForm(pool: Pool, title = 'Seeded'): Promise<string> {
  const slug = `t-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO forms (slug, title, schema_json, published) VALUES ($1, $2, $3, true)`,
    [slug, title, JSON.stringify({ fields: [] })],
  );
  return slug;
}

function makeCache(redis: Redis, store: FormStore, now?: () => number): FormCache {
  return new FormCache({
    cache: new RedisCache(redis),
    store,
    freshTtlMs: 60_000,
    staleWindowMs: 540_000,
    negativeTtlMs: 30_000,
    jitterRatio: 0.1,
    metrics: createMetrics(),
    logger: silent,
    now,
  });
}

describe('jitter (pure unit, no infra)', () => {
  it('stays within symmetric ±ratio bounds and actually varies', () => {
    const samples = Array.from({ length: 200 }, (_, i) =>
      jitter(1000, 0.1, () => (i % 97) / 100),
    );
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(900);
      expect(s).toBeLessThanOrEqual(1100);
    }
    expect(new Set(samples).size).toBeGreaterThan(1);
  });
});

describe.runIf(infra !== null)('FormCache (real Redis + PostgreSQL)', () => {
  it('applies jitter once — final Redis TTL within ±10% bounds', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    const fc = new FormCache({
      cache: new RedisCache(redis),
      store: cs.store,
      freshTtlMs: 1000,   // small TTL for a fast test
      staleWindowMs: 0,
      negativeTtlMs: 30_000,
      jitterRatio: 0.1,
      metrics: createMetrics(),
      logger: silent,
    });
    const slug = await seedForm(pool, 'jittered');

    await fc.getBySlug(slug); // miss -> loadAndStore -> set with jittered TTL

    const pttl = await redis.pttl(`form:v1:slug:${slug}`);
    // Fresh TTL is 1000ms, jitter ±10% => [900, 1100]ms.
    // pttl decays while the test runs, so allow a small decay tolerance.
    expect(pttl).toBeGreaterThanOrEqual(850);
    expect(pttl).toBeLessThanOrEqual(1100);
  });

  it('MISS then HIT; DB contacted exactly once; TTL set on the key', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    const fc = makeCache(redis, cs.store);
    const slug = await seedForm(pool);

    const first = await fc.getBySlug(slug);
    expect(first).toMatchObject({ kind: 'form', source: 'miss' });
    const second = await fc.getBySlug(slug);
    expect(second).toMatchObject({ kind: 'form', source: 'hit' });
    expect(cs.calls).toBe(1);

    const pttl = await redis.pttl(`form:v1:slug:${slug}`);
    expect(pttl).toBeGreaterThan(0); // no forgotten-TTL memory leaks
  });

  it('negative caching: second 404 read is a NEG hit with no extra DB call', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    const fc = makeCache(redis, cs.store);
    const ghost = `ghost-${randomUUID().slice(0, 8)}`;

    const first = await fc.getBySlug(ghost);
    expect(first).toMatchObject({ kind: 'not_found', source: 'miss' });
    const second = await fc.getBySlug(ghost);
    expect(second).toMatchObject({ kind: 'not_found', source: 'hit' });
    expect(cs.calls).toBe(1);
  });

  it('serves stale within the stale window, then refreshes in background (injected clock)', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    let clock = 1_700_000_000_000;
    const fc = makeCache(redis, cs.store, () => clock);
    const slug = await seedForm(pool, 'v1');

    await fc.getBySlug(slug); // miss, storedAt = clock
    await pool.query(`UPDATE forms SET title = $2 WHERE slug = $1`, [slug, 'v2']);

    clock += 61_000; // past freshTtl (60s), inside the stale window
    const stale = await fc.getBySlug(slug);
    expect(stale).toMatchObject({ kind: 'form', source: 'stale' });
    if (stale.kind === 'form') expect(stale.form.title).toBe('v1'); // stale copy served

    // Poll until the coalesced background refresh lands
    // (query latency, not a TTL-length sleep).
    let after: Awaited<ReturnType<typeof fc.getBySlug>> | null = null;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 20));
      after = await fc.getBySlug(slug);
      if (after.source === 'hit') break;
    }
    expect(after?.source).toBe('hit');
    if (after?.kind === 'form') expect(after.form.title).toBe('v2');
  });

  it('coalesces 50 concurrent cold reads into ONE DB query', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    const fc = makeCache(redis, cs.store);
    const slug = await seedForm(pool, 'hot');
    cs.reset();

    const results = await Promise.all(
      Array.from({ length: 50 }, () => fc.getBySlug(slug)),
    );
    expect(results.every((r) => r.kind === 'form')).toBe(true);
    expect(cs.calls).toBe(1);
  });

  it('fails open when the cache errors (DB reads continue, errors counted)', async () => {
    const { pool } = infra as NonNullable<typeof infra>;
    const cs = countingStore(pool);
    const brokenCache = {
      get: async (): Promise<null> => {
        throw new Error('redis down');
      },
      set: async (): Promise<void> => {
        throw new Error('redis down');
      },
      del: async (): Promise<void> => {
        throw new Error('redis down');
      },
    };
    const metrics = createMetrics();
    const fc = new FormCache({
      cache: brokenCache,
      store: cs.store,
      freshTtlMs: 60_000,
      staleWindowMs: 540_000,
      negativeTtlMs: 30_000,
      jitterRatio: 0.1,
      metrics,
      logger: silent,
    });
    const slug = await seedForm(pool, 'failopen');
    const result = await fc.getBySlug(slug);
    expect(result.kind).toBe('form');
    expect(metrics.get('cache_errors_total', { op: 'get' })).toBe(1);
    expect(metrics.get('cache_errors_total', { op: 'set' })).toBe(1);
  });
});

describe.runIf(infra === null)('SKIPPED: FormCache integration (Redis/PostgreSQL unreachable)', () => {
  it('visible skip marker — docker compose up -d and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
