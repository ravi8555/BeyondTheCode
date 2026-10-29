## 8. Performance and Scalability

- **Characteristics, complexity:** Invalidation message processing is O(n) per key, where n is the number of tags referenced. In practice, n is small.
- **Latency/throughput implications:** Bulking multiple invalidation events reduces per-message overhead. Cache node p99 processing time: <5ms for 1000 keys.
- **Resource use:** CPU on cache nodes is low; network is the bottleneck. For 10k writes/s with 5 tags each, that's 50k messages/s to cache.
- **Benchmarking/load-testing:** Use `ab` or custom Go load tester to send 10k writes/s. Measure p99 invalidation latency. Target: <100ms p99 across all nodes.
- **Measurements:** 10k writes/s → 50k invalidation msgs/s → p99 ack 40ms, dropped 0 (with NATS).

---

## 9. Testing and Debugging

- **Unit tests:** `InvalidateEvent` fields, tag resolution, version mismatch handling.
- **Failure injection:** Kill Redis replica, send invalidation, verify replication resumes.
- **Debug commands:** `redis-cli --scan --pattern "lesson:*" | wc -l` to count cache entries.
- **Metrics to check:** `invalidations{delivered, acked, dropped, stale}`.
- **Expected failure signals:** High `dropped` or `stale` counters; p99 invalidation latency >100ms.

---

## 10. Follow-Up Interview Questions

- **Question 1 (Level 1):** What is the difference between cache invalidation and TTL expiration?
  - *Answer:* TTL is a time-based self-cleaning mechanism; invalidation is an event-driven signal that marks entries as stale immediately upon a data change.
  - *Reasoning:* TTL requires waiting; invalidation is immediate.
  - *Example:* A user updates their profile. TTL clears after 5 minutes; invalidation clears it in 10ms.
  - *Common wrong answer:* "They are the same." (No — TTL is passive; invalidation is active.)
  - *Follow-up:* What happens when both are configured? (TTL is the safety net; invalidation is the primary mechanism.)
- **Question 2 (Level 2):** How do you invalidate a cached derived value that depends on multiple tables?
  - *Answer:* Use a dependency graph. When any table changes, find all cache keys that reference it and invalidate those.
  - *Reasoning:* Caching materialized views requires transitive invalidation.
  - *Example:* `order_summary` depends on `orders` and `payments`. Update `payments`, invalidate `order_summary:*`.
  - *Common wrong answer:* "Invalidate the whole cache." (The correct one is to invalidate all dependent keys.)
  - *Follow-up:* How do you detect a stale derived cache key? (Compare snapshot version in DB vs. cache version.)
- **Question 3 (Level 3):** How would you ensure garbage collection doesn't remove an active key?
  - *Answer:* Use reference counting or a "hot key" set. A key with active readers is never GC'd.
  - *Reasoning:* GC is destructive; active keys need protection.
  - *Example:* `session:{id}` has 50 readers. GC won't delete it until readers drop to 0.
  - *Common wrong answer:* "Just delete it and let readers catch up." (That causes cold starts.)
  - *Follow-up:* How do you bound the "hot key" set? (Use a time-windowed LRU estimate.)
- **Question 4 (Level 4):** How would you handle cross-region invalidation?
  - *Answer:* Use a global event bus or a strong consistency protocol (e.g., Paxos/Raft) to propagate invalidation across regions.
  - *Reasoning:* Local invalidation only affects one region's cache. Multi-region requires consensus.
  - *Example:* Node in `us-east-1` invalidates `user:42`. A node in `eu-west-1` that hasn't received the event keeps the stale value.
  - *Common wrong answer:* "We can just sync the DB." (That doesn't touch the cache.)
  - *Follow-up:* How do you handle a region that's offline? (Buffering in an outbound queue; replay on reconnect.)
- **Question 5 (Level 5):** Design a garbage collection algorithm for expiration keys.
  - *Answer:* Use a tiered approach: (1) soft TTL for recently invalidated keys, (2) hard TTL for cold keys, (3) lazy GC for reported keys.
  - *Reasoning:* A single global TTL is inefficient for varied access patterns.
  - *Example:* Key A expires in 10s, B in 1h, C in 10m. Tiered TTL ensures A is evicted quickly while B is not evicted too soon.
  - *Common wrong answer:* "Use a single TTL for all keys." (That breaks the trade-off between freshness and hit ratio.)
  - *Follow-up:* How do you tune the tiers? (Measure access patterns and set TTL based on empirical miss latency.)
