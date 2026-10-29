## 11. Scenario-Based Engineering Problems

- **Scenario 1:** You push a new theme for the book reader. All 1000+ users see the old CSS for up to 10 minutes.
  - *Problem statement:* The edge cache is stale for CSS files.
  - *Constraints:* Cannot redeploy the edge cache.
  - *Options:* (a) Use versioned URLs (e.g., `theme.css?v2`); (b) Increase TTL to 10 minutes; (c) Use `Cache-Control: no-cache` for CSS.
  - *Recommended solution:* Use versioned URLs (`theme.css?v2`) → the edge treats it as a new key.
  - *Alternatives/trade-offs:* (b) is simpler but allows stale for 10 minutes; (c) is safe but loses caching.
  - *Failure scenarios:* The version bump is missed by the CDN; old CSS still served.
  - *Testing strategy:* Verify `Cache-Control: max-age` is set on the HTML and the CSS; check `cf-cache-status`.
- **Scenario 2:** A server outage affects the origin. Users in Europe still see content after an hour.
  - *Problem statement:* The edge cache serves stale content for too long.
  - *Constraints:* The origin is down; users must still read the book.
  - *Options:* (a) Rely on `stale-if-error` (300s); (b) Manually purge the edge cache; (c) Set a shorter TTL.
  - *Recommended solution:* Use `stale-if-error=3600` (1 hour of stale serving).
  - *Alternatives/trade-offs:* (a) is a resilience feature; (b) requires manual intervention; (c) reduces late.
  - *Failure scenarios:* The stale content is not correct (e.g., a course price is wrong).
  - *Testing strategy:* Load test with origin down; verify `stale-if-error` serves for the full window.
- **Scenario 3:** A course is taken down after a copyright claim. The CDN still serves the old course content for 1 hour.
  - *Problem statement:* The edge cache serves removed content.
  - *Constraints:* The course must be purged from the edge immediately.
  - *Options:* (a) Invalidate the edge cache on take-down; (b) Set `max-age=0` for sensitive courses; (c) Use a purge API.
  - *Recommended solution:* Use an immediate invalidation on take-down (publish to the invalidation topic).
  - *Alternatives/trade-offs:* (b) is safe but means no caching for those courses; (c) is manual.
  - *Failure scenarios:* The invalidation is missed by some PoPs; old content still served.
  - *Testing strategy:* Verify `cache-control: max-age=0` on sensitive courses; verify invalidation topic is subscribed by all PoPs.

---

## 12. Hands-On Exercises

- **Beginner:** Write a function that generates a cache key from a request path and query string. Hint: hash the full URI.
- **Intermediate:** Implement single-flight request coalescing for a missing cache key. Hint: use a promise map.
- **Advanced:** Design a distributed cache with cross-region invalidation broadcast. Hint: use a pub/sub topic per entity.
- **Solutions:** Solutions are in `book/code/49-edge-caching/solutions/` (to be added).

---

## 13. Chapter Summary and Revision Notes

- **Five key takeaways:**
  1. Edge caching is a geographic optimization that places copies of data at the network edge.
  2. Full-page caching is the simplest; API caching requires signing and request normalization.
  3. Request coalescing (single-flight) prevents cache stampedes on viral content.
  4. Invalidation is the write path's responsibility; the edge cannot fetch fresh data on demand.
  5. `max-age` and `stale-if-error` are complementary: freshness vs. resilience.
- **Quick revision sheet:** O(1) cache lookup; LRU eviction; single-flight request coalescing; TTL as freshness; invalidation as coherence.
- **Essential terminology:** Edge cache, PoP, CDN, ESI, single-flight, stampede, `Cache-Control: max-age`, `stale-if-error`, `ETag`, `If-None-Match`.
- **Important formulas/configuration:** `edge.cache.ttl = 600s`, `edge.cache.max_items = 100000`, `edge.request_coalescing = true`, `edge.cache.max_body_bytes = 500000`.
- **Decision-making checklist:** "Is the data public? Use edge cache. Is it user-specific? Sign the key. Is the write frequent? Invalidate on write."
- **Five flashcards:** What is the difference between edge caching and application caching? → Edge is geographic; app is in-memory. What is request coalescing? → Collapse concurrent requests for the same key into one. What is `stale-if-error`? → Serve stale data when the origin is down. When is edge caching unnecessary? → User-specific private data. How do you invalidate the edge on a write? → Publish to the invalidation topic.
- **Three comprehension-verification questions:**
  1. What is the trade-off between `max-age=600` and `max-age=0, must-revalidate`?
  2. How would you prevent a cache stampede on a viral lesson page?
  3. How do you invalidate the edge cache for a user-specific page?
- **Authoritative references and further reading:** Cloudflare Cache API documentation; Fastly VCL documentation; "HTTP: The Definitive Guide" (Ch. 6) on caching.

---

> **Cross-Reference:** See → Chapter 44 (Caching, Volumes, and Memory) for application-level caching, → Chapter 21 (Distributed Locks) for cache coherence, and → Chapter 22 (Content Delivery) for CDN configuration.

---

> **FormForge context:** The CDN edge serves `/courses/10/lessons/42` with `Cache-Control: max-age=600`. The `lesson:42` key is invalidated on every lesson update. Static assets are versioned (e.g., `app.js?v=3`). The `edgenotify` service listens to the invalidation topic and deletes the edge cache on all PoPs.

---

> **End of Chapter 49.**
