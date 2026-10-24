import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import type { GatewayConfig } from '../../src/config.js';
import type { RateLimiter } from '../../src/gateway/rate-limit.js';
import { createApp } from '../../src/app.js';

/** Build a gateway app wired to an in-memory (fake) rate limiter for tests. */
export function makeApp(overrides: Partial<GatewayConfig> & {
  rateLimiter?: RateLimiter;
  upstreams?: Record<string, { baseUrl: string }>;
} = {}): { app: ReturnType<typeof createApp>; config: GatewayConfig } {
  const config: GatewayConfig = {
    port: 0,
    trustProxy: 'loopback',
    redisUrl: 'redis://localhost:6379',
    jwtSecret: 'test-secret',
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 100,
    upstreamRequestTimeoutMs: 5_000,
    maxRequestBodyBytes: 1_048_576,
    cacheTtlSeconds: 60,
    upstreamForms: 'http://forms-stub:3001',
    upstreamSubmissions: 'http://submissions-stub:3002',
    upstreamWebhooks: 'http://webhooks-stub:3003',
    ...overrides,
  };
  const upstreams = overrides.upstreams ?? {
    forms: { baseUrl: 'http://localhost:1' },
    submissions: { baseUrl: 'http://localhost:2' },
    webhooks: { baseUrl: 'http://localhost:3' },
  };
  const app = createApp({ config, rateLimiter: overrides.rateLimiter!, upstreams });
  return { app, config };
}

/** Start an http server on an ephemeral port and return its base URL + close fn. */
export function startTestServer(app: ReturnType<typeof createApp>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', (err) => {
      if (err) return reject(err);
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({ baseUrl, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
