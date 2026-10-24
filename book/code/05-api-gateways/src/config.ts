export interface GatewayConfig {
  port: number;
  trustProxy: string | boolean;
  redisUrl: string;
  jwtSecret: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  upstreamRequestTimeoutMs: number;
  maxRequestBodyBytes: number;
  cacheTtlSeconds: number;
  upstreamForms: string;
  upstreamSubmissions: string;
  upstreamWebhooks: string;
}

function requiredString(raw: string | undefined, name: string): string {
  if (!raw) {
    throw new Error(`${name} is required but was not set`);
  }
  return raw;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${String(raw)}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    port: positiveInt(env.PORT, 8080, 'PORT'),
    trustProxy: env.TRUST_PROXY ?? 'loopback',
    redisUrl: requiredString(env.REDIS_URL, 'REDIS_URL'),
    jwtSecret: requiredString(env.JWT_SECRET, 'JWT_SECRET'),
    rateLimitWindowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, 60_000, 'RATE_LIMIT_WINDOW_MS'),
    rateLimitMaxRequests: positiveInt(env.RATE_LIMIT_MAX_REQUESTS, 100, 'RATE_LIMIT_MAX_REQUESTS'),
    upstreamRequestTimeoutMs: positiveInt(env.UPSTREAM_REQUEST_TIMEOUT_MS, 10_000, 'UPSTREAM_REQUEST_TIMEOUT_MS'),
    maxRequestBodyBytes: positiveInt(env.MAX_REQUEST_BODY_BYTES, 1_048_576, 'MAX_REQUEST_BODY_BYTES'),
    cacheTtlSeconds: positiveInt(env.CACHE_TTL_SECONDS, 60, 'CACHE_TTL_SECONDS'),
    upstreamForms: requiredString(env.UPSTREAM_FORMS, 'UPSTREAM_FORMS'),
    upstreamSubmissions: requiredString(env.UPSTREAM_SUBMISSIONS, 'UPSTREAM_SUBMISSIONS'),
    upstreamWebhooks: requiredString(env.UPSTREAM_WEBHOOKS, 'UPSTREAM_WEBHOOKS'),
  };
}
