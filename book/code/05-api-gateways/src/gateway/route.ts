export interface Upstream {
  name: string;
  baseUrl: string;
}

export interface RouteMatch {
  upstream: Upstream;
  path: string;
}

/**
 * FormForge API Gateway routing table.
 *
 * The gateway is the single entry point for all client traffic. It inspects the
 * request path and forwards to the correct upstream service:
 *
 *   /api/forms/*          -> forms service  (public form schemas, builder CRUD)
 *   /api/submissions/*    -> submissions service (form fills, analytics)
 *   /api/webhooks/*       -> webhooks service (outbound delivery to customers)
 *   /api/healthz          -> local (gateway own health)
 *
 * Anything else is a 404. The gateway never proxies to an unknown host — this is
 * an SSRF guard: only the explicitly configured upstreams are reachable.
 */
export const ROUTES: { pattern: RegExp; upstream: Upstream }[] = [
  {
    pattern: /^\/api\/forms(?:\/|$)/,
    upstream: { name: 'forms', baseUrl: '' }, // filled from config at startup
  },
  {
    pattern: /^\/api\/submissions(?:\/|$)/,
    upstream: { name: 'submissions', baseUrl: '' },
  },
  {
    pattern: /^\/api\/webhooks(?:\/|$)/,
    upstream: { name: 'webhooks', baseUrl: '' },
  },
];

/**
 * Resolve the upstream for a request path. Returns null when no route matches.
 * Order matters: more specific patterns should be registered first.
 */
export function resolveRoute(pathname: string, upstreams: Record<string, Upstream>): RouteMatch | null {
  for (const { pattern, upstream } of ROUTES) {
    if (pattern.test(pathname)) {
      const resolved = upstreams[upstream.name];
      if (!resolved) {
        return null;
      }
      return { upstream: resolved, path: pathname };
    }
  }
  return null;
}
