# Chapter 14 � Idempotency

> **Part I � Traffic Management and Deployment**
> **Prerequisites:** Chapter 12 (Retries), Chapter 13 (Exponential Backoff)
> **FormForge context:** When the submission API retries a failed payment, the customer gets charged twice. Idempotency ensures that retrying a request produces the same result as making it once, preventing duplicate charges, duplicate submissions, and other side effects.

---

## 1. Definition and Fundamentals

### What it is

An operation is **idempotent** if making the same request multiple times produces the same result as making it once. In mathematical terms: f(f(x)) = f(x).

In the context of distributed systems and HTTP APIs, idempotency means that a client can safely retry a request without causing duplicate side effects (double charges, duplicate form submissions, duplicate emails, etc.).

### Why it exists / what problem it solves

Without idempotency:

| Scenario | Without Idempotency | With Idempotency |
|----------|---------------------|-------------------|
| Network timeout after payment processed | Customer charged twice | Customer charged once |
| Retry after form submission | Duplicate form entries | Single submission |
| Retry after email sent | Duplicate emails | Single email |
| Retry after inventory decrement | Oversold inventory | Correct inventory |

Without idempotency, retries (? Chapter 12) can cause duplicate side effects, making it unsafe to automatically recover from transient failures.

With idempotency:

- **Safe retries:** Clients can retry failed requests without fear of duplicate processing
- **Reliable recovery:** Transient failures can be handled automatically with retries
- **Data integrity:** No duplicate charges, submissions, or state changes
- **Better UX:** Users don't see errors for retries that succeed on the second attempt

### How it works internally (first pass)

Idempotency works through a key-based deduplication mechanism:

1. **Client generates a unique key:** The client creates a UUIDv4 idempotency key for the logical operation
2. **Client includes key in request:** The key is sent as an Idempotency-Key header
3. **Server checks key:** On receiving a request, the server checks if this key was already processed
4. **If key exists:** Return the cached result from the previous processing
5. **If key is new:** Process the request, store the result with the key, return the result
6. **Key expires:** After a TTL, the cached result is removed to free storage

The idempotency key must be:
- **Unique per logical operation:** Different operations get different keys
- **Same across retries:** All retries of the same operation use the same key
- **Unpredictable:** Use UUIDv4 to prevent key collision attacks

### Where it fits in the architecture

Idempotency is applied at multiple layers:

1. **API gateway / edge** � idempotency key validation before requests reach backend services (? Chapter 05)
2. **Application middleware** � idempotency wrapper around route handlers
3. **Service layer** � business logic checks idempotency key before mutating state
4. **Database** � unique constraints on idempotency key column prevent duplicate writes

Idempotency is essential for retries (? Chapter 12) and exponential backoff (? Chapter 13): without idempotency, retrying a failed payment or form submission could cause duplicate charges or entries.

## 2. Types, Variants, and Classifications

### By key generation

| Type | Description | Best for |
|------|-------------|----------|
| **Client-generated** | Client creates UUIDv4 key | Most common; client controls uniqueness |
| **Server-generated** | Server generates and returns key | When client can't be trusted to generate unique keys |
| **Hybrid** | Client suggests, server validates | Enterprise APIs with audit requirements |

### By storage backend

| Type | Scope | Trade-off |
|------|-------|-----------|
| **Redis** | Distributed, shared across instances | Fast, requires infrastructure |
| **Database** | Durable, ACID-compliant | Slower, no extra infrastructure |
| **In-memory** | Single instance only | Fastest, not shared across instances |

### By scope

| Scope | Example | TTL |
|-------|---------|-----|
| **Per-endpoint** | `pay:user123:order456` | 24 hours |
| **Per-user** | `user:123:all_ops` | 7 days |
| **Per-resource** | `resource:order456` | 1 hour |
| **Global** | `op:uuid4` | 30 days |

### By HTTP method

| Method | Idempotent? | Requires key? | Notes |
|--------|-------------|---------------|-------|
| **GET** | Yes | No | Safe; no side effects |
| **PUT** | Yes | No | Same update twice = same result |
| **DELETE** | Yes | No | Deleting twice = still deleted |
| **HEAD** | Yes | No | Same as GET, no body |
| **POST** | No | **Yes** | Non-idempotent; needs key for safe retries |
| **PATCH** | Depends | Depends | Depends on implementation |

## 3. Internal Working and Architecture

### Execution flow: key-based deduplication

1. **Client generates key:** The client creates a UUIDv4 idempotency key for the logical operation
2. **Client sends request:** The key is included as an `Idempotency-Key` header
3. **Middleware intercepts:** The idempotency middleware extracts the key from the request header
4. **Store lookup:** The middleware checks the idempotency store (Redis) for a cached result
5. **Cache hit:** If found, return the stored response immediately without calling the handler
6. **Cache miss:** If not found, call the downstream handler and capture the response
7. **Store result:** If the response is successful (2xx), store it in the idempotency store with TTL
8. **Return response:** Return the handler's response to the client

### Failure paths drawn explicitly

| Stage | Failure mode | Effect | Mitigation |
|-------|-------------|--------|------------|
| **Key generation** | Client reuses key for different operations | Wrong result returned for second operation | Document that keys must be unique per logical operation |
| **Store lookup** | Idempotency store is down | All idempotent requests fail | Implement graceful degradation; proceed without caching |
| **Cache hit** | Stale cached result returned | Client gets outdated response | Set appropriate TTLs; document key expiration |
| **Store write** | Store write fails after handler executed | Request processed but not cached; retry will re-process | Log warning; accept the risk of duplicate processing |
| **Response capture** | Handler streams large response | Memory pressure from buffering | Enforce max result size; skip caching for large responses |

### Algorithms and complexity

| Metric | Value / assumption |
|--------|-------------------|
| **Key lookup** | O(1) Redis GET |
| **Key store** | O(1) Redis SET with TTL |
| **Response capture** | O(n) where n = response body size |
| **Memory per key** | O(response size + metadata) |
| **Distributed lookup** | O(1) Redis GET + network RTT |

### Important configuration parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `TTL` | 24h | 1min–30d | How long cached results are retained |
| `MaxResultSize` | 1MB | 1KB–10MB | Maximum response body size to cache |
| `Store type` | Redis | Redis, in-memory | Backing store for idempotency records |
| `Key entropy` | 122 bits | UUIDv4 | Randomness for key generation |

## 4. Practical Implementation

### Scenario

FormForge's submission API retries failed payment requests. Without idempotency, a retry after a successful payment charges the customer twice. Idempotency ensures that retrying a request produces the same result as making it once, preventing duplicate charges, duplicate submissions, and other side effects.

### Requirements

- Generate UUIDv4 idempotency key for each logical operation
- Include `Idempotency-Key` header in all mutating requests (POST, PATCH)
- Server checks key before processing; returns cached result if duplicate
- Store results in Redis with TTL (24h for payments, 7d for forms)
- Only cache successful (2xx) responses
- Graceful degradation when idempotency store is unavailable

### Technology stack

- Go 1.21+
- Redis for distributed idempotency store
- Standard library (`context`, `encoding/json`, `time`, `crypto/rand`)

### Project structure

```
    key.go              # Key generation and validation
    middleware_test.go  # Unit tests
```

### Configuration

```go
type Config struct {
    Store          Store
    TTL            time.Duration
    MaxResultSize  int64
}

func DefaultConfig(store Store) Config {
    return Config{
        Store:        store,
        TTL:          24 * time.Hour,
        MaxResultSize: 1 * 1024 * 1024, // 1MB
    }
}
```

### Implementation

**Store interface:**

```go
package idempotency

import (
    "context"
    "encoding/json"
    "time"
)

type IdempotencyKey string

type StoredResult struct {
    StatusCode int               `json:"status_code"`
    Headers    map[string]string `json:"headers"`
    Body       []byte            `json:"body"`
    CreatedAt  time.Time         `json:"created_at"`
}

type Store interface {
    Get(ctx context.Context, key IdempotencyKey) (*StoredResult, bool)
    Set(ctx context.Context, key IdempotencyKey, result *StoredResult, ttl time.Duration) error
    Delete(ctx context.Context, key IdempotencyKey) error
}
```

**Middleware:**

```go
type Middleware struct {
    store      Store
    ttl        time.Duration
    maxResult  int64
}

func New(store Store, ttl time.Duration, maxResult int64) *Middleware {
    return &Middleware{store: store, ttl: ttl, maxResult: maxResult}
}

func (m *Middleware) Wrap(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        key := IdempotencyKey(r.Header.Get("Idempotency-Key"))
        
        if key == "" {
            next.ServeHTTP(w, r)
            return
        }
        
        // Check if result already cached
        if result, found := m.store.Get(r.Context(), key); found {
            w.Header().Set("Content-Type", result.Headers["Content-Type"])
            w.WriteHeader(result.StatusCode)
            w.Write(result.Body)
            return
        }
        
        // Capture response for caching
        captured := &responseCapture{ResponseWriter: w}
        next.ServeHTTP(captured, r.WithContext(r.Context()))
        
        // Only cache successful responses
        if captured.statusCode >= 200 && captured.statusCode < 300 {
            if int64(len(captured.body)) <= m.maxResult {
                result := &StoredResult{
                    StatusCode: captured.statusCode,
                    Headers:    captured.headers(),
                    Body:       captured.body,
                    CreatedAt:  time.Now(),
                }
                m.store.Set(r.Context(), key, result, m.ttl)
            }
        }
    })
}

type responseCapture struct {
    http.ResponseWriter
    statusCode int
    body       []byte
    header     http.Header
}

func (c *responseCapture) WriteHeader(code int) {
    c.statusCode = code
    c.ResponseWriter.WriteHeader(code)
}

func (c *responseCapture) Write(b []byte) (int, error) {
    c.body = append(c.body, b...)
    return c.ResponseWriter.Write(b)
}
```

### Execution

```go
store := NewRedisStore(redisClient)
middleware := NewMiddleware(store, 24*time.Hour, 1<<20)

// Wrap your HTTP handler
http.Handle("/payments", middleware.Wrap(paymentHandler))

// Client sends idempotency key
req, _ := http.NewRequest("POST", "/payments", body)
req.Header.Set("Idempotency-Key", "uuid-v4-here")
resp, _ := client.Do(req)
```

### Testing

- Unit test: duplicate request with same key returns cached result
- Unit test: request without key passes through normally
- Unit test: only successful (2xx) responses are cached
- Unit test: expired keys are not returned from cache
- Unit test: store unavailability degrades gracefully
- Integration test: Redis-backed store persists results across restarts

### Expected result (representative)

```
Request 1: POST /payments with Idempotency-Key: abc-123
→ Process payment, charge $50, return 200, cache result

Request 2: POST /payments with Idempotency-Key: abc-123 (retry)
→ Key found in cache, return cached 200 without reprocessing

Request 3: POST /payments with Idempotency-Key: def-456 (different operation)
→ Key not found, process normally, charge $50, return 200, cache result
```

### Explanation of key decisions

- **UUIDv4 keys:** 122 bits of randomness makes collision probability negligible
- **Only cache 2xx responses:** Errors should be retried, not cached
- **TTL per operation type:** Payments need shorter TTL (24h) than form submissions (7d)
- **Graceful degradation:** When store is down, allow requests to proceed without idempotency
- **Max result size:** Prevent large payloads from consuming excessive cache memory

## 5. Production-Ready Implementation

### Correctness at scale: distributed idempotency

In a multi-instance deployment, idempotency state must be shared across all instances:

- **Redis-backed store:** All instances read/write to the same Redis instance
- **Database-backed store:** Use database transactions for ACID guarantees
- **Consistent hashing:** Route requests with the same key to the same instance

### Security and access control

- Idempotency keys should not be predictable (use UUIDv4)
- Keys should not expose user information or internal IDs
- Rate limiting should be applied per idempotency key to prevent key exhaustion attacks

### Configuration and secrets

- TTL values should be configurable per operation type
- Store connection details (Redis URL, database credentials) should be in environment variables
- Never log idempotency keys in plain text (they could be used for replay attacks)

### Resource management and latency

- Each idempotency check adds a store lookup (Redis GET: ~1ms)
- Result storage adds a store write (Redis SET: ~1ms)
- Memory usage grows with number of unique keys; TTL cleanup is essential
- Use Redis with eviction policy (LRU or TTL-based) to prevent unbounded growth

### Observability (the part that makes it operable)

- **Metrics:** `idempotency_hits_total` (counter), `idempotency_misses_total` (counter), `idempotency_store_errors_total` (counter)
- **Logging:** Log key cache hits and misses for debugging duplicate requests
- **Alerting:** Alert when store error rate exceeds threshold
- **Dashboard:** Show hit rate, miss rate, and store latency per operation type

### Idempotency, failure handling, graceful behavior

- When the idempotency store is unavailable, allow requests to proceed (fail-open)
- Log a warning when the store is unavailable for auditing
- Only cache successful responses; errors should always be retried
- Set appropriate TTLs so stale results are eventually cleaned up

### Deployment and rollback

- Deploy idempotency configuration behind feature flags
- Rollback = disable idempotency middleware
- Canary: test idempotency on a small percentage of traffic

### Testing and maintainability

- Chaos engineering: kill the idempotency store and verify graceful degradation
- Load test with concurrent requests using the same key
- Document idempotency key requirements in API client libraries

### Cost and operational complexity

- Idempotency store: minimal additional infrastructure (Redis or database table)
- The cost of *not* having idempotency (duplicate charges, customer support) far exceeds the implementation cost

## 6. Edge Cases and Failure Scenarios

### Case 1 — Duplicate payments after retry

- **Scenario:** Payment API charges customers twice when a retry occurs.
- **Cause:** Payment endpoint doesn't implement idempotency keys.
- **Impact:** Customers are charged multiple times for the same payment.
- **Detect:** Monitor for duplicate charges with same amount and customer.
- **Prevent:** Add Idempotency-Key header validation; cache successful payment results.
- **Test:** Retry payment request with same idempotency key; assert single charge.

### Case 2 — Idempotency store down

- **Scenario:** When Redis is unavailable, all idempotent requests fail.
- **Cause:** Middleware doesn't handle store unavailability gracefully.
- **Impact:** All requests with idempotency keys fail even if the service is healthy.
- **Detect:** Monitor idempotency store error rate.
- **Prevent:** Implement graceful degradation—when store is down, allow request to proceed but log warning.
- **Test:** Kill Redis; assert idempotent requests still succeed (without deduplication).

### Case 3 — Key reuse across different operations

- **Scenario:** A client uses the same idempotency key for two different form submissions.
- **Cause:** Client generates one key and reuses it for multiple logical operations.
- **Impact:** Second submission returns cached result from first submission.
- **Detect:** Monitor for cache hits with different request bodies.
- **Prevent:** Document that clients must generate a new key per logical operation.
- **Test:** Submit two forms with same key; assert second form gets its own result.

### Case 4 — Stale cached results

- **Scenario:** After a successful payment is processed, a retry returns the old cached result.
- **Cause:** TTL too long or client retries after TTL expiration expecting new processing.
- **Impact:** Client gets stale response instead of fresh processing.
- **Detect:** Monitor for cache hits where original processing time is old.
- **Prevent:** Set appropriate TTLs; document that idempotency keys deduplicate retries within the TTL window.
- **Test:** Set short TTL; wait for expiry; retry; assert fresh processing.

### Case 5 — Idempotency key collision

- **Scenario:** Two different clients generate the same idempotency key.
- **Cause:** Insufficient randomness in key generation (e.g., using timestamp-based keys).
- **Impact:** One client's result is returned to another client.
- **Detect:** Monitor for cache hits where request details don't match.
- **Prevent:** Use UUIDv4 with 122 bits of randomness; collision probability is negligible.
- **Test:** Generate 1M keys; assert no collisions.

## 7. Common Mistakes and Anti-Patterns

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|------------------|
| **No idempotency key on POST** | POST is non-idempotent; retries cause duplicate side effects | Require Idempotency-Key header on all POST/PATCH requests |
| **Caching error responses** | Errors should be retried, not served from cache | Only cache 2xx responses |
| **Key reuse across operations** | Different operations share a key; wrong result returned | Generate new key per logical operation |
| **No TTL on cached results** | Cache grows unbounded; stale results persist forever | Set appropriate TTL per operation type |
| **Store unavailability causes failure** | Idempotency store down blocks all requests | Fail-open: proceed without idempotency when store is down |
| **Using predictable keys** | Timestamp-based keys can be guessed/collided | Use UUIDv4 or cryptographically random keys |

## 8. Performance and Scalability

### Cost model per request

- **Key lookup:** O(1) store GET (~1ms with Redis)
- **Result storage:** O(1) store SET (~1ms with Redis)
- **Memory per entry:** O(result_size) for cached response body

### Complexity recap

| Operation | Time complexity | Space complexity |
|-----------|----------------|------------------|
| Idempotency check | O(1) with hash-based store | O(1) |
| Store result | O(1) per unique key | O(result_size) |
| TTL expiry | O(1) with Redis expiry | O(1) |

### Throughput and bottlenecks

- Idempotency checks add ~1-2ms latency per request (Redis round-trip)
- Under high load, the idempotency store can become a bottleneck
- Use Redis clustering or sharding for high-throughput scenarios
- Consider local caching of frequently accessed keys

### Scaling strategies

1. **Single Redis instance** — simplest, start here
2. **Redis Cluster** — horizontal scaling for high throughput
3. **Database-backed store** — if already using a database, add idempotency table
4. **Hybrid approach** — Redis for hot keys, database for cold keys

### Benchmarking method

- Benchmark idempotency middleware with and without cache hits
- Measure overhead of Redis GET/SET per request
- Test with various result sizes (1KB, 10KB, 100KB, 1MB)
- Use `pprof` to verify no memory leaks from cached results

## 9. Testing and Debugging

### Unit tests (no Redis)

```go
func TestIdempotencyCacheHit(t *testing.T) {
    store := NewMockStore()
    mw := NewMiddleware(store, 24*time.Hour, 1<<20)
    
    // First request
    captured1 := &responseCapture{ResponseWriter: httptest.NewRecorder()}
    mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(200)
        w.Write([]byte("result1"))
    })).ServeHTTP(captured1, &http.Request{
        Header: http.Header{"Idempotency-Key": []string{"key1"}},
    })
    
    // Second request with same key
    captured2 := &responseCapture{ResponseWriter: httptest.NewRecorder()}
    mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(200)
        w.Write([]byte("result2")) // Should NOT be called
    })).ServeHTTP(captured2, &http.Request{
        Header: http.Header{"Idempotency-Key": []string{"key1"}},
    })
    
    // Second request should return cached result, not call handler
    if string(captured2.body) != "result1" {
        t.Fatalf("expected cached result 'result1', got '%s'", captured2.body)
    }
}
```

### Integration tests (with Redis)

- Test with real Redis store
- Verify duplicate request returns cached result
- Verify TTL expiration works
- Verify store unavailability degrades gracefully

### Concurrency test

- Run N concurrent requests with same idempotency key
- Assert only one request is processed; others return cached result
- Assert no race conditions (use `go test -race`)

### Load test (k6 sketch)

```javascript
import http from 'k6/http';

export default function() {
    const resp = http.post('http://api:8080/payments', JSON.stringify({
        amount: 100,
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'unique-key-123',
        },
    });
    check(resp, {
        'status is 200': (r) => r.status === 200,
    });
}
```

### Failure injection

- Kill Redis; assert idempotent requests still proceed (fail-open)
- Inject latency in Redis; assert middleware doesn't hang indefinitely
- Corrupt cached result; assert middleware handles gracefully

### Debugging toolkit

- Check idempotency metrics: `idempotency_hits_total`, `idempotency_misses_total`
- Review logs for cache hit/miss patterns
- Check Redis keyspace for idempotency key distribution
- Verify TTL values are set correctly

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

1. What is idempotency, and why does it matter for distributed systems?
2. Which HTTP methods are naturally idempotent?
3. Which HTTP methods require idempotency keys for safe retries?
4. How does an idempotency key prevent duplicate processing?
5. Where should idempotency results be stored?

### Level 2 — Implementation

6. What TTL should be used for idempotency keys?
7. Should error responses be cached as idempotent results?
8. How do you handle idempotency store unavailability?
9. How do you generate idempotency keys?
10. How does idempotency work with retries?

### Level 3 — Advanced Engineering

11. How do you prevent idempotency key collisions?
12. What's the relationship between idempotency and retries?
13. How do you handle large cached results?
14. How do you distribute idempotency state across service instances?
15. What happens when a client reuses an idempotency key for different operations?

### Level 4 — Production Scenarios

16. Your payment API charges customers twice on retry. How do you fix this?
17. The idempotency store is down. How do you ensure requests still succeed?
18. How do you choose TTL values for different operation types?
19. How do you monitor idempotency effectiveness in production?
20. What happens when an idempotency key expires before a retry?

### Level 5 — System Design

21. Design an idempotency system for a payment processing service.
22. How does idempotency interact with retries, circuit breakers, and backoff?
23. How would you implement idempotency at the API gateway level vs. per-service?
24. How do you handle idempotency in asynchronous message-based systems?
25. When should you NOT use idempotency keys?

## 11. Scenario-Based Engineering Problems

1. **Duplicate Payments After Retry** — Your payment API charges customers twice when a retry occurs. Diagnose: the payment endpoint doesn't implement idempotency keys. Add Idempotency-Key header validation and cache successful payment results.

2. **Idempotency Store Down** — When Redis is unavailable, all idempotent requests fail. Diagnose: implement graceful degradation—when the store is down, allow the request to proceed but log a warning.

3. **Key Reuse Across Different Operations** — A client uses the same idempotency key for two different form submissions. Diagnose: the client should generate a new key per logical operation. Document this in API client libraries.

4. **Stale Cached Results** — After a successful payment is processed, a retry returns the old cached result. Diagnose: set appropriate TTLs and document that idempotency keys are for deduping retries.

5. **Idempotency Key Collision** — Two different clients generate the same idempotency key. Diagnose: use UUIDv4 with sufficient randomness (122 bits), making collision probability negligible.

## 12. Hands-On Exercises

### Beginner — Idempotency middleware

Implement an HTTP middleware that checks for an `Idempotency-Key` header and returns a cached result if the key was already processed.

### Intermediate — Idempotency store with Redis

Build a Redis-backed idempotency store with TTL support. Implement Get, Set, and Delete operations.

### Advanced — Idempotency with graceful degradation

Build an idempotency middleware that fails open when the store is unavailable. Log warnings when falling back to non-idempotent mode.

### Solutions

#### Solution — Beginner

Check `Idempotency-Key` header; if present, query store; if found, return cached result; otherwise, process and store.

#### Solution — Intermediate (core assertions)

- Store implements Get, Set, Delete with TTL
- Only successful (2xx) responses are cached
- Expired keys are not returned from cache

#### Solution — Advanced (core structure)

- Middleware wraps handler with idempotency check
- On store failure, logs warning and proceeds without idempotency
- Graceful degradation: still allow request, just without caching

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Idempotency ensures that retrying a request produces the same result as making it once.
2. Only POST/PATCH/PUT require idempotency keys for safe retries.
3. Use UUIDv4 keys and appropriate TTLs per operation type.
4. Never cache error responses; only cache successful (2xx) responses.
5. Idempotency store must support graceful degradation when unavailable.

### Quick revision sheet

| Concept | Key point |
|---------|-----------|
| Idempotent | Same request multiple times = same result as once (f(f(x)) = f(x)) |
| Idempotency key | Unique client-generated identifier for deduplicating retries |
| Naturally idempotent | GET, PUT, DELETE, HEAD |
| Need key for safe retries | POST, PATCH (non-idempotent operations) |
| Store | Redis (fast), database (ACID), in-memory (fastest) |
| TTL | Payment 24h, form 7d, email 1h |
| Only cache 2xx | Errors should be retried, not cached |

### Essential terminology

- **Idempotency:** Same request multiple times produces same result as once
- **Idempotency key:** Unique client-generated identifier for deduplicating retries
- **Idempotent operation:** GET, PUT, DELETE, HEAD (reading, updating, deleting)
- **Non-idempotent operation:** POST, PATCH (creating, writing)
- **Key scope:** The scope of what the key applies to (payment, form, email)

### Formulas and parameters

| Formula | Meaning |
|---------|---------|
| `f(f(x)) = f(x)` | Mathematical definition of idempotency |
| `TTL = f(operation_type)` | Time-to-live based on operation (payment < form < email) |

### Decision-making checklist

- [ ] Is the operation mutating (POST/PATCH)?
- [ ] Does the client provide an Idempotency-Key header?
- [ ] Is the key unique per logical operation?
- [ ] Is the idempotency store available?
- [ ] Are we caching only successful (2xx) responses?
- [ ] Are TTLs set appropriately?

### Flashcards

| Front | Back |
|-------|------|
| What is idempotency? | Same request multiple times produces same result as once |
| What is an idempotency key? | Unique client-generated identifier for deduplicating retries |
| Which HTTP methods are idempotent? | GET, PUT, DELETE, HEAD |
| Which HTTP methods need idempotency keys? | POST, PATCH (non-idempotent writes) |
| Where are idempotency results stored? | Redis, database, or distributed cache with TTL |
| What happens if no idempotency key is provided? | Request is not idempotent; passes through normally |
| Should error responses be cached? | No, only successful (2xx) responses should be cached |
| What TTL for payment idempotency keys? | 24 hours |
| What happens when a duplicate key is detected? | Return cached result without reprocessing |
| What header carries the idempotency key? | Idempotency-Key |

### Three questions to verify genuine understanding

1. **Why should you never cache error responses in idempotency?*** Errors indicate the operation failed; caching them would cause the client to believe a retry succeeded when it actually failed again. Only successful (2xx) responses can be safely cached.

2. **What happens if you don't handle idempotency store unavailability gracefully?** All requests with idempotency keys would fail even if the underlying service is healthy, causing a complete outage for clients using idempotency. Soft-fail (allow request, log warning) to maintain service continuity.

3. **Why is UUIDv4 the recommended key format?** UUIDv4 uses 122 bits of cryptographically random data, making collision probability negligible (2^122 = 4.7 × 10^36 possible values). Timestamp-based or sequential keys can collide under load or be guessed.

### Authoritative references and further reading

- HTTP/1.1 Semantics and Content (RFC 7231) — https://tools.ietf.org/html/rfc7231 (Idempotency for HTTP methods)
- Stripe API Idempotency — https://stripe.com/docs/idempotent-api (Idempotency key patterns)
- GitHub REST API Idempotency — https://docs.github.com/en/rest (Idempotency-Key header)
- AWS API Gateway Idempotency — https://docs.aws.amazon.com/apigateway/ (Idempotent API configuration)

