```yaml
# wrangler.toml
name = "edge-caching"
main = "src/index.ts"
compatibility_date = "2026-01-01"
kv_namespaces = [ { binding = "LESSON_CACHE", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" } ]
routes = [
  { pattern = "example.com/courses/*", custom_domain = true }
]
```

```typescript
// src/cache/edge-cache.ts
interface CacheEntry {
  body: string;
  headers: Headers;
  ttl: number; // expiry timestamp
  etag: string;
}

const cache = new KVNamespace("LESSON_CACHE");

export async function getCached(key: string): Promise<CacheEntry | null> {
  const raw = await cache.get(key, "text");
  if (!raw) return null;
  const entry = JSON.parse(raw) as CacheEntry;
  if (Date.now() > entry.ttl) {
    await cache.delete(key);
    return null;
  }
  return entry;
}

export async function setCached(key: string, body: string, headers: Headers, ttl: number, etag: string): Promise<void> {
  const entry: CacheEntry = { body, headers: new Headers(headers), ttl: Date.now() + ttl, etag };
  await cache.put(key, JSON.stringify(entry), { expirationTtl: Math.floor(ttl / 1000) });
}
```

- **Configuration (env vars, config files):**
  - `CACHE_API=CLOUDFLARE_KV`
  - `TTL=600s`
  - `MAX_BODY=500000`
  - `STALE_IF_ERROR=300s`

- **Execution instructions:**
  1. Configure Cloudflare KV namespace and wrangler.toml.
  2. Deploy: `npx wrangler deploy`.
  3. Set `Cache-Control` headers on the origin.

- **Expected result / representative output:**
  ```
  [edge] GET /courses/10/lessons/42 -> Cache hit, TTL=600s, key="lesson:10:lessons:42"
  [edge] 200 OK, cf-cache-status: HIT, age: 142ms, content-encoding: gzip
  ```

- **Explanation of key code and design decisions:** The `setCached` function stores the entry with an expiry timestamp; the `getCached` function cleans up expired entries lazily to avoid extra reads. The `cf-cache-status` header is set automatically by Cloudflare based on the `cache` API.
