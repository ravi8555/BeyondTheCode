import { Redis } from 'ioredis';

/**
 * Probes Redis connectivity. Returns the client on success, null on failure.
 * Tests register visible SKIPPED suites when Redis is down so a green run
 * never masquerades as validated cache behavior.
 *
 * CI mode: set REQUIRE_REDIS=1 to fail the run when Redis is unreachable.
 */
export async function probeRedis(): Promise<Redis | null> {
  try {
    const client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    return client;
  } catch {
    if (process.env.REQUIRE_REDIS === '1') {
      throw new Error('REQUIRE_REDIS=1 but Redis is unreachable — CI mode requires Redis');
    }
    console.warn('[tests] SKIPPED: Redis unreachable — start with `docker compose up -d`');
    return null;
  }
}