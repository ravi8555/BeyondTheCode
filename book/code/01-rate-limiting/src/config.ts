export interface AppConfig {
  port: number;
  redisUrl: string;
  /** Value for Express 'trust proxy' — number of hops or 'loopback' etc. */
  trustProxy: number | string;
  submitLimit: number;
  submitWindowMs: number;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${String(raw)}`);
  }
  return value;
}

/** Fail fast on bad configuration — a limiter misconfig discovered at
 *  startup is cheap; one discovered during an incident is not. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveInt(env.PORT, 3000, 'PORT'),
    redisUrl: env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    trustProxy: env.TRUST_PROXY ?? 'loopback',
    submitLimit: positiveInt(env.SUBMIT_LIMIT, 10, 'SUBMIT_LIMIT'),
    submitWindowMs: positiveInt(env.SUBMIT_WINDOW_MS, 60_000, 'SUBMIT_WINDOW_MS'),
  };
}
