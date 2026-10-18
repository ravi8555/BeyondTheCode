import { pino } from 'pino';

/**
 * Structured JSON logger (chapter 01, section 5: observability).
 * LOG_LEVEL controls verbosity; tests inject a silent instance instead.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { app: 'formforge-api' },
});

export type AppLogger = typeof logger;
