export interface AppConfig {
  port: number;
  nodeEnv: string;
  deployVersion: string;
  redisUrl: string | undefined;
  databaseUrl: string | undefined;
  trustProxy: number | string;
}

function requiredString(raw: string | undefined, name: string): string {
  if (!raw) {
    throw new Error(`${name} must be set`);
  }
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    nodeEnv: env.NODE_ENV ?? 'development',
    deployVersion: requiredString(env.DEPLOY_VERSION, 'DEPLOY_VERSION'),
    redisUrl: env.REDIS_URL,
    databaseUrl: env.DATABASE_URL,
    trustProxy: env.TRUST_PROXY ?? 'loopback',
  };
}