## 5. Production-Ready Implementation

- **What must change before real deployment:**
  - **Scalability:** Use a distributed KV with eventual consistency (Cloudflare KV, Redis Cluster). For 10B requests/day, plan for ~50k req/s to the KV.
  - **Security:** Validate `Cache-Control` headers; sign cache keys for user-specific content. Never cache private data.
  - **Secrets:** Rotate API keys for the edge cache service; use short-lived tokens in environment variables.
  - **Resources:** Edge KV is limited to 1000 writes/s per namespace. For 50k writes/s, shard by course ID: `cache:{course_id}`.
  - **Timeouts:** Set `max_age` and `stale_if_error` on the origin; the edge respects both.
  - **Failure handling:** If KV is down, the edge falls back to origin and repopulates on next request.
  - **Deployment/rollback:** Use Cloudflare's environment branching (preview, production) with automatic cache invalidation on prod deploys.
  - **Testing:** Load test with `wrk` at 10k req/s; verify cache hit ratio and p95 latency.

---

## 6. Edge Cases and Failure Scenarios

- **Scenario:** Origin returns 500, cache TTL expires, users see repeated upstream errors.
  - *Cause:* Origin is down; cache TTL expires; next request fails.
  - *Impact:* Downtime amplified by edge cache misses.
  - *Detection:* High 5xx rate at the origin; cache miss spike at the edge.
  - *Prevention/mitigation:* Use `stale-if-error` to serve last-known-good content for up to 300s.
  - *Test:* Stop origin, send requests; verify the edge serves stale data for the stale-if-error window.
- **Scenario:** Cache stampede on viral content (course goes viral on Twitter).
  - *Cause:* 10k concurrent requests for the same lesson page.
  - *Impact:* Origin traffic spikes, causing origin degradation.
  - *Detection:* Edge logs show many "cache miss" events in a short window.
  - *Prevention/mitigation:* Request coalescing (single-flight) reduces the burst to one fetch per PoP.
  - *Test:* Inject 10k concurrent requests for the same key; verify origin sees 1 request, not 10k.

---

## 7. Common Mistakes and Anti-Patterns

- **Mistake:** Caching user-specific data at the edge without signing the key.
  - *Why devs choose it:* "It's just a read. Why not cache?"
  - *Why it fails:* User A's data is served to User B if the edge key is predictable (e.g., `user:42`).
  - *Correct alternative:* Sign keys with the authenticated user's ID (e.g., `user:42:session:abc123`).
  - *Real-world consequence:* User A sees User B's profile.
- **Mistake:** Setting `Cache-Control: no-cache` on all pages.
  - *Why devs choose it:* "I want to be safe."
  - *Why it fails:* Every request hits the origin; no edge cache benefit.
  - *Correct alternative:* Use `max-age` with revalidation.
  - *Real-world consequence:* All page loads are 300ms slower.
- **Mistake:** Not invalidating the edge cache after a write.
  - *Why devs choose it:* "Cache writes are slow."
  - *Why it fails:* Stale content served for the TTL duration, then a burst of miss requests.
  - *Correct alternative:* Invalidate on write; use `Cache-Control: max-age=0, must-revalidate` for immediate revalidation.
  - *Real-world consequence:* Users see old content for up to 10 minutes.
