export interface AppConfig {
  port: number;
  trustProxy: string | number;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${String(raw)}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveInt(env.PORT, 3001, 'PORT'),
    trustProxy: env.TRUST_PROXY ?? 'loopback',
  };
}
