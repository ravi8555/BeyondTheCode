import http from 'node:http';

/**
 * Probes the Nginx load balancer once on localhost:8080.
 *
 * - Reachable: returns true (tests proceed).
 * - Unreachable + REQUIRE_INFRA=1: throws — CI fails loudly.
 * - Unreachable otherwise: warns loudly and returns false; suites register
 *   visible `SKIPPED:` suites so a green run never masquerades as validated.
 */
export async function probeLb(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 8080,
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
          'REQUIRE_INFRA=1 but Nginx LB is unreachable at http://127.0.0.1:8080',
        );
      }
      console.warn(
        '[tests] Nginx LB unreachable at http://127.0.0.1:8080 — integration suites will be SKIPPED. ' +
          'Run `docker compose up -d` and re-run; REQUIRE_INFRA=1 fails instead.',
      );
    }
    return ok;
  });
}
