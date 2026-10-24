import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { RateLimiter } from './gateway/rate-limit.js';
import { Redis } from 'ioredis';
import { createApp } from './app.js';

const config = loadConfig();
const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
const rateLimiter = new RateLimiter(
  redis,
  config.rateLimitWindowMs,
  config.rateLimitMaxRequests,
);

const upstreams: Record<string, { name: string; baseUrl: string }> = {
  forms: { name: 'forms', baseUrl: config.upstreamForms },
  submissions: { name: 'submissions', baseUrl: config.upstreamSubmissions },
  webhooks: { name: 'webhooks', baseUrl: config.upstreamWebhooks },
};

const app = createApp({ config, rateLimiter, upstreams });
const server = createServer(app);

async function start(): Promise<void> {
  await rateLimiter.connect();
  server.listen(config.port, () => {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'listening',
        port: config.port,
        service: 'api-gateway',
      }),
    );
  });
}

start().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', event: 'startup_failed', error: String(err) }));
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  rateLimiter.disconnect().catch(() => {
    /* best-effort disconnect */
  });
  server.close(() => process.exit(0));
  // Hard exit if connections linger.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
