## 12. Hands-On Exercises

- **Beginner:** Write a unit test that verifies `InvalidateEvent` ignores version mismatches. Hint: you need to check the entity version against the event.
- **Intermediate:** Implement a tag-based invalidation resolver. Hint: build a mapping from tag → keys.
- **Advanced:** Design a bounded replay queue for offline cache nodes. Hint: use a circular buffer with a sliding window.
- **Solutions:** Solutions are in `book/code/45-cache-invalidation/solutions/` (to be added).

---

## 13. Chapter Summary and Revision Notes

- **Five key takeaways:**
  1. Cache invalidation is an event-driven signal that marks entries as stale after a data change.
  2. Deletion is the simplest, cheapest invalidation strategy for mutable, small keys.
  3. Tag-based invalidation reduces the blast radius of a single write by clearing only dependent keys.
  4. Version-tag invalidation provides strong consistency at the cost of extra metadata.
  5. TTL is the safety net; invalidation is the primary mechanism.
- **Quick revision sheet:** O(n) invalidations per write; bounded ledger of invalidations; idempotent put; TTL as fallback.
- **Essential terminology:** Invalidation, cache miss, TTL, tag, dependency graph, at-least-once, at-most-once, version tag, bounded replay.
- **Important formulas/configuration:** `invalidation.ack_timeout = 3s`, `invalidation.ttl_fallback = 30s`, `invalidation.bulk_threshold = 1000`.
- **Decision-making checklist:** "Do I need definitive consistency? Use version tags. Am I willing to accept stale reads? Use TTL only. Are there many dependent keys? Use tags."
- **Five flashcards:** What is cache invalidation? → Event-driven signal to remove stale cache entries. What is the simplest invalidation strategy? → Delete. What is the trade-off between version-tag and tag-based? → Version: correctness vs. overhead. Tag: flexibility vs. complexity. When is invalidation unnecessary? → Immutable data with versioned keys. What is the fail-safe for lost invalidations? → TTL expiration.
- **Three comprehension-verification questions:**
  1. How would you invalidate a cache key that depends on two other keys with different update frequencies?
  2. What are the failure modes of a global event bus for invalidation?
  3. How do you measure the effectiveness of your invalidation strategy?
- **Authoritative references and further reading:** Redis documentation on invalidation patterns; NATS documentation on message ordering; "Designing Data-Intensive Applications" (Ch. 7) on caching and consistency.

---

> **Cross-Reference:** See → Chapter 44 (Caching) for the caching layer design, → Chapter 20 (Transaction Isolation) for the guarantee that your writes are visible before you invalidate, and → Chapter 21 (Distributed Locks) for coordinating invalidation across the cache cluster.

---

> **FormForge context:** The shared `forms` table uses a `lesson_cache` tag; updating a lesson invalidates `lesson:{id}` and `course:{id}:lessons`. The `payments` edge cache uses tag-based invalidation: `payment:{id}` tags `order:{id}`, which tags `user:{id}`. Changing a payment or order invalidates the user's cached payment state.

---

> **Use cases in FormForge:** After a user updates their profile, all cached `user:{id}` records (in the user detail cache, edge profile cache, and organization list cache) are invalidated in a single topic `user:{id}`. The organization list cache uses delete invalidation: `org:list` is deleted on any membership change. The `course:{id}:lessons` key is versioned: on lesson update, `course:{id}:lessons` is renamed to `course:{id}:lessons:v2`.

---

> **End of Chapter 45.**
