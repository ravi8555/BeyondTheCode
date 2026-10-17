import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { slidingWindowLimiter } from './limiter/sliding-window.js';

const config = loadConfig();

const redis = new Redis(config.redisUrl, {
  // Fail fast: the limiter must never silently queue requests for seconds.
  maxRetriesPerRequest: 1,
  commandTimeout: 100,
});
redis.on('error', (err) => {
  console.error(
    JSON.stringify({ level: 'error', event: 'redis_error', error: err.message }),
  );
});

const app = createApp({
  redisLimiter: slidingWindowLimiter(redis),
  submitLimit: config.submitLimit,
  submitWindowMs: config.submitWindowMs,
});
// Only trust proxy headers set by infrastructure you control (chapter 01, s.7).
app.set('trust proxy', config.trustProxy);

const server = createServer(app);
server.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'listening', port: config.port }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  server.close(() => {
    void redis.quit().finally(() => process.exit(0));
  });
  // Hard exit if a stuck connection survives the graceful path.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
