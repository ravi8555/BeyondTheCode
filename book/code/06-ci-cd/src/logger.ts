import { createRequire } from 'node:module';
import pino from 'pino';

const require = createRequire(import.meta.url);

/**
 * Only enable pino-pretty transport in development when the package is
 * actually installed (it's a devDependency, omitted in production Docker builds).
 */
let transport: { target: string; options: { colorize: boolean } } | undefined;
if (process.env.NODE_ENV === 'development') {
  try {
    require.resolve('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true } };
  } catch {
    transport = undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport,
  // Structured JSON in production; pretty-printed in dev when pino-pretty is available.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});