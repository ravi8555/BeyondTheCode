import { Redis } from 'ioredis';
import { Pool } from 'pg';

export interface Infra {
  redis: Redis;
  pool: Pool;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Probes Redis and PostgreSQL once for integration suites.
 *
 * - Both reachable: returns connected clients (caller quits/ends them).
 * - Unreachable + REQUIRE_INFRA=1: throws — CI fails loudly; a green run
 *   without infra validates nothing about cache/DB behavior.
 * - Unreachable otherwise: disconnects the probe (no leaked connections or
 *   background retry loops), warns loudly, returns null; suites then show
 *   visible `SKIPPED:` suites in the report.
 */
export async function probeInfra(): Promise<Infra | null> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgres://formforge_dev:formforge_dev@127.0.0.1:5432/formforge';

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    commandTimeout: 800,
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 800,
    statement_timeout: 2_000,
  });

  try {
    await redis.ping();
    await pool.query('SELECT 1');
    return { redis, pool };
  } catch (err) {
    redis.disconnect();
    await pool.end().catch(() => undefined);
    if (process.env.REQUIRE_INFRA === '1') {
      throw new Error(`REQUIRE_INFRA=1 but infra unreachable: ${errMsg(err)}`);
    }
    console.warn(
      '[tests] Redis/PostgreSQL unreachable — integration suites will be SKIPPED. ' +
        'Set REQUIRE_INFRA=1 (CI) to fail instead.',
    );
    return null;
  }
}
