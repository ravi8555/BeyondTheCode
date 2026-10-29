```yaml
# docker-compose.yml
version: "3.8"
services:
  redis-primary:
    image: redis:7-alpine
    command: ["redis-server", "--protected-mode", "no", "--appendonly", "yes"]
    ports: ["6379:6379"]
  redis-cache:
    image: redis:7-alpine
    command: ["redis-server", "--replicaof", "redis-primary", "6379"]
```

- **Configuration (env vars, config files):**
  - `CACHE_ADDR=redis://localhost:6379`
  - `BUS_ADDR=nats://localhost:4222`
  - `INVALIDATION_ACK_TIMEOUT=3s`
  - `INVALIDATION_TTL_FALLBACK=30s`

```go
// InvalidateEvent represents a cache invalidation signal.
type InvalidateEvent struct {
    Keys      []string   // Specific keys to delete
    Tags      []string   // Tags to resolve to keys (tag-based invalidation)
    EntityIDs []string   // Entity IDs referenced by tags (for dependency graph)
    Version   uint64     // Expected DB version; skip if mismatch
}
```

- **Testing (unit, integration, failure tests):**
  - Unit: Test `InvalidateEvent` parsing and no-op for empty sets.
  - Integration: Spin up Redis + NATS, send event, verify Redis DEL fired on replica.
  - Failure: Kill one node, send event, verify it catches up on rejoin.

- **Expected result / representative output:**
  ```
  [handlers] InvalidateEvent{keys:["lesson:42"], tags:[], entityIDs:["42"], version:3} -> DEL lesson:42 OK
  [metrics] invalidations{delivered=1, acked=1, dropped=0, stale=0} rate=0.000123 1m
  ```

- **Explanation of key code and design decisions:** The `Version` field ensures idempotency: if the DB version changed between send and delivery, the event is discarded (dropped) rather than applied to a stale entity. This is the "at-most-once" translation from the at-least-once event bus.
