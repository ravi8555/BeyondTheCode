const http = require('node:http');
const port = Number(process.env.PORT || 3000);
const service = process.env.SERVICE_NAME || 'stub';

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-service', service);
  res.end(JSON.stringify({ service, path: req.url, method: req.method }));
});

server.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'listening', port, service }));
});
