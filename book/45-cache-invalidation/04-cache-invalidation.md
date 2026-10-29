## 5. Production-Ready Implementation

- **What must change before real deployment:**
  - **Scalability:** For 100k+ invalidations/day, batch multiple invalidation events into a single message to reduce event bus load. Support sharding of invalidation topics by entity type.
  - **Security:** Restrict invalidation topics to trusted service accounts. Use signed JWT tokens for bus publish.
  - **Secrets:** Never store cache keys or entity IDs in event payloads; use cryptographic references (hashes) instead.
  - **Resources:** Cache node receives three invalidation messages per write. For 10k writes/sec, that's 30k messages/sec to the cache. Plan network bandwidth accordingly.
  - **Timeouts:** `ack_timeout` must be tuned for the slowest node in the region.
  - **Failure handling:** If a node doesn't ACK, it must reconnect and catch up on missed invalidations (replay). Implement a bounded replay queue.
  - **Deployment/rollback:** Blue-green deploy of the cache invalidation service with a canary rollout. Half the cache nodes run the new version first.
  - **Testing:** Load test invalidation at 10k e/s to measure p99 ack latency. Fuzz test tag resolution.

---

## 6. Edge Cases and Failure Scenarios

- **Scenario:** Invalidation event lost, data strongly consistent.
  - *Cause:* Node dropped event, NATS cluster partition.
  - *Impact:* User sees stale data for up to TTL (up to `invalidation.ttl_fallback`).
  - *Detection:* Metrics `dropped` counter increases; alerts on stale cache.
  - *Prevention/mitigation:* Increase `invalidation.ttl_fallback` only when staleness is acceptable; implement node replay on reconnect.
  - *Test:* Stop a Redis node, send event, verify it catches up on rejoin.
- **Scenario:** Tag-based invalidation resolves to zero keys (stale tag reference).
  - *Cause:* An entity ID was deleted from DB, but tag mapping wasn't cleaned up.
  - *Impact:* No-op, but wasted effort.
  - *Detection:* Metrics on tag resolution hit count.
  - *Prevention/mitigation:* Periodic garbage collection of stale tag mappings.
  - *Test:* Delete a tag mapping entry, send invalidation, verify skipped.
- **Scenario:** Ordering violation (delete before DB commit).
  - *Cause:* Async write path + async invalidation.
  - *Impact:* Cache entry deleted that now exists. Next read misses cache, repopulates.
  - *Detection:* Redis metrics on cache misses spike.
  - *Prevention/mitigation:* Version check in `InvalidateEvent`; abort if version mismatch.
  - *Test:* Inject a DB version change behind an invalidation; verify the invalidation was ignored.

---

## 7. Common Mistakes and Anti-Patterns

- **Mistake:** Treating invalidation as synchronous to the write path.
  - *Why devs choose it:* "I want it done immediately."
  - *Why it fails:* Slows down the critical write path, blocking the checkout flow.
  - *Correct alternative:* Fire-and-forget via event bus; the cache eventually converges.
  - *Real-world consequence:* Checkout latency increases 400ms per write.
- **Mistake:** Setting very short TTLs to "force" consistency.
  - *Why devs choose it:* "I just need it to expire soon."
  - *Why it fails:* Cache churn, low hit ratio, higher upstream load.
  - *Correct alternative:* Keep TTL reasonable (1–10s), rely on invalidation for correctness.
  - *Real-world consequence:* Cache hit ratio dropped from 92% to 12%.
- **Mistake:** Broadcasting invalidation when a node is offline.
  - *Why devs choose it:* "Simplest approach."
  - *Why it fails:* Lost messages, no replay, silent staleness.
  - *Correct alternative:* Store a replay queue for offline nodes.
  - *Real-world consequence:* Data inconsistent across regions for hours.
