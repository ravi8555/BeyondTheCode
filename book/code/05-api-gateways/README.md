# Chapter 05 — API Gateway (FormForge)

Runnable example: an Express-based API gateway that routes to three backend
services, enforces bearer-JWT auth, per-workspace rate limiting (Redis), and
proxies with timeouts and body caps.

## Run locally

```bash
npm install            # or npm ci
npm run build          # typecheck + emit to dist/
docker compose up      # gateway + redis + 3 stub upstreams
```

Then, in another terminal:

```bash
curl -i http://localhost:8080/healthz

# Mint a test JWT (matches JWT_SECRET in .env.example):
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'ws_1',role:'owner'},'your-256-bit-secret-here'))")

curl -i -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/forms/xyz
curl -i http://localhost:8080/api/forms/xyz            # 401 (no token)
```

## Scripts

- `npm run dev` — run gateway with tsx (watch)
- `npm run start` — run compiled `dist/server.js`
- `npm run build` — `tsc`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest test suite

## Project structure

```
src/
  config.ts       # typed config loader, fail-fast
  app.ts          # Express app: policy pipeline
  server.ts       # HTTP server + graceful shutdown
  stub.js         # plain-JS backend stub (used by docker-compose)
  gateway/
    route.ts      # path → upstream matching (+ SSRF guard)
    auth.ts       # bearer JWT validation
    rate-limit.ts # Redis fixed-window limiter (Lua)
    proxy.ts      # stream proxy with timeout + body cap
test/             # Vitest unit + integration tests
```

## Environment variables

See `.env.example`. Required: `REDIS_URL`, `JWT_SECRET`, `UPSTREAM_FORMS`,
`UPSTREAM_SUBMISSIONS`, `UPSTREAM_WEBHOOKS`.
