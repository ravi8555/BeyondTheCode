import http from 'node:http';

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);

/**
 * Probes the Nginx reverse proxy once on localhost:PROXY_PORT.
 *
 * - Reachable: returns true (tests proceed).
 * - Unreachable + REQUIRE_INFRA=1: throws — CI fails loudly.
 * - Unreachable otherwise: warns loudly and returns false; suites register
 *   visible `SKIPPED:` suites so a green run never masquerades as validated.
 */
export async function probeProxy(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PROXY_PORT,
        path: '/healthz',
        method: 'GET',
        timeout: 1000,
      },
      (res: http.IncomingMessage) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  }).then(async (ok) => {
    if (!ok) {
      if (process.env.REQUIRE_INFRA === '1') {
        throw new Error(
          `REQUIRE_INFRA=1 but Nginx proxy is unreachable at http://127.0.0.1:${PROXY_PORT}`,
        );
      }
      console.warn(
        `[tests] Nginx proxy unreachable at http://127.0.0.1:${PROXY_PORT} — integration suites will be SKIPPED. ` +
          'Run `docker compose up -d` (or the host-level stack) and re-run; REQUIRE_INFRA=1 fails instead.',
      );
    }
    return ok;
  });
}

export function proxyBase(): string {
  return `http://127.0.0.1:${PROXY_PORT}`;
}
