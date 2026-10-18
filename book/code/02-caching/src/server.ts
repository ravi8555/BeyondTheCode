import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { createDb } from './db.js';
import { RedisCache } from './cache/redis-cache.js';
import { FormCache } from './form-cache.js';
import { createApp } from './app.js';

const config = loadConfig();

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  commandTimeout: 100, // cache must fail fast; slow cache > no cache
});
redis.on('error', (err) => {
  logger.error({ event: 'redis_error', error: err.message });
});

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  statement_timeout: 5_000,
  connectionTimeoutMillis: 2_000,
});
pool.on('error', (err) => {
  logger.error({ event: 'pg_pool_error', error: err.message });
});

const store = createDb(pool);
const formCache = new FormCache({
  cache: new RedisCache(redis),
  store,
  freshTtlMs: config.freshTtlMs,
  staleWindowMs: config.staleWindowMs,
  negativeTtlMs: config.negativeTtlMs,
  jitterRatio: config.jitterRatio,
  metrics,
  logger,
});

const app = createApp({ formCache, store, metrics });
app.set('trust proxy', config.trustProxy);

const server = createServer(app);
server.listen(config.port, () => {
  logger.info({ event: 'listening', port: config.port });
});

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown', signal });
  server.close(() => {
    void Promise.allSettled([redis.quit(), pool.end()]).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
