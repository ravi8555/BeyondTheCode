# Chapter 04 — Reverse Proxies: Runnable Example

Nginx (open source, Layer 7) as a reverse proxy in front of **one FormForge API backend**. Demonstrates host/scheme/client-IP forwarding, path routing (`/api/*` vs `/` vs `/ws`), body-size limits, timeouts, WebSocket upgrade, security headers, and request correlation.

## Run (Docker)

```bash
cp .env.example .env
docker compose up -d --build   # Nginx proxy on :8080, API backend on :3001
docker compose config --quiet  # validate compose file (no daemon needed)

# Smoke through the proxy
curl -s http://localhost:8080/healthz            # proxy ok (answered by Nginx)
curl -s http://localhost:8080/                   # static edge content
curl -s http://localhost:8080/api/forms/f1       # {"id":"f1",...} via proxy
curl -s http://localhost:8080/api/echo           # forwarded Host/proto/IP view

# Simulate a backend failure (expect 502 through :8080, then recovery)
docker compose stop api
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/forms/f1
docker compose start api

docker compose down
```

## Run (host-level, no Docker daemon)

```bash
npm install
npm run build
PORT=3001 TRUST_PROXY=loopback node dist/server.js &   # backend on :3001
# copy rp-nginx/mime.types from your Nginx install, create *_temp dirs, then:
nginx -t -c $PWD/rp-nginx/nginx.conf                   # validate first, always
PROXY_PORT=8090 nginx -c $PWD/rp-nginx/nginx.conf      # proxy on :8090
PROXY_PORT=8090 npm test
nginx -s stop -c $PWD/rp-nginx/nginx.conf
```

Host-level listens on **:8090** (not :8080) so both stacks can coexist; `PROXY_PORT`
tells the probe and tests where the proxy lives.

## Test

```bash
npm run typecheck
REQUIRE_INFRA=1 npm test   # CI: infra must be present
npm test                   # local: visible skips if the proxy is down
```

Suites hit the proxy (`:8080` Compose, `:8090` host via `PROXY_PORT`) and the
backend `:3001` directly as a control. The probe helper warns and registers
visible `SKIPPED:` suites when Nginx is down; `REQUIRE_INFRA=1` fails CI instead.

## Inspect logs

```bash
docker compose logs proxy   # upstream errors, $upstream_status lines
docker compose logs api     # backend JSON lines
# host-level: rp-nginx/access.log uses the `rp` format:
# $remote_addr - $request_id ... up=$upstream_addr us=$upstream_status
```

## `trust proxy` note

Compose sets `TRUST_PROXY=loopback`, but the proxy arrives from the Docker
bridge — not loopback — so Express ignores the forwarded headers there and
`req.ip` reports the bridge address. Host-level runs share one loopback, so
forwarded Host/proto/IP reconstruct correctly. The chapter explains the fix
(restrict `trust proxy` to the proxy's address) and why blind trust enables
IP spoofing; the forwarded-headers suite asserts the proxy *appends*
(`X-Forwarded-For` keeps the forged entry AND the real peer — the app must
read the proxy-added tail, never the client-supplied head).

## Honest notes

- TLS termination is documented in the chapter but NOT run here (no certs in
  the repo); the `X-Forwarded-Proto` plumbing it depends on IS exercised.
- Upstream keepalive ships with the required `proxy_http_version 1.1` +
  cleared `Connection` (without them `keepalive` is silently ignored).
- Single-host simulation: demonstrates proxy *behavior*, not production
  performance.
