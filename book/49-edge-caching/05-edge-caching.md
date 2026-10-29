## 8. Performance and Scalability

- **Characteristics, complexity:** Edge cache is O(1) on read; O(n) on write (n = number of dependent keys). Cache stampede mitigation (single-flight) reduces write amplification.
- **Latency/throughput implications:** Edge hit: 2–30ms. Edge miss: 50–200ms (depends on origin). Cache stampede: removes the spike.
- **Resource use:** CPU is low (mostly networking); memory is bounded by `max_items`. KV throughput is the bottleneck.
- **Benchmarking/load-testing:** Use `wrk` to send 10k req/s to the edge. Measure p95 latency and hit ratio. Target: <50ms p95, >80% hit ratio.
- **Measurements:** With 100k requests/day on a lesson page: edge hit ratio 92%, p95 18ms, origin traffic 8% of requests.

---

## 9. Testing and Debugging

- **Unit tests:** `getCached` and `setCached` with expiry and TTL.
- **Failure injection:** Stop the origin; verify `stale-if-error` serves stale.
- **Debug commands:** `curl -I https://example.com/courses/10/lessons/42` → check `cf-cache-status`, `age`, `cache-control`.
- **Metrics to check:** `edge.hits`, `edge.misses`, `edge.stale-if-error`, `edge.request.coalescing`.
- **Expected failure signals:** `cf-cache-status: MISS` for known public pages; `age` increasing beyond `max_stale`.

---

## 10. Follow-Up Interview Questions

- **Question 1 (Level 1):** What is the difference between a CDN edge cache and an application cache?
  - *Answer:* Edge caching is geographic — it sits at the network edge and serves content from the closest PoP. Application caching is in-memory or distributed memory within the app tier. Edge is faster but less flexible; app cache is more flexible but further away.
  - *Reasoning:* Edge caches serve static data; app caches serve dynamic data.
  - *Example:* A course page is cached at the edge; a user's quiz score is cached in Redis.
  - *Common wrong answer:* "They are the same." (No — edge is geographic, app is in-memory.)
  - *Follow-up:* When would you use one over the other? (Use edge for static/SLL, app for dynamic/user-specific.)
- **Question 2 (Level 2):** How does the edge cache handle a write (e.g., a lesson update)?
  - *Answer:* The write path sends an invalidation signal to the edge; the edge deletes the cached key (or bumps a version tag). The next read fetches from the origin.
  - *Reasoning:* Updates must be reflected at the edge; the cache is ultimately the source of stale data.
  - *Example:* After a lesson publish, the edge deletes `lesson:42`; the next user fetch fetches from the origin.
  - *Common wrong answer:* "The edge automatically updates." (No — the edge does not subscribe to DB changes.)
  - *Follow-up:* How do you invalidate 1000 edge nodes at once? (Use a broadcast invalidation topic.)
- **Question 3 (Level 3):** How would you handle cache stampede on a viral course?
  - *Answer:* Use single-flight (request coalescing): 1000 concurrent requests for the same key are collapsed into one origin fetch.
  - *Reasoning:* Without collapsing, 1000 origin fetches cause a traffic spike, potentially degrading the origin.
  - *Example:* 10k users open the same lesson simultaneously; the edge waits for one fetch, then serves all from cache.
  - *Common wrong answer:* "Use a higher TTL." (That reduces misses but doesn't prevent stampede.)
  - *Follow-up:* How do you tune single-flight? (Max outstanding requests per key; abort the rest.)
- **Question 4 (Level 4):** How would you serve a localized course page with a different language?
  - *Answer:* Prefix the cache key with the language code: `lesson:42:es` vs `lesson:42:en`. The edge serves the correct language from cache.
  - *Reasoning:* Caches are keyed by the full URI; different language pages are different keys.
  - *Example:* A user in Mexico requests `/courses/10/lessons/42` with `Accept-Language: es-MX`; the edge caches under `lesson:10:42:es`.
  - *Common wrong answer:* "The edge should render the page in the user's language on the fly." (Too slow at the edge.)
  - *Follow-up:* How do you avoid cache bloat from 10 languages per lesson? (LRU eviction; only cache the top 3 languages per lesson.)
- **Question 5 (Level 5):** Design a cache invalidation system for edge content.
  - *Answer:* (1) On write, publish an `INVALIDATE` event on a topic `content:{key}`. (2) All edge nodes subscribe and delete the key. (3) If delivery fails, the key expires after TTL. (4) Validate invalidation on read (check `Cache-Control` header).
  - *Reasoning:* Correctness of invalidation requires the write path to publish; the edge must be the subscriber.
  - *Example:* Topic `content:lesson:42`; node in Tokyo deletes `lesson:42`, node in NY deletes `lesson:42`.
  - *Common wrong answer:* "We can just wait for TTL to expire." (Incorrect — that's the fail-safe, not invalidation.)
  - *Follow-up:* How do you bound the number of invalidation messages? (Sharding by entity ID; batch invalidations.)
