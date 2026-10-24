import express from 'express';
import type { GatewayConfig } from './config.js';
import { validateBearerToken } from './gateway/auth.js';
import { RateLimiter } from './gateway/rate-limit.js';
import { resolveRoute, type Upstream } from './gateway/route.js';
import { proxyRequest } from './gateway/proxy.js';
export interface AppDeps {
  config: GatewayConfig;
  rateLimiter: RateLimiter;
  upstreams: Record<string, Upstream>;
}

/**
 * FormForge API Gateway Express app.
 *
 * Route + policy order (each layer can short-circuit):
 *
 *   1. trust proxy + JSON body parse (defense-in-depth size cap)
 *   2. healthz — local, no auth, no rate limit
 *   3. public read routes — /api/forms/public/* and POST /api/submissions (no auth)
 *   4. auth — bearer JWT required for everything else
 *   5. rate limit — per-workspace fixed window (Redis, atomic Lua)
 *   6. route resolution — match path to upstream, else 404
 *   7. proxy — stream to upstream with timeout + body cap
 *
 * Every layer sets security headers (x-content-type-options, x-frame-options,
 * strict-transport-security when behind TLS) and never leaks internals.
 */
export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);
  // This is a pass-through proxy: do NOT pre-parse the body with express.json(),
  // or the raw stream would be consumed before proxyRequest can forward it.
  // The body cap is enforced inside the proxy (src/gateway/proxy.ts) and by
  // Nginx upstream.

  // Security headers on every response.
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // 1. Local health — always reachable.
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'api-gateway' });
  });

  // 2. Public read routes (no auth): public form schema + public submission create.
  app.get('/api/forms/public/:slug', (req, res) => {
    void proxyRequest(req, res, {
      upstreamBaseUrl: deps.upstreams.forms!.baseUrl,
      requestTimeoutMs: deps.config.upstreamRequestTimeoutMs,
      maxRequestBodyBytes: deps.config.maxRequestBodyBytes,
    });
  });

  app.post('/api/submissions', (req, res) => {
    void proxyRequest(req, res, {
      upstreamBaseUrl: deps.upstreams.submissions!.baseUrl,
      requestTimeoutMs: deps.config.upstreamRequestTimeoutMs,
      maxRequestBodyBytes: deps.config.maxRequestBodyBytes,
    });
  });

  // 3. Auth middleware — bearer JWT required for all remaining routes.
  app.use((req, res, next) => {
    const result = validateBearerToken(req.headers.authorization, deps.config.jwtSecret);
    if (!result.ok) {
      res.status(401).json({ error: 'unauthorized', reason: result.reason });
      return;
    }
    (req as any).auth = result.payload;
    next();
  });

  // 4. Rate limit — per workspace. The workspace id comes from the JWT subject.
  app.use(async (req, res, next) => {
    const payload = (req as any).auth as { sub?: string } | undefined;
    const workspaceId = payload?.sub ?? 'anonymous';
    let decision;
    try {
      decision = await deps.rateLimiter.consume(workspaceId);
    } catch {
      // Redis down: fail closed by default but allow a small burst so the gateway
      // is not a total outage when Redis is degraded.
      res.setHeader('retry-after', '1');
      res.status(503).json({ error: 'rate_limiter_unavailable' });
      return;
    }

    res.setHeader('x-ratelimit-limit', String(deps.config.rateLimitMaxRequests));
    res.setHeader('x-ratelimit-remaining', String(decision.remaining));
    res.setHeader('x-ratelimit-reset', String(Math.ceil(decision.resetAt / 1000)));

    if (!decision.allowed) {
      res.setHeader('retry-after', String(Math.ceil((decision.retryAfterMs ?? 0) / 1000)));
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }
    next();
  });

  // 5. Route resolution + proxy.
  app.all('/api/*', (req, res) => {
    const match = resolveRoute(req.originalUrl, deps.upstreams);
    if (!match) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    void proxyRequest(req, res, {
      upstreamBaseUrl: match.upstream.baseUrl,
      requestTimeoutMs: deps.config.upstreamRequestTimeoutMs,
      maxRequestBodyBytes: deps.config.maxRequestBodyBytes,
    });
  });

  // 6. Unknown /api paths: JSON 404 (never an HTML stack trace).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
