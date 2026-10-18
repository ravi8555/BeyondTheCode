import { Redis } from 'ioredis';

/**
 * Probes Redis once for integration suites.
 *
 * - Reachable: returns a connected client (caller quits it in afterAll).
 * - Unreachable + REQUIRE_REDIS=1: throws, failing the suite loudly — use
 *   this in CI, where a silently-skipped integration suite would give a
 *   false green (review note: a pass without Redis validates nothing about
 *   Redis behavior).
 * - Unreachable otherwise: disconnects the probe (no leaked connection or
 *   background retry loop) and returns null; suites then register a
 *   *visible* skipped suite so test reports show the gap.
 */
export async function probeRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const probe = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  });
  try {
    await probe.ping();
    return probe;
  } catch (err) {
    probe.disconnect(); // stop reconnect timers; nothing to clean up on a
    // lazy, never-connected client beyond the socket.
    if (process.env.REQUIRE_REDIS === '1') {
      throw new Error(
        `REQUIRE_REDIS=1 but Redis is unreachable at ${url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    console.warn(
      `[tests] Redis unreachable at ${url} — Redis integration suites will be SKIPPED. ` +
        'Set REQUIRE_REDIS=1 (CI) to fail instead.',
    );
    return null;
  }
}
