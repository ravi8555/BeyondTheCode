# Chapter 02 — Caching: Runnable Example

FormForge public form API with **cache-aside + stale-while-revalidate + negative caching + single-flight coalescing + TTL jitter** on Redis, PostgreSQL as origin. Companion code for `book/01-traffic-management/02-caching.md`.

## Run

```bash
cp .env.example .env
docker compose up -d     # Redis 7 + PostgreSQL 16 (auto-seeded via db/init.sql)
npm install
npm run dev              # http://localhost:3000

curl -si http://localhost:3000/v1/forms/contact-us | grep -E 'HTTP|X-Cache'   # MISS
curl -si http://localhost:3000/v1/forms/contact-us | grep -E 'HTTP|X-Cache'   # HIT
curl -si http://localhost:3000/v1/forms/nope-nope  | grep -E 'HTTP|X-Cache'   # MISS 404
curl -si http://localhost:3000/v1/forms/nope-nope  | grep -E 'HTTP|X-Cache'   # NEG 404
curl -s -X PATCH http://localhost:3000/v1/forms/contact-us \
  -H 'Content-Type: application/json' -d '{"title":"Contact Us v2"}'
curl -si http://localhost:3000/v1/forms/contact-us | grep X-Cache             # MISS again
```

*(The PATCH route addresses by slug — a documented minimal-example simplification; production addresses by UUID with authorization.)*

## Test

```bash
npm run typecheck
REQUIRE_INFRA=1 npm test   # CI: infra must be present or the run FAILS
npm test                   # local: infra suites skip VISIBLY when compose is down
```

## Honest notes

- Targets Node 20+ / TS 5 / Express 4 / ioredis 5 / pg 8 / Redis 7 / PostgreSQL 16 (version assumptions; verify against official docs).
- `src/metrics.ts` is a counter registry standing in for `prom-client` (same name+labels shape).
- The cross-instance stampede lease (SET NX) is deliberately left as Advanced Exercise 3 in the chapter; the committed `SingleFlight` is per-instance and says so.
- PATCH lacks auth on purpose — production requirements are listed in chapter 02, section 5.
