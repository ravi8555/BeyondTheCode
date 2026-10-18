# Chapter 01 — Rate Limiting: Runnable Example

FormForge public submission API protected by a Redis-backed **sliding window counter** (atomic Lua), with a **token bucket** variant for plan quotas. Companion code for `book/01-traffic-management/01-rate-limiting.md`.

## Run

```bash
cp .env.example .env
docker compose up -d      # Redis 7
npm install
npm run dev               # http://localhost:3000

# 10 allowed, 11th rejected:
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    http://localhost:3000/v1/forms/f1/submissions \
    -H 'Content-Type: application/json' -d '{"q1":"hello"}'
done
```

## Test

```bash
npm run typecheck
REDIS_URL=redis://127.0.0.1:6379 npm test    # integration suites run
npm test                                     # without Redis: suites SKIP, visibly
REQUIRE_REDIS=1 npm test                     # CI mode: unreachable Redis FAILS the run
```

Integration suites probe Redis once (`test/helpers/redis.ts`): the probe is disconnected on failure, a `[tests] … SKIPPED` warning is printed, and each file registers a visible `SKIPPED:` suite — a green run without Redis never masquerades as validated Redis behavior.

## Honest notes

- Code targets Node 20+ / TypeScript 5 / Express 4 / ioredis 5 / Redis 7 (version assumptions; verify against official docs).
- Dependencies: `pino` (structured logging, justified by chapter 01 section 5) and a small in-process counter registry (`src/metrics.ts`) standing in for `prom-client` — same name+labels shape, no exposition endpoint.
- Production concerns beyond this example (metrics exposition, alerts, kill switch, HA Redis, headers-standard status) are listed in chapter 01, section 5.
