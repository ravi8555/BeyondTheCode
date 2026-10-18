# Chapter 02 — Caching

> **Part I — Traffic Management and Deployment**
> **Prerequisites:** Chapter 01 (Rate Limiting) is helpful but not required. Basic familiarity with HTTP headers and SQL SELECTs.
> **FormForge context:** `GET /v1/forms/:slug` serves published form schemas to anonymous respondents — FormForge's hottest read path (up to ~100k reads/day at the book's illustrative scale). Every cache decision in this chapter is made for that endpoint, and every staleness bug lands in a respondent's browser.

---

## 1. Definition and Fundamentals

### What it is

**Caching** is storing the result of an expensive computation or query somewhere cheaper and closer to the reader, and returning that stored copy for subsequent requests — until something makes the copy wrong or old enough to discard.

Every cache has three actors:

| Actor | Role | FormForge example |
|---|---|---|
| **Origin** | The authoritative source of truth | PostgreSQL `forms` table |
| **Cache** | The cheaper copy | Redis, CDN node, or the browser |
| **Key** | The address of a specific copy | `form:slug:contact-us` |

And three lifecycle questions you must always answer: *how does data get in* (populate), *how does it get out* (invalidate/expire), and *what happens when the copy is wrong* (staleness policy).

### Why it exists / what problem it solves

Reading a form schema from PostgreSQL might take ~1–5 ms on a healthy, indexed, warm system (hypothetical order of magnitude — measure yours). Reading it from Redis in the same data center is often sub-millisecond; from an edge/CDN node it is tens of milliseconds *of the user's distance* instead of your full round trip; from the browser, ~0 ms. Caching exists because **the cost of computing an answer usually dwarces the cost of storing it**, and because the same answers are requested over and over.

Caching solves four problems at once:

1. **Latency** — respondents get forms instantly; P95/P99 improves (→ Chapter 93).
2. **Throughput** — hits never reach PostgreSQL; a hot read path stops being the database's problem (→ Chapter 92).
3. **Cost** — fewer DB instances, fewer CPU-hours, less egress.
4. **Availability under load** — with a correctness plan, reads ride out origin slowdowns; caches are shock absorbers.

### How it works internally (first pass)

A **cache-aside** read — the dominant application-level pattern, and the one our implementation uses:

1. Request arrives for slug `contact-us`.
2. App computes the key and asks the cache: "got `form:slug:contact-us`?"
3. **Hit:** return the copy; PostgreSQL is never contacted.
4. **Miss:** query PostgreSQL, store the result with a **TTL** (time-to-live — discard after N seconds), return it.

Writes flip the script: update the database first, then **invalidate** (delete) the stale copy so the next read repopulates. Delete-on-write is almost always safer than update-in-place (Section 6; → Chapter 50).

### Where it fits in the architecture

Caching happens at *every* layer — the trick is knowing which layer answers which question:

```mermaid
graph LR
    B[Browser cache] --> E[CDN / edge cache]
    E --> G[Reverse proxy / API gateway cache]
    G --> A[App-level cache: Redis or in-process]
    A --> DB[(PostgreSQL)]
    DB -. internal buffers .-> DB
```

- **Browser/HTTP caching** (covered here; RFC 9111 semantics): `Cache-Control` decides what the *client* may reuse. Free latency if client-held copies are acceptable.
- **CDN / edge caching** (→ Chapter 48, 49): copies at PoPs worldwide; for public, cacheable GETs.
- **Gateway/proxy caching** (→ Chapter 04): Nginx `proxy_cache` etc.; transparent, no code changes.
- **Application cache** (this chapter's implementation): Redis or in-process memory; business-aware keys and invalidation.
- **Database caches** (buffer pool, etc.): you configure them; you rarely design them.

Analogy: **a library's reading desk vs. its warehouse.** The warehouse (PostgreSQL) has everything, but fetching a book takes minutes. The desk clerk (cache) keeps the most-requested books within arm's reach. When the author revises a book (write), the copy on the desk is *wrong* — so the clerk removes it (invalidation) or dates-stamps it and refreshes when the stamp ages (TTL/stale-while-revalidate). A clerk that never removes revised books eventually serves fiction as fact.

### A production example (FormForge)

FormForge serves the same JSON schema thousands of times per day per popular form, while a form's schema changes a few times per *month* — an illustrative read:write ratio near 10⁴:1. That is the caching sweet spot, so we deploy **cache-aside with a 60-second fresh TTL plus a 10-minute stale window** (Section 4). When an editor publishes a change (`PATCH /v1/forms/:id`), the app deletes the cached key — worst-case staleness for a respondent is the single request that raced the publish, measured in *seconds*, not the minutes a naive 10-minute TTL would cost.

### When it is necessary / when it is unnecessary

**Reach for a cache when:** the same data is read much more often than written; reads are measurably expensive (slow query, external API, heavy compute); latency targets outrun what the origin can deliver; or the origin must be shielded from spikes.

**Think twice when:**

- Data is read once ever — a cache adds a write and an eviction to save nothing.
- Writes dominate, or reads require strong freshness (you mostly buy staleness risk).
- The dataset is huge but per-item reads are already fast.
- You cannot articulate the invalidation story — the failure stories in Section 6 are what happen to teams that skip it.

**Honest framing:** caching does not make a system faster — it makes a system *serve precomputed answers*, trading freshness for speed. Every cache design is a staleness budget you choose on purpose.

## 2. Types, Variants, and Classifications

Two axes again: **the interaction pattern** (who moves data, when) and **the cache location** (what hardware/layer holds the copy).

### Axis 1: Interaction patterns

These five patterns are the established set; libraries and vendors describe themselves in these terms (AWS's caching-strategy docs use exactly this vocabulary).

#### 2.1 Cache-Aside (Lazy Loading)

The *application* orchestrates: on read, check cache, on miss load from DB and populate; on write, update DB then delete the cache entry.

- **How it works:** shown step-by-step in Section 1 and implemented in Section 4.
- **Advantages:** only data actually requested gets cached (no wasted prefetching); a failed cache never corrupts the DB — the worst case of a cache outage is degraded performance; cache and DB schemas can differ completely.
- **Disadvantages:** the first request after any miss pays the full DB cost (cold cache = thundering herd risk, Section 6); invalidation logic lives in *your* code, scattered across every write path — miss one and you have a staleness bug.
- **Use cases:** the default for application-level caching of DB reads. **This is what FormForge uses.**

#### 2.2 Read-Through

The *cache itself* loads from the origin on miss; the app only ever talks to the cache. Think of cache-aside with the loading logic moved behind a cache API (`cache.get(key, loaderFn)`).

- **Advantages:** load logic is centralized in one wrapper — easier to keep correct than scattered cache-aside code; consistent populate policy (single TTL writer).
- **Disadvantages:** the cache layer now needs DB credentials and query logic (a bigger security/complexity surface); many Redis-based setups don't do this natively, so you build the wrapper anyway (which is *our* Section 4 wrapper — read-through in shape, cache-aside in mechanics).
- **Use cases:** caching libraries with loader support (Node-cache wrappers, Caffeine in Java, groupcache-style designs).

#### 2.3 Write-Through

On write: write to the cache *and* the DB in the same flow (cache-first or DB-first, both kept in sync synchronously).

- **Advantages:** reads always find fresh data; no invalidation-after-write race — the value is simply *there*.
- **Disadvantages:** every write pays cache-write latency; you populate entries that may never be read; the two writes are not atomic (a crash between them = divergence; you need a repair story).
- **Use cases:** read-heavy data whose write path already tolerates extra latency; systems where the cache *is* the primary serving store with the DB as durability log.

#### 2.4 Write-Back (Write-Deferred)

Writes go to the cache/queue; the cache flushes to the DB asynchronously (or on eviction).

- **Advantages:** very fast write path; absorbs write bursts (the cache becomes a write buffer — related to → Chapter 44, Backpressure).
- **Disadvantages:** **data loss window**: crash before flush = acknowledged writes that never reached the DB. This is a durability trade, not an implementation detail. Divergence detection and replay are mandatory.
- **Use cases:** telemetry/metrics buffers, session stores you can reconstruct, game state. Rarely appropriate as a *primary-DB* cache pattern for money or user data.
- **Warning:** if a tutorial shows you write-back without a durability discussion, it is teaching a shape, not a production design.

#### 2.5 Write-Around

Writes go straight to the DB, *bypassing* the cache; the cache fills only on subsequent reads.

- **Advantages:** no cache write per insert; right for data written once, read rarely (bulk ingest).
- **Disadvantages:** the data just written is uncached — the write's own readers pay DB cost; combined with long TTLs it can *thunder* when many cold items get read at once.
- **Use cases:** event archives, audit logs, form submissions (FormForge writes submissions straight to PostgreSQL; we never write-cache them — we cache the *form definitions* they reference).

#### Pattern comparison

| Pattern | Read cost (warm) | Write cost | Staleness risk | Data-loss risk | Complexity |
|---|---|---|---|---|---|
| Cache-aside | Low (hit) | + delete | After write until invalidation lands | None (DB first) | Low-medium |
| Read-through | Low (hit) | — | Same as cache-aside | None | Medium (loader in cache layer) |
| Write-through | Low | + cache write | Minimal | None (both written) | Medium |
| Write-back | Low | Cache only | Until flush | **Yes — until flushed** | High |
| Write-around | Low (after first read) | Unchanged | None | None | Low, but cold-read storm risk |

### Decision guide (patterns)

1. **Default: cache-aside on reads + delete-on-write.** It is the pattern with the best effort/benefit ratio and the friendliest failure mode (cache down ⇒ slow, not wrong).
2. Choose **read-through** when you can centralize loading in one cache API and want a single place to own TTLs.
3. Choose **write-through** when read-after-write freshness matters and the write path can afford +cache latency (e.g., a form's editor preview).
4. Choose **write-around** for write-once/read-rarely data (submissions, logs).
5. Choose **write-back** only with explicit acknowledgment of the durability window — and usually only for reconstructible data.

### Axis 2: Cache locations

| Location | What it is | Latency added | Scope | Invalidation control | Best for |
|---|---|---|---|---|---|
| **Browser** | Client stores response per HTTP cache rules | ~0 | Per user's device | Headers only (you cannot delete a copy already on the device) | Static assets, cacheable GETs with safe keys |
| **CDN / edge** | Shared caches at PoPs worldwide | ~5–50 ms (user distance) | Global | TTLs + purge APIs (purge propagation is seconds-to-minutes, provider-dependent) | Public, high-fanout GETs (→ Ch 48, 49) |
| **Reverse proxy** | Nginx/Envoy cache in your DC | ~0.5–2 ms | Per DC | Config + purge | Transparent API response caching |
| **In-process (app memory)** | `Map`/LRU inside each instance | ~microseconds | Per instance only | Code | Micro-caches, hot config, session snippets |
| **Distributed (Redis/Memcached)** | Shared cache in your DC | ~0.3–2 ms | Per DC/region | Your code, exactly | Application data cache — **FormForge's choice** |
| **Database** | Buffer pool / plan cache inside the DB | ~0 | Per DB | Automatic | Everything, invisibly — tune, don't design |

**Multi-instance reality check:** in-process caches are *N caches with N views*. Each instance has its own copy, its own TTL clock, its own eviction. That is acceptable for micro-caching tolerable staleness; it is a correctness trap for anything stricter (→ Ch 46). A shared Redis gives *one* logical copy and one invalidation point per DC — at the cost of a network hop and another system to operate (Section 5).

### Axis 3: Key design (the part nobody teaches)

A cache key is a **contract**: identical keys ⇒ identical data. Design rules that prevent the Section 6/7 failures:

| Rule | Why | Example (FormForge) |
|---|---|---|
| Namespace by entity + version | Collisions across features are silent corruption | `form:v1:slug:contact-us` |
| Include everything that changes the response | A key missing the locale/variant serves the wrong variant | `form:v1:slug:contact-us:locale:de` |
| Bound the key space | User-supplied fragments unbounded ⇒ memory blowup (cf. Ch 01, Case 7) | slug validated `^[a-z0-9-]{1,64}$` |
| Never put secrets in keys | Keys are visible in `redis-cli`, logs, dashboards | hash session IDs if they must appear |
| Separate public/private caches | Mixing authorization-sensitive data is a leak vector (Section 6, case 5) | `form:public:…` vs `workspace:private:…` |

### TTLs, eviction, and the numbers that matter

- **TTL** is your simplest invalidation tool: "good enough for N seconds." Choose TTL from *acceptable staleness*, not from habit. FormForge form schemas: 60 s fresh + stale window; plan pricing: 5 s; anything billing-adjacent: no cache or a write-through with explicit freshness.
- **Eviction** — when memory is full, something must go. Redis's `maxmemory-policy` choices include `allkeys-lru` (evict least-recently-used across all keys — the common cache default), `volatile-lru` (only keys with a TTL), `noeviction` (writes fail when full). This choice interacts dangerously with co-tenancy: an LRU cache sharing an instance with your rate-limit counters or queue keys (→ Ch 01) can have *those* keys evicted, silently weakening other subsystems. Dedicated instances for dedicated purposes.
- **Hit ratio** = `hits / (hits + misses)`. The cache's headline metric (Section 9 shows why it can also mislead).
- **Memory sizing**: `entries × (key + value + Redis overhead)` — Redis overhead per key is real (roughly tens of bytes plus encoding; measure with `MEMORY USAGE` rather than trusting blog numbers). Values should be *small*: cached rows, not whole responses with HTML.

### Decision guide (locations)

1. **Static assets** → CDN + long TTL + content-hash filenames (immutable).
2. **Public JSON GETs with seconds-level staleness OK** → CDN/edge if fanout is global (→ Ch 48/49); Redis app cache if not.
3. **Per-user or authorization-sensitive reads** → app cache in Redis with *private* cache headers (`Cache-Control: private, no-store` for the truly sensitive) and per-tenant keys.
4. **Tiny, extremely hot, tolerates per-instance staleness** → in-process micro-cache (seconds), *always* with a size bound.
5. **Config/feature flags** → in-process with short TTL + pub/sub invalidation (→ Ch 51).

## 3. Internal Working and Architecture

### Cache-aside read: request by request (FormForge `GET /v1/forms/:slug`)

1. Request arrives; validate the slug (`^[a-z0-9-]{1,64}$` — bounded keys, Section 2).
2. Build key `form:v1:slug:{slug}`.
3. `GET key` in Redis. Three outcomes:
   - **Fresh hit** (`storedAt + freshTtl > now`): attach `X-Cache: HIT`, return the cached JSON. Done — no PostgreSQL contact.
   - **Stale hit** (fresh window passed, Redis TTL not yet): attach `X-Cache: STALE`, return the copy *immediately*, and kick off a **background refresh** (single-flight coalesced — see below). This is **stale-while-revalidate** (SWR): users never wait; one request per key per stale window pays the refresh.
   - **Miss / negative hit**: fall through to step 4. A **negative hit** is a cached "this slug does not exist" (short TTL) — it turns attacker-driven 404 probing from DB traffic into cache traffic (Section 6, case 2).
4. On true miss, enter the **single-flight** guard for the key: if another request in *this instance* is already loading the same key, await *its* promise instead of issuing a second query (this is request coalescing; Section 6 case 1 shows what happens without it).
5. Query PostgreSQL (`SELECT ... WHERE slug = $1 AND published`), parameterized as always (→ Ch 78).
6. Result found → `SET key {kind:'form', value, storedAt} EX (freshTtl + staleWindow + jitter)`. Not found → `SET key {kind:'negative'} EX negativeTtl`.
7. Respond 200 or 404; headers `X-Cache: MISS`.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant R as Redis
    participant DB as PostgreSQL
    C->>A: GET /v1/forms/contact-us
    A->>A: key = form:v1:slug:contact-us
    A->>R: GET key
    alt fresh hit
        R-->>A: {kind:form, value, storedAt}
        A-->>C: 200 (X-Cache: HIT)
    else stale hit
        R-->>A: entry older than freshTtl
        A-->>C: 200 (X-Cache: STALE)
        A->>A: single-flight refresh (async)
        A->>DB: SELECT (background)
        A->>R: SET fresh copy
    else miss / negative
        R-->>A: nil or {kind:negative}
        A->>A: single-flight join or start
        A->>DB: SELECT slug
        alt row found
            DB-->>A: form row
            A->>R: SET {kind:form, storedAt}
            A-->>C: 200 (X-Cache: MISS)
        else not found
            DB-->>A: empty
            A->>R: SET {kind:negative} EX 30
            A-->>C: 404 (X-Cache: MISS)
        end
    end
```

### Write path: publish → invalidate

`PATCH /v1/forms/:id` (editor saves/publishes):

1. Authorize (workspace member), validate payload.
2. `UPDATE forms SET schema_json=$1 ... WHERE id=$1` — the DB is the source of truth and is updated *first* (cache-aside invariant).
3. `DEL form:v1:slug:{slug}` — delete, don't overwrite (overwrite races: a slow reader's stale SELECT can land *after* your write and re-populate the old value; delete only ever forces the next reader to refetch — the failure mode of delete is a miss, the failure mode of overwrite can be permanent staleness. → Chapter 50 covers versioned keys and the deeper zoo).
4. Respond 200. The next GET is a MISS and repopulates fresh data. Readers racing steps 2–3 may serve ≤1 old copy — bounded, self-healing staleness.

### The three cache diseases (mechanics before the Section 6 case studies)

```mermaid
flowchart TB
    subgraph stampede [Stampede / Thundering herd]
        S1[Key expires] --> S2[N concurrent misses] --> S3[N parallel DB queries for ONE key]
    end
    subgraph penetration [Penetration]
        P1[Requests for keys that never existed] --> P2[Every request hits the DB] --> P3[Attacker scales it with random keys]
    end
    subgraph avalanche [Avalanche]
        V1[Mass TTL expiry - e.g. bulk load with same TTL] --> V2[Hit ratio collapses at once] --> V3[DB absorbs full traffic]
    end
```

Mitigations live at three altitudes, all implemented or referenced in this chapter: **coalescing** (one loader per key — Section 4), **negative caching + key validation** (Section 4), **TTL jitter** (Section 4), **SWR** (serve stale while refreshing), and, for cross-instance herds, distributed locks (→ Ch 38) or CDN request collapsing (→ Ch 49).

### Complexity and resource use

| Operation | Time | Notes |
|---|---|---|
| GET/SET/DEL in Redis | O(1) | Network RTT dominates (same lesson as Ch 01) |
| Single-flight join | O(1) map ops | Per instance only |
| JSON serialize/deserialize | O(value size) | Keep values small; this is why we cache rows, not pages |
| LRU eviction (Redis approximated LRU) | ~O(1) sampled | Redis uses *approximated* LRU (sampled keys) — documented behavior, not exact LRU |

### Important configuration parameters

| Parameter | FormForge value | Guidance |
|---|---|---|
| `freshTtl` | 60 s | = acceptable staleness for published forms; set from product, not habit |
| `staleWindow` (SWR) | +9 min (Redis TTL ≈ 10 min) | Total copy lifetime; bounds worst-case staleness if refreshes fail |
| `negativeTtl` | 30 s | Short: newly published slugs become visible fast |
| TTL jitter | ±10 % of TTL | Breaks synchronized expiry (avalanche prevention) |
| Key namespace | `form:v1:` | Version bump = coordinated mass invalidation without SCAN |
| Redis timeouts | 100 ms command timeout | Cache must fail fast; a slow cache is worse than no cache |
| Failure mode | fail-open to DB | Cache outage ⇒ degraded latency, never errors (Section 5) |

## 4. Practical Implementation

We build the FormForge public form endpoint with **cache-aside + SWR + negative caching + single-flight coalescing + TTL jitter** on Redis, backed by real PostgreSQL. Full project: [`book/code/02-caching/`](../code/02-caching/). **Runnable** — validated in this environment (Section 4 "Execution" shows what was run).

### Scenario

`GET /v1/forms/:slug` is the hottest read path. Make it fast under repeated reads, keep PostgreSQL out of the hot path, survive publish-invalidation correctly, and not fall over when keys expire or attackers probe random slugs.

### Requirements

**Functional**
- Cache-aside read of published form schemas in Redis; `X-Cache: HIT|STALE|MISS|NEG` headers.
- SWR: serve stale copies up to `staleWindow` while refreshing in the background, coalesced per key.
- Negative caching for unknown slugs (30 s TTL).
- Publish path (`PATCH /v1/forms/:id`) updates PostgreSQL then deletes the cache key.
- TTL jitter (±10 %) on every write.
- Fail-open: Redis errors degrade to direct DB reads with structured logs + metrics — never 5xx.

**Non-functional**
- Hit path adds one Redis round trip; miss path adds one Redis GET + one SET.
- No unbounded memory: every key TTLs; slug validation bounds the key space.
- Integration tests use deterministic seeds; no `sleep`-based timing where avoidable.

### Technology stack

| Piece | Choice | Note |
|---|---|---|
| Runtime | Node 20+ (ESM) | |
| Web | Express 4.x | |
| Cache | Redis 7 via ioredis 5.x | command timeout 100 ms |
| Database | PostgreSQL 16 via `pg` 8.x | pool max 10; parameterized SQL |
| Logs/metrics | pino + counter registry | same pattern as Chapter 01's project |
| Tests | Vitest 2.x + supertest | infra suites self-skip when down; `REQUIRE_INFRA=1` fails CI loudly |

### Project structure

```
02-caching/
├── docker-compose.yml     # redis:7-alpine + postgres:16-alpine (seeded)
├── db/init.sql            # forms table + 3 published forms
├── package.json / tsconfig.json / .env.example
├── src/
│   ├── config.ts          # typed env, fail-fast
│   ├── logger.ts / metrics.ts
│   ├── db.ts              # pg Pool, getFormBySlug, updateFormSchema
│   ├── cache/
│   │   ├── redis-cache.ts # get/set/del + ttl jitter helper
│   │   └── single-flight.ts
│   ├── form-cache.ts      # the design: cache-aside + SWR + negative
│   ├── app.ts             # routes wired to form-cache
│   └── server.ts
└── test/
    ├── single-flight.test.ts   # pure unit
    ├── form-cache.test.ts      # integration (Redis + PG)
    └── api-caching.test.ts     # end-to-end HIT/MISS/NEG + invalidation
```

### Configuration

`.env.example`:

```bash
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
DATABASE_URL=postgres://formforge_dev:formforge_dev@127.0.0.1:5432/formforge
TRUST_PROXY=loopback
FORM_FRESH_TTL_MS=60000        # product decision: 60s acceptable staleness
FORM_STALE_WINDOW_MS=540000    # +9min SWR window (Redis TTL ~10min+jitter)
FORM_NEGATIVE_TTL_MS=30000
CACHE_TTL_JITTER_RATIO=0.1     # ±10%
```

`docker-compose.yml` (Redis for cache, PostgreSQL for origin — both seeded):

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server", "--save", "", "--appendonly", "no"]  # cache data is disposable
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: formforge_dev
      POSTGRES_PASSWORD: formforge_dev   # local dev only; real secrets live in a vault (Ch 67)
      POSTGRES_DB: formforge
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
```

`db/init.sql` — the origin table (subset of the book-wide schema; → Ch 25 for real indexes):

```sql
CREATE TABLE forms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  schema_json   jsonb NOT NULL,
  published     boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forms_published_slug_idx ON forms (slug) WHERE published;  -- hot query

INSERT INTO forms (slug, title, schema_json, published) VALUES
  ('contact-us', 'Contact Us', '{"fields":[{"id":"email","type":"email"}]}', true),
  ('event-rsvp', 'Event RSVP', '{"fields":[{"id":"name","type":"text"}]}', true),
  ('nps-quarterly', 'Quarterly NPS', '{"fields":[{"id":"score","type":"number"}]}', true);
```

### Implementation

**`src/cache/redis-cache.ts`** — thin wrapper with the jitter helper. Jitter matters: bulk-loaded keys with identical TTLs expire together (avalanche, Section 6 case 3).

```typescript
import type { Redis } from 'ioredis';

export interface CacheEntry {
  v: 1;
  kind: 'form' | 'negative';
  value: { id: string; slug: string; title: string; schema: unknown } | null;
  storedAt: number; // epoch ms — freshness is computed from this, not Redis TTL
}

/** Symmetric ±ratio spread: uniform in [ttl*(1-ratio), ttl*(1+ratio)] —
 *  ratio 0.1 => [900, 1100] for a 1000 ms TTL (avalanche prevention, s.6 case 3). */
export function jitter(ttlMs: number, ratio = 0.1, rand = Math.random): number {
  return Math.max(1, Math.round(ttlMs * (1 - ratio + 2 * ratio * rand())));
}

export class RedisCache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  }

  async set(key: string, entry: CacheEntry, ttlMs: number): Promise<void> {
    // TTL covers the ENTIRE lifetime (fresh + stale windows); freshness is
    // enforced by storedAt so SWR decisions stay app-side and testable.
    await this.redis.set(key, JSON.stringify(entry), 'PX', jitter(ttlMs));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key); // delete-on-write (Section 3: never overwrite)
  }
}
```

**`src/cache/single-flight.ts`** — request coalescing: N concurrent misses on one key ⇒ **one** loader call. *Per instance only* — cross-instance herds need a distributed guard (→ Ch 38) or are bounded by SWR (Section 6, case 1).

```typescript
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;              // join the in-flight load
    const p = fn().finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, p);
    return p;
  }
  get size(): number { return this.inflight.size; }
}
```

**`src/form-cache.ts`** — the design itself: cache-aside + SWR + negative caching + coalescing + fail-open, metrics on every outcome. The committed file is authoritative; this is the complete decision logic with comments trimmed:

```typescript
export type ReadResult =
  | { kind: 'form'; source: 'hit' | 'stale' | 'miss'; form: FormRow }
  | { kind: 'not_found'; source: 'hit' | 'miss' };

export class FormCache {
  private readonly flight = new SingleFlight();
  constructor(private readonly deps: CacheDeps) {}

  async getBySlug(slug: string): Promise<ReadResult> {
    const { cache, store, freshTtlMs, staleWindowMs, negativeTtlMs, metrics } = this.deps;
    const now = this.now();                       // injectable clock (tests)
    const key = `form:v1:slug:${slug}`;
    const entry = await this.safeGet(key);        // fail-open on Redis errors

    if (entry?.kind === 'form' && entry.value) {
      const age = now - entry.storedAt;
      if (age <= freshTtlMs) {                    // FRESH HIT
        metrics.inc('cache_requests_total', { result: 'hit' });
        return { kind: 'form', source: 'hit', form: entry.value };
      }
      if (age <= freshTtlMs + staleWindowMs) {    // STALE HIT (SWR)
        metrics.inc('cache_requests_total', { result: 'stale_hit' });
        void this.refresh(slug).catch(() => undefined); // background, coalesced
        return { kind: 'form', source: 'stale', form: entry.value };
      }
    }
    if (entry?.kind === 'negative') {             // NEGATIVE HIT
      metrics.inc('cache_requests_total', { result: 'negative_hit' });
      return { kind: 'not_found', source: 'hit' };
    }

    // TRUE MISS: one loader per key per instance.
    const form = await this.flight.do(key, () => this.loadAndStore(slug));
    metrics.inc('cache_requests_total', { result: 'miss' });
    return form
      ? { kind: 'form', source: 'miss', form }
      : { kind: 'not_found', source: 'miss' };
  }

  /** Coalesced refresh: shared key means a foreground miss and a background
   *  refresh of the same slug join into ONE query. */
  private refresh(slug: string): Promise<unknown> {
    return this.flight.do(`form:v1:slug:${slug}`, () => this.loadAndStore(slug));
  }

  private async loadAndStore(slug: string): Promise<FormRow | null> {
    const { cache, store, freshTtlMs, staleWindowMs, negativeTtlMs, jitterRatio } = this.deps;
    const form = await store.getBySlug(slug);     // parameterized SQL in db.ts
    const storedAt = this.now();
    if (form) {
      await this.safeSet(`form:v1:slug:${slug}`,
        { v: 1, kind: 'form', value: form, storedAt },
        jitter(freshTtlMs + staleWindowMs, jitterRatio));
    } else {
      await this.safeSet(`form:v1:slug:${slug}`,
        { v: 1, kind: 'negative', value: null, storedAt },
        jitter(negativeTtlMs, jitterRatio));
    }
    return form;
  }

  /** Delete-on-write. A failed DEL does not fail the write — the TTL is the
   *  backstop; the error is logged and counted. */
  async invalidate(slug: string): Promise<void> {
    try { await this.deps.cache.del(`form:v1:slug:${slug}`); }
    catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'del' });
      this.deps.logger.warn({ event: 'cache_del_error', slug, error: (err as Error).message });
    }
  }

  private async safeGet(key: string) {
    try { return await this.deps.cache.get(key); }
    catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'get' });
      this.deps.logger.warn({ event: 'cache_get_error', error: (err as Error).message });
      return null;                                 // fail-open → DB path
    }
  }
  private async safeSet(key: string, entry: CacheEntry, ttlMs: number) {
    try { await this.deps.cache.set(key, entry, ttlMs); }
    catch (err) {
      this.deps.metrics.inc('cache_errors_total', { op: 'set' });
      this.deps.logger.warn({ event: 'cache_set_error', error: (err as Error).message });
    }
  }
}
```

**`src/app.ts`** wires the routes (committed file): `GET /v1/forms/:slug` validates the slug against `^[a-z0-9-]{1,64}$` **before** it becomes part of a cache key, maps `ReadResult` to `200/404` + `X-Cache` header; `PATCH /v1/forms/:id` runs the parameterized `UPDATE` (by id, authorized against `workspace_id` — omitted auth stub is flagged in comments), then `invalidate(slug)`; `/healthz` checks Redis + PG with short timeouts. `src/db.ts` owns the `pg` Pool (`max 10`, `statement_timeout` set) and the two parameterized queries.

### Execution

```bash
cd book/code/02-caching
cp .env.example .env
docker compose up -d        # Redis 7 + PostgreSQL 16 (auto-seeded)
npm install
npm run dev                 # http://localhost:3000

# First request: MISS. Second: HIT. Same schema both times.
curl -si http://localhost:3000/v1/forms/contact-us | grep -E 'HTTP|X-Cache'
curl -si http://localhost:3000/v1/forms/contact-us | grep -E 'HTTP|X-Cache'

# Unknown slug twice: MISS then NEG (negative cache working).
curl -si http://localhost:3000/v1/forms/nope-nope | grep -E 'HTTP|X-Cache'
curl -si http://localhost:3000/v1/forms/nope-nope | grep -E 'HTTP|X-Cache'

# Invalidate via publish: next read is a fresh MISS again.
# (PATCH route addresses by slug in this minimal example — see note below.)
curl -s -X PATCH http://localhost:3000/v1/forms/contact-us \
  -H 'Content-Type: application/json' -d '{"title":"Contact Us v2"}'
curl -si http://localhost:3000/v1/forms/contact-us | grep X-Cache   # MISS
```

*(The committed PATCH route addresses forms by slug in this minimal example — a deliberate simplification; production addresses by UUID with authorization. Both shapes appear in the repo comments.)*

### Testing

1. **Unit, no infra** — `single-flight.test.ts`: 100 concurrent `do()` calls on one key invoke the loader **exactly once**; different keys run in parallel; a rejected loader removes the entry so the next caller retries (a poisoned in-flight promise would cache the failure forever).
2. **Integration, real Redis + PG** (self-skipping with visible `SKIPPED:` suites; `REQUIRE_INFRA=1` fails CI when infra is expected) — `form-cache.test.ts`:
   - MISS then HIT for a seeded slug; `dbCallCount` via a counting `FormStore` proxy proves the DB is contacted once.
   - Negative caching: unknown slug → miss; second read → `negative_hit`, zero extra DB calls.
   - SWR with the **injectable clock**: set `now` past `freshTtl`, read → `stale`; await refresh; read → `hit` with the new value. No sleeps.
   - Jitter bounds: `jitter(1000, 0.1, rand)` never returns outside `[900, 1100]` (deterministic `rand` injection).
   - Fail-open: cache set/get throwing (fake `RedisCache`) ⇒ reads still succeed from DB, `cache_errors_total` increments.
3. **End-to-end** — `api-caching.test.ts` (supertest): the MISS→HIT→PATCH→MISS sequence above, `X-Cache` asserted at each step; slug validation rejects `../etc` style keys with 400 before any Redis/DB access.

```bash
npm run typecheck
REQUIRE_INFRA=1 npm test    # CI: infra present or fail loudly
npm test                    # local: skips visibly if compose is down
```

### Expected result (representative)

```
GET /v1/forms/contact-us  -> 200  X-Cache: MISS   (~db query, tens of ms cold)
GET /v1/forms/contact-us  -> 200  X-Cache: HIT    (redis only, sub-ms warm)
GET /v1/forms/nope-nope   -> 404  X-Cache: MISS
GET /v1/forms/nope-nope   -> 404  X-Cache: NEG
PATCH ... (publish)       -> 200
GET /v1/forms/contact-us  -> 200  X-Cache: MISS   (invalidated, repopulated)
```

*Representative output of the executed tests described above; absolute latencies vary by machine.*

### Explanation of key decisions

- **Freshness via `storedAt`, lifetime via Redis TTL** — two clocks, two jobs: the app decides *fresh/stale*; Redis guarantees *cleanup*. Testing SWR needs only a fake clock, never `sleep`.
- **Single shared flight key for miss and refresh** — a foreground miss concurrent with a background refresh performs one query, not two.
- **Delete-on-write, TTL as backstop** — a failed invalidation decays into bounded staleness, never permanent wrongness (Section 6, case 4).
- **Negative cache short and jittered** — long negative TTLs delay *legitimate* first reads of newly published forms; 30 s bounds that cost while still blunting 404 floods.
- **Everything observable** — `cache_requests_total{result}` and `cache_errors_total{op}` are the two series the Section 5 dashboards and alerts are built on.

## 5. Production-Ready Implementation

### Correctness and invalidation at scale

- **Enumerate every write path that changes a cached read.** For `form:v1:slug:*`: schema edits, publish/unpublish, title changes, workspace-level settings that alter rendering. Each needs the invalidation call. Missing one is the classic "user saw their old form for 10 minutes" ticket (→ Chapter 50 turns this into a systematic method: versioned keys, changefeeds, pub/sub invalidation).
- **Cross-instance invalidation is free with Redis** (one DEL hits everyone) — and *impossible to fake with in-process caches* (you'd need broadcast invalidation; see Section 7, anti-pattern 5).
- **Multi-region:** a Redis per region means an invalidation must fan out (→ Ch 86); TTLs become your correctness backstop, so *set them from the staleness budget*, not from performance mood.
- **Stampede across instances** (our single-flight is per-instance): options in increasing power — SWR (bounds the herd to the stale window), jittered TTLs, `SET NX` refresh locks in Redis, or CDN-level request collapsing (→ Ch 38, 49).

### Security and access control

- **Never cache authorization-sensitive responses where another tenant could read them.** Rules of thumb: public endpoints ⇒ cache freely with public keys; authenticated endpoints ⇒ cache in *private* space with per-user/per-tenant keys and `Cache-Control: private`; tokens/PII responses ⇒ `no-store` (→ Ch 76 on CORS, Ch 77 CSRF — cached POSTs are almost always wrong).
- **Key injection:** user input flows into keys — validate and bound it (Section 4 does; an unvalidated `slug` is a memory-leak vector and a cache-poisoning surface, Section 6 case 5).
- **Cache poisoning** also arrives via *shared proxies*: anything CDN/proxy-cached must be keyed on `Host` + full path + vary headers (`Vary`), or one tenant's response can be served to another (→ Ch 48 for CDN-specific mechanics).

### Configuration, secrets, resource management

- TTLs are **product decisions in config** (env/flags), not constants in code; changing staleness tolerance should not require a deploy (→ Ch 51).
- Redis/PG URLs are secrets (→ Ch 67); the compose credentials here are local-dev only.
- Size the cache: `peak_keys × avg(MEMORY USAGE)` with 30 % headroom; set `maxmemory` with an eviction policy chosen *for a cache instance* (`allkeys-lru`), and keep rate-limit/queue keys on separate instances (the co-tenancy trap from Section 2).
- Keep values small: cache the row, not the rendered page; cap JSON size (a 5 MB "cache entry" is a latency and memory incident).

### Timeouts, failure handling, graceful degradation

- Redis: 100 ms command timeout, one shared connection, `maxRetriesPerRequest` low — a *slow* cache is worse than a missing one because it occupies request slots (→ Ch 11, Timeouts; Ch 44, Backpressure).
- **Fail-open everywhere on the read path**: cache errors ⇒ DB reads + `cache_errors_total` + warn log. The DB must be sized for the "cache is down" scenario — run that math (Section 8) *before* you need it.
- `/healthz` checks the cache only as a *readiness nuance*, never as a hard dependency — the app can serve correct traffic without Redis.

### Observability (the part that makes it operable)

| Metric | Type | Use |
|---|---|---|
| `cache_requests_total{result=hit\|stale_hit\|miss\|negative_hit}` | counter | hit ratio = (hit+stale_hit+negative_hit)/total; watch *per route* |
| `cache_errors_total{op=get\|set\|del}` | counter | **alert** — silent fail-open detection (Ch 01 lesson reused) |
| `cache_refresh_duration_seconds` | histogram | background refresh health (SWR) |
| `db_query_total{route}` | counter | proves the cache is actually shielding the DB |

Dashboards: hit ratio next to P95 latency per route; miss-rate spikes usually explain latency spikes before any DB metric moves. Alerts (→ Ch 62): store-error rate > 0 sustained; hit ratio collapse (misconfig, cold deploy, key change); negative-hit ratio spike (404 flood — abuse signal). Structured logs on cache errors with `event`, never with full keys containing user data (hash them).

### Deployment and rollback

- **Deploys that change key formats** (`form:v1:` → `form:v2:`) cold the cache deliberately — do it behind a flag, off-peak, with the DB load graph open (→ Ch 53 canary).
- Rollback story: config-level TTL reduction is your fastest lever; key-namespace version bump is your "nuclear" invalidation.
- Cache warming: after a deploy or outage, optionally pre-read the top-N forms (by access log) into the cache so the first users don't pay the herd (Section 6 case 1).

### Cost and operational complexity

- Redis is cheap until it is large; the real cost is **operating another stateful system** (→ Ch 88 for cost discipline): memory right-sizing, eviction forensics, failover drills. Managed Redis usually wins before specialist scale.
- Often the cheapest big win is *not* a new Redis: enable CDN caching for the public GET (free at the edge tier) and keep the app cache for authenticated paths (→ Ch 48).

### Testing and maintainability

- The injectable clock and swappable `refresh` in `FormCache` are the maintainability story: every staleness behavior is a deterministic test, not a flaky sleep (Section 9).
- Contract test for any cached endpoint: *response bytes for a given key are identical whether served from cache or DB* (modulo timestamps).

## 6. Edge Cases and Failure Scenarios

Eight cases, each: scenario → cause → impact → detect → prevent → test.

### Case 1 — Stampede (thundering herd) on key expiry

- **Scenario:** the form's cached entry expires at 12:00:00; 500 concurrent respondents are mid-flight; 400 arrive within the same 200 ms; all miss; 400 identical `SELECT`s hit PostgreSQL at once; DB CPU spikes, query queue grows, *unrelated* endpoints slow down.
- **Cause:** expiry creates a synchronized miss window; per-request cache checks are independent (no coalescing).
- **Impact:** the cache's own success (popularity) causes the outage; latency spike hits exactly the hot key's users.
- **Detect:** miss-rate vertical line on the dashboard; DB `active connections` spike; a trace showing many identical queries at one instant.
- **Prevent:** single-flight coalescing (Section 4 — per instance); jittered TTLs (spread expiry); SWR (serve stale while one request refreshes); cross-instance: `SET NX` refresh lock or CDN collapsing (→ Ch 38/49); cache warming for known hot events.
- **Test:** integration test: delete a hot key, fire 100 parallel reads, assert the counting store saw **one** query; k6 expiry-boundary load test.

### Case 2 — Penetration (404 flood against the DB)

- **Scenario:** attacker scripts 5k req/s against `/v1/forms/{random}`; none of the slugs exist; every request misses and queries PostgreSQL; legitimate traffic degrades.
- **Cause:** negative results were not cached; the key space is unbounded by design (any string can be a slug).
- **Impact:** DB CPU exhaustion from pure garbage traffic — the failure the rate limiter (→ Ch 01) may not fully stop when the attacker has many IPs.
- **Detect:** `db_query_total` ↑ while real form traffic flat; `negative_hit` metric near zero.
- **Prevent:** negative caching (Section 4, 30 s TTL); validate/bound slugs *before* they touch DB or keys; combine with per-IP limits; at larger scale, a Bloom-filter fast path ("does any form like this exist?") — *probabilistic, false positives allowed* (they just cost a DB query).
- **Test:** fuzz test with random slugs: DB call count must be ≪ request count once negatives are cached (second read per slug = 0 queries).

### Case 3 — Avalanche (mass synchronized expiry)

- **Scenario:** a nightly job warms 10k form keys with a uniform 60-minute TTL; at 03:00 all expire together; hit ratio drops from 95 % to 2 % in one minute; the DB absorbs a full cold cache at peak-formula.
- **Cause:** identical TTLs written in a burst expire in a burst.
- **Impact:** scheduled daily degradation — the worst kind, because it recurs and trains people to ignore it.
- **Detect:** hit ratio collapses on a *periodic* schedule; look for the correlating bulk-write job.
- **Prevent:** TTL jitter (±10–20 %, Section 4); stagger warming across time; SWR; spread bulk loads.
- **Test:** unit test that jittered TTLs over 1k keys produce a spread of expiry times (inject `rand`); schedule-audit in the runbook.

### Case 4 — Stale after write: the invalidation you forgot

- **Scenario:** editor renames a form via a new code path ("duplicate form" feature) that updates PostgreSQL but never calls `invalidate()`; the old title is served for the full TTL; support escalates ("the product is broken"); the fix is a code deploy, not a config flip.
- **Cause:** invalidation logic lives in write paths; cache-aside distributes that obligation across every one of them (Section 2's stated disadvantage).
- **Impact:** correctness bug wearing a performance feature's costume; invisible in dev where TTLs are short and caches cold.
- **Detect:** user reports; or better — a "read-your-writes" smoke test after deploys (PATCH then immediately GET assert).
- **Prevent:** route writes through a repository layer that owns both UPDATE and DEL (impossible to bypass); short TTLs as the standing backstop; versioned keys/`updated_at`-checked entries (→ Ch 50); negative TTL discipline.
- **Test:** every new write endpoint ships with an "invalidates key X" test; the e2e publish test in Section 4 is the template.

### Case 5 — Tenant leak via shared cache/proxy (authorization-sensitive caching)

- **Scenario:** the analytics endpoint caches `GET /v1/workspaces/:id/stats` keyed only by path *fragment* or by nothing (proxy default); workspace B starts receiving workspace A's numbers — or, at an CDN, a `Vary`-less response is served cross-user.
- **Cause:** a shared cache stores one copy; anything the response depends on *beyond the path* (auth cookie, Authorization header, Accept-Language) must be part of the key or expressed via `Vary` — or the response must be `no-store`.
- **Impact:** cross-tenant data leak — a security incident, not a performance bug (→ Ch 72/73 territory; GDPR-flavored).
- **Detect:** rarely by monitoring — usually by a customer. Preventive tests are the real control.
- **Prevent:** classify endpoints (public / private / no-store — Section 5); key by tenant ID *after* auth; `Cache-Control: private` + correct `Vary`; never let a shared proxy cache authenticated responses without explicit configuration.
- **Test:** two-tenant e2e test: request A, then B with B's credentials, assert B never sees A's payload (run it through the real proxy config in staging).

### Case 6 — Cache poisoning

- **Scenario:** attacker finds that `GET /v1/forms/..%2Fadmin` or a query-parameter variant is cached by a shared layer under a normalized key; the poisoned (error/debug) response is served to everyone for the TTL. Variant: an XSS payload reflected into a response that a shared cache stores.
- **Cause:** keys that ignore semantically relevant input (encoding, params, headers), or caching responses that embed untrusted input.
- **Impact:** one poisoned key = an outage *and* a security incident; purge latency extends it.
- **Detect:** anomaly reports across users with identical wrong responses; cache-layer logs.
- **Prevent:** normalize + validate before keying (reject non-`^[a-z0-9-]+$` slugs — Section 4); include all vary-relevant inputs in keys; never cache responses containing untrusted reflected input (→ Ch 79 XSS); `no-store` for error responses.
- **Test:** send malformed/path-traversal slugs through the *proxy* in staging; assert 400s and that no shared-cache entry is ever created.

### Case 7 — Redis outage: recovery stampede + degraded mode

- **Scenario:** Redis dies for 6 minutes. Fail-open keeps every read on PostgreSQL — latency rises but stays correct (good). When Redis returns, the cache is *empty*: full cold-cache herd on top of a DB already at elevated load; eviction or restart defaults may have also dropped unrelated keys (rate limits — Ch 01 — weakening in the same instant).
- **Cause:** caches are ephemeral by design; outages make them uniformly empty at the same moment.
- **Impact:** the recovery is more dangerous than the outage — a classic "second peak" incident shape.
- **Detect:** store-error spike (outage), then miss-ratio ≈ 100 % (recovery); DB saturation metrics.
- **Prevent:** jittered repopulation (natural under traffic); warm the top-N keys *before* lifting traffic back (Section 5); scale DB or gate traffic (rate limits, circuit breaker on the cache-miss path — → Ch 10); SWR only helps when *some* copies survive — after a flush, nothing stale exists.
- **Test:** chaos drill in staging: stop Redis, generate traffic, restart, watch the recovery curve; assert alerts fire and warming keeps DB within limits (→ Ch 87).

### Case 8 — Hot key: cache hit but no scale-out

- **Scenario:** one celebrity form gets 80 % of traffic; Redis serves it from one shard/one core; that node saturates; hit ratio looks great while P99 climbs.
- **Cause:** a single key maps to a single slot/node in Redis Cluster (hot-key problem — the caching twin of Ch 01's global limiter key).
- **Impact:** the cache becomes the bottleneck it was built to relieve.
- **Detect:** per-node CPU imbalance in Redis; `hotkey` analysis (`redis-cli --hotkeys`, documented Redis tooling); latency ↑ with hit ratio flat.
- **Prevent:** small in-process micro-cache (seconds TTL) in front of Redis for the hottest keys (locality absorbs the fanout — bounded staleness accepted); replica reads from Redis replicas (read scaling); CDN for the public variant (→ Ch 48).
- **Test:** k6 with 90/10 key skew; watch app P99 and Redis node CPU; verify the micro-cache reduces Redis QPS by the expected factor.

> **Guarantee honesty:** a cache never guarantees that a reader sees the latest write. Our design bounds staleness (fresh window + stale window, plus invalidation best-effort); under Redis failure, reads fall back to the DB and are *fresher* than cache hits, not staler. Distributed caches do not provide global consistency or exactly-once anything — they provide *copies with declared lifetimes*. Say that in design reviews.

## 7. Common Mistakes and Anti-Patterns

### Mistake 1 — Caching without an invalidation plan

- **Wrong:** "we'll add Redis, TTL 24 h, ship Friday."
- **Why devs choose it:** the demo is instantly fast; TTL feels like an automatic cleanup.
- **Why it fails:** every write path becomes a staleness bug (Case 4); "the dashboard showed yesterday's numbers" becomes a trust crisis, and 24-hour TTLs turn every fix into a day-long wait unless someone flushes keys by hand at 3 a.m.
- **Correct:** staleness budget first (product decision), then TTL, then delete-on-write for everything that must be fresher than the TTL; key-version bumps as the manual escape hatch.
- **Local vs production:** dev has cold caches and short sessions; production has 10-minute-old copies in three layers, including browsers.

### Mistake 2 — Uniform long TTLs ("one TTL to rule them all")

- **Wrong:** `CACHE_TTL=3600` applied to every cached entity.
- **Why devs choose it:** one env var is easy to document.
- **Why it fails:** the entities have different staleness tolerance: a form schema tolerates a minute; pricing/plans do not; *user-updated display names* do not. A single TTL either wastes hit ratio on immutable data or ships stale mutable data.
- **Correct:** per-entity TTLs from the product's staleness budget; shorter TTL where writes matter, longer where data is immutable (versioned statics: `immutable, max-age=31536000` in HTTP land).

### Mistake 3 — Cache keys missing the variant

- **Wrong:** key = `stats:{workspaceId}` while the response also depends on `Accept-Language`, `plan`, or query filters.
- **Why devs choose it:** the happy-path curl worked.
- **Why it fails:** one user's French pro-tier response is served to an English free-tier user; the bug is intermittent, user-specific, and almost impossible to reproduce locally (Case 5/6).
- **Correct:** key = every input that changes bytes; for HTTP-layer caching, express it as `Vary`; when in doubt, `no-store` and measure before enabling caching.
- **Consequence:** this class of bug shows up in incident reviews as a *data leak*, escalating the severity by an order of magnitude.

### Mistake 4 — Using the cache as the database

- **Wrong:** reads check Redis only; the DB "will be backfilled later"; TTLs disabled for performance.
- **Why devs choose it:** Redis answers in 0.5 ms and the chart looks amazing.
- **Why it fails:** Redis is an ephemeral, memory-bound, eviction-prone store: an eviction, restart, or failover turns "missing" into "deleted"; costs grow linearly with data; durability guarantees are configuration-dependent, not Postgres-grade.
- **Correct:** the DB is the source of truth; the cache is a copy with a lifetime. If you genuinely want a fast primary store, that is a database choice (→ Ch 32, 34) — not a cache.

### Mistake 5 — In-process Map as "the cache" in a multi-instance app

- **Wrong:** `const cache = new Map()` with a 5-minute TTL in an app running 6 pods behind an LB.
- **Why devs choose it:** zero dependencies; microseconds; it worked in the demo.
- **Why it fails:** N independent copies with N expiry clocks; an invalidation on pod 1 does nothing for pods 2–6 (staleness window = full TTL on 5/6 of traffic); deploys randomly reset some copies. The bug arrives with the first scale-out — identical in shape to Ch 01's Mistake 1.
- **Correct:** shared store (Redis) for anything beyond micro-caching; in-process only for bounded, seconds-scale staleness *by explicit decision*.

### Mistake 6 — Ignoring the cold path ("we never miss")

- **Wrong:** capacity planning assumes the warm hit ratio; no plan for cache-cold deploys, Redis restarts, or the 24-hour-new-key scenario.
- **Why devs choose it:** the steady-state dashboard is green.
- **Why it fails:** every cache is cold sometimes (Case 1, 7); the DB that sized comfortably at 5 % miss rate melts at 100 %; the incident is "the cache went down" but the root cause is "the DB was never sized for the cache being down."
- **Correct:** size the origin for the worst plausible miss ratio; warming plans; stampede controls; the numbers in Section 8.

### Mistake 7 — Optimizing hit ratio into a vanity metric

- **Wrong:** a team celebrates 98 % hit ratio while P99 climbs; the hits are cheap-but-many, the 2 % misses are a 300 ms join nobody cached.
- **Why devs choose it:** hit ratio is the one cache number dashboards show by default.
- **Why it fails:** the goal is *latency and DB shielding*, not ratio; a perfect ratio on trivial queries buys nothing while a small ratio on huge queries buys everything.
- **Correct:** measure what the cache saves: DB time avoided, P95 delta with cache on/off (Section 9's method). Cache the expensive things first; skip caching cheap queries entirely.

## 8. Performance and Scalability

### What a hit actually saves

Model the route, not the cache: `saved_db_time = miss_ratio × db_query_time`. *Hypothetical illustration:* db query 4 ms, Redis GET 0.4 ms, traffic 2k RPS → warm-state DB load drops from ~8 CPU-ms/ms of query time to 0.08 (1 % misses); the app pays ~0.8 ms/ms of Redis RTT. The cache wins twice (DB shield + latency) but **only in the warm state** — every capacity plan must price the cold state (Mistake 6): at 100 % miss the DB sees full traffic *plus* a Redis GET per request.

### Complexity

All cache operations are O(1) in the cache (Redis GET/SET); JSON serialization is O(value size) in the app (keep values small — this is a P99 lever at high QPS, → Ch 42 GC pressure). Single-flight is O(1) map ops. The systems cost is in **fanout and hot keys** (Case 8), not in algorithmic complexity.

### Bottlenecks, in the order you will meet them

1. **Redis connection churn** — one shared pool, never per-request connections.
2. **Hot keys** — one shard/core (Case 8) → micro-cache/CDN in front.
3. **Big values** — serialization + network dominate; cache rows, not pages.
4. **Miss-path DB saturation** — the real limiter on how "down" your cache can be (Section 5 sizing rule).
5. **Local GC pauses** from allocation-heavy serialize/deserialize loops (→ Ch 42).

### Scaling strategies

- **More cache capacity:** Redis Cluster sharded by key (hot keys still concentrate — plan separately).
- **Push outward:** CDN for public GETs removes origin load entirely for hits at the edge (→ Ch 48, 49); browser caching removes even CDN hits for cacheable variants (correct `Cache-Control` on authenticated endpoints is `private`/`no-store` — free correctness).
- **Read replicas + cache:** replicas absorb *misses* cheaply (→ Ch 29), cache absorbs *everything*; they compose, not compete.
- **Two-tier local+Redis** (micro-cache seconds-scale in process, Redis authoritative): cuts Redis QPS by local hit ratio; costs bounded extra staleness and per-instance memory.

### Benchmarking method (measure, don't assume)

- **A/B the cache:** same k6 scenario with the cache enabled vs bypassed (env flag); compare P50/P95/P99 and DB CPU. This is the number that justifies the cache — record method + environment.
- **Ratio sweep:** artificially cap TTL to 1 s (near-zero hits) and observe; then restore. Gives the miss-cost curve.
- **Cold-start curve:** flush Redis under steady load; graph DB CPU vs time-to-repopulated. That shape *is* your recovery-drill acceptance criterion (Case 7).
- *No benchmark numbers in this chapter are claimed as measured except the Section 9 test outputs; latency figures above are labeled hypotheticals.*

## 9. Testing and Debugging

### Unit tests (no infra)

- `jitter()` bounds with injected `rand` (deterministic).
- `SingleFlight`: 100 concurrent same-key calls ⇒ loader ran once; different keys parallel; loader rejection clears the entry (next call retries).
- `FormCache` with fake `cache`/`store`/`now`: full hit/stale/miss/negative matrix + fail-open paths, zero sleeps.

### Integration tests (real Redis + PG, visible self-skip; `REQUIRE_INFRA=1` for CI)

- MISS→HIT with DB-call counting; SWR transition via injected clock; negative caching behavior; invalidation e2e (PATCH then GET ⇒ MISS); TTL present on every written key (`PTTL > 0` — the Case 4/Ch 01 memory lesson).
- Concurrency: 50 parallel reads on a cold key ⇒ **one** DB call (coalescing proven against real Redis).

### Load and failure injection

```bash
k6 run --vus 50 --duration 30s loadtest.js   # hit ratio, P95, zero 5xx
docker compose stop redis                    # fail-open: 200s continue, cache_errors_total rises
docker compose start redis                   # recovery: watch miss ratio decay curve
```

### Debugging toolkit

| Signal | Command / place | Tells you |
|---|---|---|
| Key value + kind | `redis-cli GET 'form:v1:slug:contact-us'` | hit/miss confusion, wrong entry kind |
| TTL sanity | `redis-cli PTTL 'form:v1:slug:contact-us'` | forgotten TTLs, jitter presence |
| Memory/evictions | `redis-cli INFO memory \| grep -E 'evicted\|used'` | LRU pressure (evictions climbing = resize or trim values) |
| Keyspace | `redis-cli INFO stats \| grep keyspace` (hits/misses) | Redis's *own* hit ratio (server-side view) |
| App metrics | `cache_requests_total` by result | per-route behavior, penetration/stampede signatures |
| DB | `pg_stat_statements` top queries | what the misses actually cost |
| Logs | grep `cache_get_error` / `cache_del_error` | silent fail-open windows to correlate with incidents |

**Expected failure signatures:** `cache_errors_total` ↑ with responses still 200 (fail-open working — alert should fire); miss ratio → 100 % after Redis restart (recovery drill); `negative_hit` spike (404 flood — cross-check with Ch 01's deny metrics for the same window).

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

**Q1. What is a cache, and why does adding one make a system faster?**
**Answer:** A cheaper copy of computed/read data stored closer to the reader. It is faster because hits skip the expensive path entirely; the speed comes from trading freshness (copies can be stale) for latency and throughput.
**Misconception:** "caches make the database faster" — the DB does no less work per query; it receives *fewer* queries.
**Follow-up:** What three questions must every cache design answer? (Populate, invalidate/expire, staleness policy.)

**Q2. Explain cache-aside in your own words, including the write path.**
**Answer:** App-led: read cache first; on miss, query DB and populate; on write, update DB first, then delete the cache entry so the next read repopulates.
**Misconception:** "write the new value into the cache after updating" — update-after-write races with slow readers and can persist old data; delete-on-write's worst case is only a miss.
**Follow-up:** Who populates the cache in read-through? (The cache layer itself — the app never touches the DB.)

**Q3. What is a TTL, and what does it really represent?**
**Answer:** Time-to-live: the cache entry's lifetime. Conceptually it is your **staleness budget** — the maximum age at which a copy is still acceptable if invalidation never happens.
**Misconception:** "TTL = how long the data is valid" — it is how long you *accept* the data without checking; correctness comes from invalidation, TTL is the backstop.

### Level 2 — Implementation

**Q4. Design the cache key for `GET /v1/forms/:slug?locale=de`.**
**Answer:** `form:v1:slug:{slug}:locale:{locale}` with the slug validated against a bounded pattern first; `v1` gives a coordinated invalidation lever. Everything that changes the response bytes belongs in the key.
**Misconception:** keying only the path — the `?locale` variant gets served to the wrong audience (Case 5/6).
**Follow-up:** What HTTP header carries this concern at the CDN layer? (`Vary`.)

**Q5. How do you test stale-while-revalidate without sleeping?**
**Answer:** store freshness in the entry (`storedAt`), inject a clock into the cache logic; tests advance the clock past `freshTtl`, assert `stale` source + background refresh, then assert the refreshed hit. Our Section 4 design does exactly this.
**Misconception:** `await sleep(61_000)` in tests — slow, flaky, and it never crosses the stale boundary deterministically.

**Q6. What is negative caching, and what is its main risk?**
**Answer:** Caching "not found" results for short TTLs so 404 floods don't hammer the DB. Risk: a *newly created* entity is invisible for up to the negative TTL — a legitimate-user cost that must be bounded (and, on publish, ideally invalidated explicitly).
**Misconception:** "negative caching is free" — it converts attacker traffic into a fresh-read delay for real users if the TTL is lazy-long.

**Q7. Your app runs 8 replicas with in-process caches. What happens on publish?**
**Answer:** One replica's copy is invalidated (if the write went through it); the other 7 serve stale until their own TTLs lapse. Effective staleness ≈ TTL for most traffic; deploys make it worse as replicas restart with random warm/cold states.
**Misconception:** "the cache updates everywhere" — in-process caches have no broadcast mechanism.

### Level 3 — Advanced Engineering

**Q8. Stampede vs penetration vs avalanche — one sentence each, and one fix each.**
**Answer:** Stampede: many concurrent misses on *one* expiring key → one query (coalescing/SWR/jitter). Penetration: requests for keys that never exist → negative caching + input validation. Avalanche: mass expiry of *many* keys at once → TTL jitter + staggered warming.
**Misconception:** treating them as one problem ("cache is broken") — the fixes are different and the metrics signatures differ.

**Q9. Why does delete-on-write beat update-on-write for cache invalidation?**
**Answer:** Update-on-write has a read-modify-write race: a slow SELECT that started before your write can *re-populate the old value after* your update — permanent staleness until TTL. Delete's failure mode is a miss; the next reader refetches truth. (Versioned keys are the stronger alternative → Ch 50.)
**Misconception:** "delete loses the warm cache" — a single extra miss is cheaper than a stuck stale value.

**Q10. Redis is down. Walk through your read path's behavior and the second-order effects.**
**Answer:** Fail-open: every read goes to PostgreSQL (correct but slower); `cache_errors_total` spikes; alert should page. Second order: DB must absorb 100 % misses (pre-sized per Section 5); on Redis *recovery*, the cold-cache herd (Case 7) hits a DB that may still be elevated — warming/gating the return matters more than the outage itself. Also check co-tenanted subsystems (rate limits, queues) for collateral loss.
**Misconception:** "the app goes down" — a properly fail-open cache degrades; the outage is usually *caused* by the un-sized miss path.

### Level 4 — Production Scenarios

**Q11. Hit ratio falls from 94 % to 55 % over one hour, no deploy. Triage.**
**Answer:** Check in order: (1) evictions climbing? (`INFO memory` — memory pressure/undersized instance or a value-size regression); (2) key-space change without deploy (a cron job started writing new key patterns; a campaign generated new slugs — cold keys are *legitimate* misses); (3) Redis failover/restart wiped data; (4) TTL config drift (someone shortened TTLs via flag); (5) clock jump on app hosts corrupting `storedAt` freshness math. Correlate with `cache_errors_total` and deploy-free config changes first.
**Misconception:** "add more cache memory" before looking at eviction vs key-growth data — the miss spike may be healthy cold traffic.
**Follow-up:** Which single metric separates eviction-driven misses from cold-traffic misses? (`evicted_keys` delta.)

**Q12. Users report old form titles for ~8 minutes after publish, intermittently. Root cause hunt.**
**Answer:** Intermittent = some path/layers stale, not all. Candidates in likelihood order: (1) a write path missing `invalidate()` (Mistake 1 — enumerate write paths); (2) browser/proxy caching the GET (missing `Cache-Control: no-cache`/ETag on the endpoint — the *client* holds the copy the server cannot delete, → Ch 48/49); (3) CDN caching despite `Vary`-relevant headers; (4) multi-region Redis without invalidation fan-out (staleness = TTL there). Verify layer by layer with `curl -H 'Cache-Control: no-cache'` and cache-busting query params.
**Misconception:** flushing Redis as the fix — if the browser holds the copy, the flush changes nothing for that user.

**Q13. An incident review says "the cache served workspace A's data to workspace B." Three likely causes?**
**Answer:** (1) Missing `Vary`/private marking on a shared proxy/CDN (Case 5); (2) key built from request path without the tenant dimension where the response is tenant-scoped; (3) an over-eager "optimize" PR removed the auth check from a cached handler and the shared layer cached the first tenant's response. Fixes: endpoint cache classification (Section 5), two-tenant regression test (Case 5's test), staged review rule: *any* change to key construction or cache headers is security-reviewed.
**Misconception:** "it's a caching bug, low severity" — classify as data exposure; the response plan belongs with security, not performance.

### Level 5 — System Design

**Q14. Design the caching architecture for a global form-filler product: 200k RPS reads, forms mutable, users expect instant updates after publish.**
**Answer sketch:** Layered: (1) browser with `Cache-Control: no-cache` + ETag revalidation for the form schema (cheap 304s, instant freshness); (2) CDN for anonymous public form pages with short TTL + publish-triggered purge (purge latency becomes the staleness budget — state it); (3) regional Redis app caches, cache-aside, delete-on-write with invalidation fan-out via pub/sub or a purge service (→ Ch 16/50); (4) single-flight + jitter + SWR inside regions; (5) origin: PostgreSQL primary + replicas for misses; capacity plan = worst miss ratio, not steady state. Keys: `form:v1:{id}:{locale}`; observability: per-layer hit ratios, purge-lag metric, error budgets on staleness SLO (→ Ch 63–65). Failure: each layer fails toward the next-fresher layer (browser→CDN→Redis→DB) — never toward wrongness.
**Misconception:** one global Redis serving all regions — cross-region RTT in the hot path and a global SPOF.
**Follow-up:** How do you make "instant updates after publish" true *despite* CDN TTLs? (Purge API on publish + short TTL as backstop + ETag revalidation.)

**Q15 (bonus). How does caching interact with rate limiting and backpressure?**
**Answer:** Cache hits are cheap — some systems rate-limit only expensive misses (or weight them higher), but volumetric protection still applies to all traffic (→ Ch 01). A failing cache converts allowed traffic into DB-bound work: backpressure mechanisms (→ Ch 44) and timeouts (→ Ch 11) must assume the *miss-path* worst case. Rate limiting the miss path directly (`cost` weighting) is a legitimate defense during cache outages.
**Misconception:** "the cache made rate limiting unnecessary" — caches change the *cost* of requests, not the *count* of requests.

## 11. Scenario-Based Engineering Problems

### Scenario A — Viral form: a template goes global overnight

**Problem:** a marketing-form template gets shared on social media; `GET /v1/forms/{slug}` jumps from 2 RPS to 900 RPS on one form within an hour; PostgreSQL CPU 85 %, climbing.
**Constraints:** form must stay mutable (owner is editing it live); Redis has the data cached but the single node serving that key is at 70 % CPU; CDN exists but the endpoint currently sends `Cache-Control: no-store` "to be safe."
**Options:** (1) nothing — autoscale DB (→ Ch 45); (2) fix HTTP headers: `Cache-Control: public, max-age=30, stale-while-revalidate=120` + ETag; (3) in-process micro-cache (2 s) in front of Redis; (4) both 2 + 3.
**Recommended:** (2) first — the CDN absorbs the global fanout at zero code risk to the DB path, and the ETag path keeps the owner's edits visible in ~30 s. Then (3) as the hot-key cushion for authenticated preview traffic. (1) is the money-burning fallback.
**Trade-offs:** (2) changes staleness for *all* users (30 s + revalidation — product sign-off needed, and the owner must be told "edits take up to 30 s to appear"); (3) adds per-pod memory + another layer to debug. (4) is correct at scale but ship (2) tonight, (3) tomorrow.
**Failure scenarios:** CDN caches a *404* during a publish race (mitigate: don't cache 4xx at the edge, short TTL + purge on publish); `Vary` misconfiguration serves the wrong locale.
**Testing:** replay the 900 RPS pattern in staging with the real CDN config; assert DB CPU stays < 40 % and staleness ≤ agreed budget after a PATCH.

### Scenario B — "The dashboard shows wrong numbers"

**Problem:** the analytics endpoint (`GET /v1/workspaces/:id/analytics?range=7d`) is slow (2.5 s), so a dev adds Redis caching with a 1-hour TTL keyed by path. Within a week: sales sees stale data in a board meeting; two tenants see each other's numbers.
**Constraints:** analytics are computed from `submissions` + rollup tables; ranges vary per request; data may be re-computed by the rollup job (late-arriving events update past days).
**Options:** (1) shorter TTL (5 min); (2) key by `{workspaceId}:{range}:{computedAt-bucket}` + `Cache-Control: private`; (3) materialized views in PostgreSQL with `REFRESH CONCURRENTLY` (→ Ch 25/26) and cache only the view reads; (4) no cache — optimize the query.
**Recommended:** (2) + (3): fix the tenant leak *first* (key includes workspace + `private`; also `Vary: Authorization` if any proxy layer is involved — severity: security). Then attack the 2.5 s query with rollup/materialized views so the cache stores cheap, *idempotent* results; late events shorten the freshness window via rollup-job invalidation of the current bucket only.
**Trade-offs:** (1) alone halves the leak window but keeps the leak; (4) alone is honest but leaves the endpoint vulnerable to report-generating load spikes; (3) adds refresh-job complexity.
**Failure scenarios:** stale-range key collision after the rollup job backfills (invalidate the affected range keys in the job); tenant isolation regression sneaks back via a "harmless" key refactor — hence the two-tenant test (Section 6, case 5).
**Testing:** two-tenant e2e (A then B, assert isolation); backfill test (re-run rollup, assert cache invalidation for affected ranges); load test with 50 concurrent heavy reports.

### Scenario C — Redis outage day: the second peak

**Problem:** 09:14 Redis crashes (OOM-kill after an engineer set `maxmemory 0` "to disable limits" during a debug session). Reads fail open to PostgreSQL — fine until 09:22, when Redis auto-restarts empty and the 09:00 traffic peak meets a cold cache: DB connections max out, the API starts timing out, and *rate limits are also gone* (co-located keys), so abuse traffic joins the party.
**Constraints:** incident channel active; the runbook has no cache-recovery section; autoscaling the DB is 10 minutes away from helping.
**Options:** (1) wait it out; (2) scale DB + shed load via gateway limits (Ch 01 kill switch works in reverse — the *gateway* layer still has its own limiters); (3) restart API pods to drop any local state and re-warm from top forms (a warming script exists but has never been run in anger); (4) restore Redis from snapshot (there is none — it's a cache).
**Recommended:** (2) immediately — gateway-layer limits (still alive) cap the damage class; then (3) to accelerate repopulation; (1) burns the error budget; (4) is a non-goal for a cache.
**Trade-offs:** (2) rejects some legitimate traffic (explicit, recoverable) vs (1) failing *everything* slowly; warming prioritizes top-N slugs, so long-tail users still pay misses briefly.
**Failure scenarios this teaches:** co-tenant eviction (Ch 01 counters + cache on one instance), unbounded `maxmemory`, the recovery second peak (Case 7), and missing runbooks becoming incidents (→ Ch 109–110).
**Testing:** quarterly drill: OOM-kill Redis in staging under load; time-to-mitigation target < 5 min; the runbook entry this drill produces *is* the deliverable (→ Ch 111).

## 12. Hands-On Exercises

All exercises extend [`book/code/02-caching/`](../code/02-caching/). Attempt before opening the solutions.

### Beginner — In-process cache-aside with TTL

**Task:** implement a `TtlCache` (a `Map` with per-entry expiry) and a `getOrLoad(key, loader)` cache-aside wrapper over it; demo MISS→HIT with a counting loader.
**Hints:** store `{value, expiresAt}`; an expired entry is a miss, not an error; delete expired entries on read (and opportunistically on write) so the Map stays bounded.
**Acceptance criteria:**
1. Unit tests: MISS then HIT (loader called once); expiry causes a second loader call (inject `now` — no sleeps).
2. A size bound (e.g., 1000 entries) evicts oldest-inserted entries; documented as approximated LRU.
3. Loader throws ⇒ error propagates **and** no entry is cached (a cached rejection poisons the key — cf. single-flight test).

### Intermediate — Invalidation + negative caching + jitter on the real stack

**Task:** on the committed `FormCache`: (a) add a `publish(slug, newTitle)` method that updates PostgreSQL and invalidates — proving read-your-writes; (b) extend the negative cache so `publish` also deletes the negative entry for that slug (newly published form must be immediately visible); (c) add a metric `cache_ttl_jitter_ms` histogram-style record (callback is fine) and verify jitter spread in a test.
**Hints:** negative and positive entries share the key space — one DEL clears both (that is why we use `kind`, not separate keys); for (c) record `jittered − base`.
**Acceptance criteria:**
1. Test: read unknown slug → 404; `publish` it; immediate read → found (no negative-cache delay).
2. Test: `publish` after a cached read → immediate read shows the new title.
3. 100 jitter samples for a 1000 ms TTL at ratio 0.1: all within [900, 1100], and ≥ 2 distinct values (with injected `rand` sequence).

### Advanced — Stampede-proof multi-instance reads with a refresh lock

**Task:** our single-flight is per instance. Add an **instance-aware stampede guard**: before a *cold-key* DB load, try `SET refresh:{key} <instanceId> NX PX 2000` in Redis; winner loads, losers poll-wait (≤ 150 ms) then re-read the cache (or load themselves if still empty — bounded staleness beats unbounded blocking). Keep SWR refreshes lock-coalesced the same way.
**Hints:** the lock is a *lease* — TTL is mandatory; never delete a lock you did not create without checking the owner token (→ Ch 38's ownership lesson, simplified); losers' fallback path must remain correct when Redis is down (fail open to local single-flight).
**Acceptance criteria:**
1. Integration test with 2 `FormCache` instances (2 Redis connections) + 50 parallel cold reads ⇒ counting store sees ≤ 2 queries (one per instance worst case), typically 1.
2. Redis down ⇒ reads still succeed (local single-flight only), `cache_errors_total` counts the lock failures.
3. Code comment states the exact guarantee: "≤1 loader per instance per key per lease window; cross-instance convergence within lease TTL — not exactly-once."

---

## Solutions

> Try first. Solutions keep teaching comments short; different-but-correct implementations are expected.

### Solution — Beginner (core)

```typescript
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();
  constructor(private readonly maxEntries = 1000, private readonly now = () => Date.now()) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) { this.map.delete(key); return undefined; }
    return e.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value;  // insertion-order ≈ LRU-lite
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async getOrLoad(key: string, loader: () => Promise<V>, ttlMs: number): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await loader();          // throws propagate; nothing cached
    this.set(key, value, ttlMs);
    return value;
  }
}
```

### Solution — Intermediate (core)

```typescript
// (a)+(b): publish updates the DB first, then ONE del clears both the
// positive and the negative entry — they share the key, distinguished by
// `kind`. That is exactly why Section 3 stores negatives under the same key.
async publish(slug: string, newTitle: string): Promise<void> {
  await this.deps.store.updateTitle(slug, newTitle);   // source of truth first
  await this.invalidate(slug);                          // cache-aside write path
}

// Test sketch (real Redis + PG, seeded slug rows):
//   expect((await fc.getBySlug('ghost')).kind).toBe('not_found');   // negative cached
//   await fc.publish('ghost', 'Ghost Form');
//   const after = await fc.getBySlug('ghost');
//   expect(after.kind).toBe('form');            // immediately visible, no 30s wait
//   expect(after.form.title).toBe('Ghost Form'); // read-your-writes after publish
```

```typescript
// (c) jitter observability: record base-vs-jittered deltas.
const samples: number[] = [];
for (let i = 0; i < 100; i++) {
  const j = jitter(1000, 0.1, () => seededRand(i));  // injected rand
  expect(j).toBeGreaterThanOrEqual(900);
  expect(j).toBeLessThanOrEqual(1100);
  samples.push(j);
}
expect(new Set(samples).size).toBeGreaterThan(1);     // actually spreading
```

### Solution — Advanced (core structure)

```typescript
const INSTANCE_ID = randomUUID();

async loadCoalescedAcrossInstances<T>(key: string, load: () => Promise<T>): Promise<T> {
  const lockKey = `refresh:{${key}}`;   // hash-tag braces: cluster-safe key pair
  let locked = false;
  try {
    // Lease, not a mutex: PX is mandatory; the owner token guards the DEL.
    locked = (await this.redis.set(lockKey, INSTANCE_ID, 'PX', 2000, 'NX')) === 'OK';
    if (locked) return await load();    // winner loads; its SET populates cache
    // Loser: bounded poll-wait, then re-read; never block unboundedly.
    for (let i = 0; i < 3; i++) {
      await sleep(50);
      const entry = await this.safeGet(key);
      if (entry?.kind === 'form' && entry.value) return entry.value as T;
    }
    return await load();   // convergence deadline exceeded: correctness first
  } catch {
    // Redis/lock unavailable: fall back to LOCAL single-flight (fail-open).
    this.deps.metrics.inc('cache_errors_total', { op: 'lock' });
    return this.flight.do(key, load);
  } finally {
    if (locked) {
      // Ownership check before release (Ch 38 discipline, simplified):
      // only delete if we still own the token.
      const owner = await this.redis.get(lockKey).catch(() => null);
      if (owner === INSTANCE_ID) await this.redis.del(lockKey).catch(() => undefined);
    }
  }
}
// Stated guarantee (also in the committed comments): at most ONE loader per
// instance per key via local single-flight; across instances, the NX lease
// reduces concurrent loaders to ~1 per lease window under healthy Redis —
// this is a *stampede damper*, NOT exactly-once, and the book never claims
// more than that.
```

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Caching trades **freshness for speed**: every cache design is a staleness budget chosen on purpose — TTL from the product's tolerance, invalidation for everything tighter.
2. **Cache-aside + delete-on-write + TTL backstop** is the default pattern because its failure mode is "slow," not "wrong"; write-back's failure mode is *data loss* — never use it unknowingly.
3. The three diseases have three different fixes: **stampede → coalescing/SWR/jitter; penetration → negative caching + input validation; avalanche → TTL jitter + staggered warming.**
4. **Key design is a correctness and security contract**: every byte-changing input belongs in the key; shared caches + missing `Vary`/private markings are data leaks, not performance bugs.
5. A cache is a distributed component: fail-open, observable (`cache_requests_total`, `cache_errors_total`), sized for the **cold** state, and never the source of truth.

### Quick revision sheet

| Question | One-line answer |
|---|---|
| Default app pattern? | Cache-aside; DB first, then DEL the key |
| Overwrite or delete on write? | Delete — its failure mode is a miss |
| Fresh vs stale enforced by? | `storedAt` in the entry (testable clock) |
| Cleanup enforced by? | Redis TTL (jittered, always set) |
| 404 flood fix? | Negative caching + bounded slug validation |
| Cross-instance stampede fix? | NX lease / SWR / jitter (damper, not exactly-once) |
| Cache outage behavior? | Fail-open to DB, alert on errors, DB sized for 100 % misses |
| Tenant-sensitive endpoint? | Per-tenant keys + `Cache-Control: private` (+ `Vary`), or `no-store` |
| The vanity metric? | Hit ratio alone — measure DB time avoided instead |

### Essential terminology

cache-aside · read-through · write-through · write-back · write-around · TTL · stale-while-revalidate (SWR) · negative caching · request coalescing / single-flight · thundering herd · penetration · avalanche · hot key · eviction policy (`allkeys-lru`, `volatile-lru`, `noeviction`) · hit ratio · staleness budget · delete-on-write · `Vary` · cache poisoning · key namespace/version

### Formulas and parameters

- **Hit ratio:** `hits / (hits + misses)` — per route, never global-only.
- **DB load saved:** `miss_ratio × db_query_time` per request; cold-state DB load = `100 % × db_query_time` (+ a cache RTT).
- **TTL jitter:** `ttl × (1 ± ratio)`; ratio 0.1–0.2 breaks avalanche synchrony.
- **Redis TTL for SWR entries:** `freshTtl + staleWindow` (+ jitter); freshness itself from `storedAt`.
- **Sizing:** `peak_live_keys × avg MEMORY USAGE × 1.3` headroom; `maxmemory-policy allkeys-lru` only on dedicated cache instances.
- **Slug validation:** `^[a-z0-9-]{1,64}$` before keying (bounds key space).

### Decision-making checklist

- [ ] Staleness budget written down per cached entity?
- [ ] Every write path calls invalidate (repository owns UPDATE+DEL)?
- [ ] Delete-on-write, TTL as backstop, both actually implemented?
- [ ] Keys: namespaced, versioned, bounded, tenant-correct, secret-free?
- [ ] Endpoint classified: public / private / no-store (+ `Vary` where shared)?
- [ ] Stampede/penetration/avalanche mitigations present for hot keys?
- [ ] Fail-open + `cache_errors_total` alert + kill/TTL flags?
- [ ] DB sized for cold state; warming + recovery drill scripted?
- [ ] Micro-cache decisions explicit (per-instance staleness accepted)?
- [ ] Metrics + dashboards per route; benchmark A/B recorded?

### Flashcards

1. **Q:** Why delete instead of update on write? **A:** Slow-read races can re-populate old data after an update; after a delete, the worst case is a miss.
2. **Q:** What single mechanism makes SWR testable without sleeps? **A:** `storedAt` in the entry + an injected clock.
3. **Q:** Penetration vs stampede in one line? **A:** Penetration = keys that never exist (negative cache); stampede = one hot key's synchronized misses (coalescing).
4. **Q:** Why does a shared proxy need `Vary`? **A:** Responses that differ by header/cookie must not share one stored copy.
5. **Q:** What does Redis eviction do to co-located rate-limit counters? **A:** It can delete them — limits silently weaken; separate instances.

### Three questions to verify genuine understanding

1. Derive, from your own traffic numbers, the "DB sized for cold state" capacity plan for FormForge's form endpoint — then explain to a skeptic why sizing only for the warm 1 % miss rate is an incident with a schedule attached.
2. A teammate proposes caching `GET /v1/me` (authenticated profile) in the CDN "because it is a GET." Identify every way that breaks, in order of severity, and state the correct caching posture for that endpoint.
3. Trace one cache key's full lifecycle: populate → publish → invalidation → concurrent stale reader → Redis restart → recovery warming. At each transition, name the responsible component and the worst-case staleness.

### Authoritative references and further reading

- AWS — Caching strategies (cache-aside / read-through / write-through / write-back terminology): [aws.amazon.com/caching](https://aws.amazon.com/caching/)
- Redis — Eviction policies: [redis.io/docs/latest/operate/oss_and_stack/management/eviction](https://redis.io/docs/latest/operate/oss_and_stack/management/eviction/)
- Redis — Approximated LRU/ LFU eviction reference: [redis.io/docs/latest/develop/reference/eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- RFC 9111 — HTTP Caching: [datatracker.ietf.org/doc/html/rfc9111](https://datatracker.ietf.org/doc/html/rfc9111)
- RFC 5861 — Cache-Control extensions for stale content (`stale-while-revalidate`): [datatracker.ietf.org/doc/html/rfc5861](https://datatracker.ietf.org/doc/html/rfc5861)
- Google SRE Book — Chapter 4, Handling Overload (cache shielding / overload prevention): [sre.google/sre-book/handling-overload](https://sre.google/sre-book/handling-overload/)
- Brad Fitzpatrick — *Caching is hard, drawing circles is hard*: [docs.google.com/presentation](https://docs.google.com/presentation/d/1H7AObgh3M1E1z1ON9scpAmDExGk02Ss9UBLK61Y8s98)
- Nginx — `proxy_cache` documentation: [nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache)
- Martin Kleppmann — *Caching Strategies* talk (invalidation as a systems problem): [martin.kleppmann.com](https://martin.kleppmann.com/2016/02/01/caching.html)

---

**Next:** → Chapter 03 (Load Balancing) — caching made each request cheaper; load balancing decides *which machine* eats the requests that remain. Then → Chapter 50 (Cache Invalidation) for the systematic treatment this chapter only opens, and → Chapter 48/49 (CDN/Edge Caching) to push copies closer to users than Redis can ever be.



















