import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

const config = loadConfig();

const app = createApp({
  port: config.port,
  deployVersion: config.deployVersion,
});

const server = createServer(app);

server.listen(config.port, () => {
  logger.info(
    {
      event: 'listening',
      port: config.port,
      env: config.nodeEnv,
      deployVersion: config.deployVersion,
    },
    'server started',
  );
  metrics.inc('server_start_total', { env: config.nodeEnv });
});

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown', signal });
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'uncaught_exception', error: err.message });
  process.exit(1);
});