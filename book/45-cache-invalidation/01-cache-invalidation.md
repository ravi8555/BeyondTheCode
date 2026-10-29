# Chapter 45 — Cache Invalidation

> **Part IV — Advanced Patterns**  
> **Prerequisites:** Chapter 44 (Caching), Chapter 20 (Transaction Isolation), Chapter 21 (Distributed Locks)  
> **FormForge context:** The shared `forms` table and the `payments` edge cache used by the checkout service.

## 1. Definition and Fundamentals

- **What the concept is:** Cache invalidation is the process of removing or updating stale data from a cache so that subsequent reads return the correct, up-to-date values. It is the inverse of caching: instead of deciding what to store, you decide when what is no longer valid.
- **Why it exists / what problem it solves:** Caches are inherently snapshots. By the time data is copied into a cache, the source of truth may have changed. Without invalidation, users read stale data — during checkout, a user could be charged twice for the same order because the `payments` edge cache returned a cached "order already paid" response.
- **How it works internally (progressively deeper):** At the top level, invalidation is a write-through or write-behind signal sent to the cache layer when the source database changes. Below that, the cache layer tracks keys and their dependencies (e.g., key `order:42` depends on `users:1`, `products:10`). When any dependency changes, the cache either deletes the key, refreshes it, or bumps a version tag. At the lowest level, invalidation converges across replicas using a gossip or primary-driven protocol, with a finite bounded backlog of invalidation events that expires if delivery never succeeds.
- **Where it fits in a typical application architecture:** Invalidation lives at the boundary between the write path (database, API) and the read path (cache, CDN, edge). It is the last line of defense before stale data ever reaches a client.
- **A real-world analogy:** A restaurant kitchen marks a dish "OUT OF STOCK" on the pass board the moment the last portion is plated and served. Servers stop taking orders for that dish until it is restocked and relabelled. The label is the cache entry; the mark is the invalidation.
- **A production example:** At FormForge, when an admin updates a `Lesson`, the service publishes a `PUBLISH` event to the global edge cache. All edge nodes receiving the invalidation remove `lesson:{id}` from their local cache and reset dependent keys such as `course:{id}:lessons` and `curriculum:quiz:{id}`. If the invalidation message is lost or the node is offline, the key expires on its TTL. This trade-off (results in a stale read for up to TTL duration, not correctness) is acceptable because the TTL is short and the data is not order-critical.
- **When it is necessary / when it is unnecessary:** Necessary for data that changes and is read frequently. Unnecessary for immutable data (static assets, public promo banners) where a versioned key (e.g., `lesson:42:v2`) makes invalidation trivial.

## 2. Types, Variants, and Classifications

- **Write-through invalidation:** The write path updates the cache at the same time as the database, then signals invalidation. Correct by construction for the primary region.
- **Write-behind (lazy) invalidation:** Cache updates are batched and sent asynchronously after the write commits, reducing write amplification on the shared cache cluster.
- **Delete invalidation:** The simplest form — the cache entry is deleted. Next read incurs a cache miss and repopulates. Best for highly mutable, small keys.
- **Tag-based invalidation:** Keys are tagged with dependency lists (e.g., `order:42` tagged with `user:1`, `product:10`, `cart:7`). Invalidating a related key (e.g., `user:1`) clears all keys that reference it.
- **Version-tag invalidation:** Each write bumps a global version counter (or a per-entity version). Cache keys carry a version prefix (e.g., `lesson:42:v3`). Expired old versions are cleaned lazily.
- **Pub/Sub propagation:** A writer publishes a `INVALIDATE` event on a topic; all cache nodes subscribe and delete locally cached entries. Requires at-least-once delivery semantics, which the runtime translates to at-most-once through ack/retry.

**Comparison table:**

| Strategy | Correctness | Latency | Operational cost | When to use |
|---|---|---|---|---|
| Delete | High (with ack) | Low | Low | Mutable, small keys |
| Tag-based | High | Medium | High | Multiple consumers per key |
| Version-tag | High | Low | Medium | Hot keys with short TTL |
| Pub/Sub | Medium (at-least-once) | Low | Medium | Cross-region caches |

**Decision guide ("choose X when…"):** Choose delete when the value is small, changes frequently, and a brief cache miss is acceptable. Choose tag-based when a key is shared by many consumers and you need to clear many keys with one signal. Choose version-tag when you can afford longer TTLs but want strong eventual consistency.
