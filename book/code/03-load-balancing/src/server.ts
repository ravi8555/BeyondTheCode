import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const failMode = false;

const app = createApp({ config, failMode });

const server = createServer(app);
server.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'listening',
      instance: config.instanceId,
      port: config.port,
    }),
  );
});

function shutdown(signal: string): void {
  console.log(
    JSON.stringify({ level: 'info', event: 'shutdown', instance: config.instanceId, signal }),
  );
  server.close(() => process.exit(0));
  // Hard exit if connections linger.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
