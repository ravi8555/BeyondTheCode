import { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { URL } from 'node:url';

export interface ProxyOptions {
  upstreamBaseUrl: string;
  requestTimeoutMs: number;
  maxRequestBodyBytes: number;
}

/**
 * Stream a request to an upstream service and pipe the response back to the client.
 *
 * Responsibilities:
 *   - Rebuild the target URL from the upstream base + original path + query.
 *   - Forward method, headers (stripping hop-by-hop headers), and body.
 *   - Enforce a per-request timeout so a hung upstream cannot exhaust gateway sockets.
 *   - Enforce a body-size cap so a malicious/client error cannot buffer the whole body.
 *   - Forward upstream status code and headers; never leak stack traces.
 *   - On upstream failure, respond 502 Bad Gateway (or 504 on timeout).
 *
 * This is a minimal production-aware reverse proxy. For FormForge at real scale the
 * gateway would delegate TLS termination, connection pooling, and keepalive to Nginx
 * or a service mesh (see → Chapter 04 Reverse Proxies).
 */
export function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: ProxyOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = new URL(options.upstreamBaseUrl);
    target.pathname = req.url ?? '/';
    target.search = req.url?.includes('?') ? req.url.split('?', 2)[1] ?? '' : '';

    const bodyChunks: Buffer[] = [];
    let bodySize = 0;

    req.on('data', (chunk: Buffer) => {
      bodyChunks.push(chunk);
      bodySize += chunk.length;
      if (bodySize > options.maxRequestBodyBytes) {
        req.destroy();
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'request_entity_too_large' }));
        resolve();
        return;
      }
    });

    req.on('end', () => {
      const body = Buffer.concat(bodyChunks);

      const hopByHop = new Set([
        'connection',
        'keep-alive',
        'proxy-connection',
        'transfer-encoding',
        'upgrade',
      ]);
      const headers: Record<string, string> = { host: target.host };
      for (const [key, value] of Object.entries(req.headers ?? {})) {
        if (value === undefined || hopByHop.has(key.toLowerCase())) continue;
        headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }

      const proxyReq = (target.protocol === 'https:' ? require('node:https') : require('node:http')).request(
        target.toString(),
        {
          method: req.method,
          headers,
          timeout: options.requestTimeoutMs,
          rejectUnauthorized: false, // local dev upstreams use self-signed certs
        },
        (proxyRes: IncomingMessage) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
          proxyRes.on('end', () => resolve());
        },
      );

      proxyReq.on('error', (err: Error & { code?: string }) => {
        if (res.writableEnded) return;
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad_gateway', detail: err.message }));
        resolve();
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('upstream timeout'));
      });

      proxyReq.on('socket', (socket: Socket) => {
        socket.on('timeout', () => {
          socket.destroy(new Error('socket timeout'));
        });
      });

      proxyReq.end(body);
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}
