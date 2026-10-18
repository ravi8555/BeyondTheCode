export interface AppConfig {
  port: number;
  instanceId: string;
  trustProxy: string | number;
  enableTestEndpoints: boolean;
}

function requiredString(raw: string | undefined, name: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return raw.trim();
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
    instanceId: requiredString(env.INSTANCE_ID, 'INSTANCE_ID'),
    trustProxy: env.TRUST_PROXY ?? 'loopback',
    enableTestEndpoints: env.ENABLE_TEST_ENDPOINTS === 'true',
  };
}
