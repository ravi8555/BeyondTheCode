import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp({ config });

const server = createServer(app);

// WebSocket endpoint lives on the SAME port so the proxy's Upgrade
// handling is exercised end-to-end (Section 4). Plain ws echo is enough:
// the chapter is about the proxy hop, not the socket protocol.
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (socket) => {
  socket.on('message', (data) => {
    socket.send(`echo:${data.toString()}`);
  });
});

server.listen(config.port, () => {
  console.log(
    JSON.stringify({ level: 'info', event: 'listening', port: config.port }),
  );
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  server.close(() => process.exit(0));
  // Hard exit if connections linger.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
