import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pino } from 'pino';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { probeInfra } from './helpers/infra.js';
import { createDb, type FormStore } from '../src/db.js';
import { RedisCache } from '../src/cache/redis-cache.js';
import { FormCache } from '../src/form-cache.js';
import { createMetrics } from '../src/metrics.js';
import { createApp } from '../src/app.js';

const infra = await probeInfra();
const silent = pino({ enabled: false });

afterAll(async () => {
  try { await infra?.redis.quit(); } catch {}
  try { await infra?.pool.end(); } catch {}
});

function buildApp(r: Redis, pool: Pool) {
  const store: FormStore = createDb(pool);
  const metrics = createMetrics();
  const formCache = new FormCache({
    cache: new RedisCache(r),
    store,
    freshTtlMs: 60_000,
    staleWindowMs: 540_000,
    negativeTtlMs: 30_000,
    jitterRatio: 0.1,
    metrics,
    logger: silent,
  });
  return createApp({ formCache, store, metrics });
}

async function seedForm(pool: Pool, title: string): Promise<string> {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO forms (slug, title, schema_json, published) VALUES ($1, $2, $3, true)`,
    [slug, title, JSON.stringify({ fields: [] })],
  );
  return slug;
}

describe.runIf(infra !== null)('API caching (end-to-end)', () => {
  it('MISS -> HIT -> PATCH -> MISS with fresh value', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const app = buildApp(redis, pool);
    const slug = await seedForm(pool, 'Original');

    const r1 = await request(app).get(`/v1/forms/${slug}`);
    expect(r1.status).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');

    const r2 = await request(app).get(`/v1/forms/${slug}`);
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r2.body.title).toBe('Original');

    const patch = await request(app)
      .patch(`/v1/forms/${slug}`)
      .send({ title: 'Updated' });
    expect(patch.status).toBe(200);

    const r3 = await request(app).get(`/v1/forms/${slug}`);
    expect(r3.headers['x-cache']).toBe('MISS'); // invalidated
    expect(r3.body.title).toBe('Updated');      // read-your-writes
  });

  it('unknown slug: MISS 404 then NEG 404', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const app = buildApp(redis, pool);
    const ghost = `nope-${randomUUID().slice(0, 8)}`;

    const r1 = await request(app).get(`/v1/forms/${ghost}`);
    expect(r1.status).toBe(404);
    expect(r1.headers['x-cache']).toBe('MISS');

    const r2 = await request(app).get(`/v1/forms/${ghost}`);
    expect(r2.status).toBe(404);
    expect(r2.headers['x-cache']).toBe('NEG');
  });

  it('rejects invalid slugs with 400 before touching cache or DB', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const app = buildApp(redis, pool);
    const res = await request(app).get('/v1/forms/NOT_A_VALID_SLUG');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_slug');
  });

  it('unpublished slug is a 404 (negative-cached like any miss)', async () => {
    const { redis, pool } = infra as NonNullable<typeof infra>;
    const app = buildApp(redis, pool);
    const res = await request(app).get('/v1/forms/draft-only');
    expect(res.status).toBe(404);
  });
});

describe.runIf(infra === null)('SKIPPED: API caching e2e (Redis/PostgreSQL unreachable)', () => {
  it('visible skip marker — docker compose up -d and re-run', () => {
    expect(true).toBe(true);
  });
});
