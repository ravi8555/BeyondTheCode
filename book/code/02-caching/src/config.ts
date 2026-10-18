export interface AppConfig {
  port: number;
  redisUrl: string;
  databaseUrl: string;
  trustProxy: number | string;
  freshTtlMs: number;
  staleWindowMs: number;
  negativeTtlMs: number;
  jitterRatio: number;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${String(raw)}`);
  }
  return value;
}

function positiveNumber(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got: ${String(raw)}`);
  }
  return value;
}

/** Fail fast on bad config — staleness settings are product contracts. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveInt(env.PORT, 3000, 'PORT'),
    redisUrl: env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    databaseUrl:
      env.DATABASE_URL ??
      'postgres://formforge_dev:formforge_dev@127.0.0.1:5432/formforge',
    trustProxy: env.TRUST_PROXY ?? 'loopback',
    freshTtlMs: positiveInt(env.FORM_FRESH_TTL_MS, 60_000, 'FORM_FRESH_TTL_MS'),
    staleWindowMs: positiveInt(env.FORM_STALE_WINDOW_MS, 540_000, 'FORM_STALE_WINDOW_MS'),
    negativeTtlMs: positiveInt(env.FORM_NEGATIVE_TTL_MS, 30_000, 'FORM_NEGATIVE_TTL_MS'),
    jitterRatio: positiveNumber(env.CACHE_TTL_JITTER_RATIO, 0.1, 'CACHE_TTL_JITTER_RATIO'),
  };
}
