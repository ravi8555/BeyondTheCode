import { pino } from 'pino';

/** Structured JSON logger (chapter 02, section 5 observability). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { app: 'formforge-api' },
});

export type AppLogger = typeof logger;
