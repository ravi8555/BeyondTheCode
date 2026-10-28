# Chapter 11 — Timeouts

> **Part I — Traffic Management and Deployment**
> **Prerequisites:** Chapter 01 (Rate Limiting), Chapter 10 (Circuit Breakers)
> **FormForge context:** The submission API calls downstream validation, payment, and email services. Without timeouts, a slow downstream service can hold FormForge's threads indefinitely, exhausting the connection pool and bringing down the entire platform.

---

## 1. Definition and Fundamentals

### What it is

A timeout is the maximum amount of time a caller will wait for a response from a dependency before giving up and returning an error. Timeouts prevent indefinite blocking and resource exhaustion.

Every outbound call should have a timeout. Without one, a caller can block forever waiting for a dependency that will never respond, consuming threads, connections, and memory that could be used for other work.

### Why it exists / what problem it solves

Without timeouts:

- **Connection pool exhaustion:** All connections held by slow or hung requests
- **Thread starvation:** All worker threads blocked on I/O, unable to process new requests
- **Cascading failure:** The caller becomes unresponsive to its own clients
- **No recovery:** Even after the dependency recovers, the caller remains overloaded
- **Unbounded latency:** Users experience requests that never complete

With timeouts:

- **Predictable latency:** Requests either succeed or fail within a known bound
- **Resource protection:** Connections and threads are released for other work
- **Fail fast:** Clients receive errors instead of hanging indefinitely
- **Easier debugging:** Timeout errors point directly to slow or unresponsive dependencies

### How it works internally (first pass)

A timeout is implemented as a deadline associated with a request. When the deadline passes without a response, the underlying I/O operation is cancelled and an error is returned to the caller.

In Go, timeouts are typically implemented using `context.WithTimeout` or `context.WithDeadline`, which return a context that is cancelled after the specified duration. HTTP clients, database drivers, and gRPC clients all accept a context and will abort the operation when the context is cancelled.

The timeout lifecycle:

1. Caller creates a context with a timeout (e.g., 15 seconds)
2. Caller passes the context to the outbound call (HTTP, gRPC, database query)
3. Dependency processes the request
4. If the dependency responds before the deadline → return the response
5. If the deadline passes before the response → cancel the context, abort the operation, return a timeout error

### Where it fits in the architecture

Timeouts should be applied at multiple layers:

1. **Client-side** — HTTP client timeouts, gRPC call timeouts, database query timeouts (our Go implementation in Section 4)
2. **API gateway / reverse proxy** — per-route timeouts that protect backend services (→ Chapter 04, 05)
3. **Load balancer** — backend connection timeouts and response timeouts
4. **Server-side** — request handler timeouts that cancel in-flight work when clients disconnect

Timeouts work closely with circuit breakers (→ Chapter 10): timeout failures count toward the circuit breaker's failure threshold, and circuit breakers prevent calls from being made when a dependency is known to be slow.

## 2. Types, Variants, and Classifications
### By scope

| Timeout Type | What it bounds | Typical default |
|--------------|---------------|-----------------|
| **Connect timeout** | TCP handshake + TLS negotiation | 5–10 seconds |
| **Read/response timeout** | Waiting for response bytes after connection | 10–30 seconds |
| **Overall request timeout** | Entire request from start to finish | 15–60 seconds |
| **Idle timeout** | Keep-alive connection inactivity | 30–90 seconds |

### By dependency type

| Dependency | Timeout strategy | Rationale |
|------------|-----------------|-----------|
| **Database query** | Short (1–5s) | DB should be fast; slow queries indicate problems |
| **External HTTP API** | Medium (5–30s) | Network variability is expected |
| **gRPC service** | Short to medium (2–10s) | Internal service should be fast |
| **File I/O** | Medium (5–15s) | Disk latency varies by storage type |
| **Third-party webhook** | Longer (10–60s) | Less control over remote system |

### By enforcement point

| Level | Example | Pros | Cons |
|-------|---------|------|------|
| **HTTP client** | `http.Client{Timeout: ...}` | Simple, per-client config | Applies to all requests equally |
| **Per-request context** | `context.WithTimeout(ctx, ...)` | Fine-grained control | Must be passed through call chain |
| **Middleware** | Gateway/load balancer timeout | Centralized, no app changes | Less application-specific tuning |
| **Server-side** | `http.Server{ReadHeaderTimeout: ...}` | Protects server resources | Doesn't protect downstream calls |

### Decision guide: choose your timeout type

| Scenario | Recommended timeout |
|----------|-------------------|
| Critical user-facing request | 10–30s with clear error message |
| Background job | 5–10min with retries |
| Health check | 1–2s (must be fast) |
| Database query | 1–5s with circuit breaker |
| External API call | 10–30s with fallback |
| File upload/download | 30–120s depending on file size |

## 3. Internal Working and Architecture

### Execution flow: request with timeout

1. **Caller creates context with timeout:** `ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)`
2. **Caller defers cancel:** `defer cancel()` releases resources when the function returns
3. **Caller passes context to outbound call:** `http.NewRequestWithContext(ctx, ...)`
4. **Dependency processes:** The downstream service handles the request
5. **One of two outcomes:**
   - **Success before deadline:** Response returned, context cancelled normally
   - **Deadline exceeded:** Context cancelled, I/O aborted, `context.DeadlineExceeded` error returned
6. **Caller handles error:** Returns timeout error to user or triggers fallback/circuit breaker

### Failure paths drawn explicitly

| Stage | Failure mode | Effect | Mitigation |
|-------|-------------|--------|------------|
| **Context creation** | Timeout too short | Legitimate requests fail | Set timeout based on P99 latency + buffer |
| **Outbound call** | Dependency hangs until timeout | Connection held until deadline | Use connect timeout separately |
| **Timeout fires** | I/O not actually cancelled | Resource leak | Ensure driver/library respects context cancellation |
| **Server-side** | Client times out but server continues | Wasted server-side processing | Propagate context, check `ctx.Done()` in handler |

### Algorithms and complexity

| Metric | Value / assumption |
|--------|-------------------|
| **Timeout check overhead** | Negligible (context cancellation is O(1)) |
| **Memory per timeout** | O(1) per active request |
| **Timer implementation** | Go runtime uses a heap-based timer (O(log n) for insert/remove) |

### Important configuration parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `http.Client.Timeout` | 0 (no timeout) | 5s–60s | Overall HTTP client timeout |
| `DialContext.Timeout` | 0 (no timeout) | 3s–10s | TCP connection timeout |
| `ResponseHeaderTimeout` | 0 (no timeout) | 5s–30s | Time to wait for response headers |
| `context.WithTimeout` | Caller-specified | 1s–300s | Per-request deadline |
| `http.Server.ReadHeaderTimeout` | 0 (no timeout) | 5s–30s | Time to read request headers |

## 4. Practical Implementation

## 5. Production-Ready Implementation

### Correctness at scale: timeout propagation

Timeouts must propagate through the entire call chain. If Service A calls Service B with a 15-second timeout, and Service B calls Service C with a 15-second timeout, Service C could take 30 seconds total. Solutions:

- **Decreasing timeouts:** Service B's timeout to C should be less than A's timeout to B (e.g., A→B: 15s, B→C: 10s)
- **Context propagation:** Pass the parent context with remaining time to downstream calls
- **Timeout budgets:** Allocate a timeout budget across the call chain

### Security and access control

- Timeouts do not introduce new authentication concerns
- However, timeout values should not be exposed to unauthenticated clients (could be used for timing attacks)
- Rate limiting should be combined with timeouts to prevent timeout-based abuse

### Configuration and secrets

- Timeout values should be configurable via environment variables
- Different dependencies need different timeouts (database vs external API vs internal service)
- Never hardcode timeout values; make them observable and tunable

### Resource management and latency

- Each timeout adds minimal overhead (context object per request)
- Too many short timeouts can cause excessive retries and load
- Too many long timeouts can cause resource exhaustion
- Balance timeout values with circuit breaker thresholds

### Observability (the part that makes it operable)

- **Metrics:** `timeout_duration_seconds` (histogram), `request_timeout_total` (counter), `request_duration_seconds` (histogram)
- **Logging:** Log timeout errors with the dependency name, timeout value, and retry count
- **Alerting:** Alert when timeout rate exceeds a threshold (e.g., >1% of requests)
- **Dashboard:** Show timeout rate per dependency alongside latency percentiles

### Timeouts, failure handling, graceful behavior

- Always handle timeout errors explicitly (don't let them bubble up as generic errors)
- Return a meaningful error message to the client (e.g., "request timed out")
- Consider returning a fallback response or cached data on timeout
- Log timeout events for debugging and trend analysis

### Deployment and rollback

- Deploy timeout configuration behind feature flags for easy tuning
- Rollback = revert timeout values to previous known-good settings
- Canary: test new timeout values on a small percentage of traffic

### Testing and maintainability

- Chaos engineering: introduce artificial delays and verify timeouts fire correctly
- Load test with slow dependencies to verify connection pool behavior
- Document timeout values per dependency in the service runbook

### Cost and operational complexity

- Timeouts: near-zero implementation cost, minimal operational overhead
- The cost of *not* having timeouts (cascading failures, outages) far exceeds the cost of implementing them
- Operational complexity: tuning timeout values requires production data and monitoring

## 6. Edge Cases and Failure Scenarios

### Case 1 — Connection pool exhaustion

- **Scenario:** Service's database connection pool is consistently exhausted during traffic spikes.
- **Cause:** Queries lack timeouts, allowing slow queries to hold connections indefinitely.
- **Impact:** All connections are held, new requests cannot get a connection.
- **Detect:** Monitor connection pool usage; alert when pool is near capacity.
- **Prevent:** Set statement timeouts on all database queries; use connection pool max limits.
- **Test:** Run slow queries concurrently; assert pool does not exhaust.

### Case 2 — Cascading timeout failure

- **Scenario:** Service A calls Service B, which calls Service C. Service C is slow, causing B to timeout, which causes A to timeout.
- **Cause:** Timeouts at each layer are equal, so total timeout accumulates.
- **Impact:** End-to-end latency is much higher than any individual timeout.
- **Detect:** Trace requests across services; correlate timeout events.
- **Prevent:** Use decreasing timeouts (C < B < A); propagate context with remaining time.
- **Test:** Inject delay in Service C; assert end-to-end timeout is bounded.

### Case 3 — Client hangs indefinitely

- **Scenario:** Mobile app hangs when calling a backend API with a slow dependency.
- **Cause:** Client does not set request timeouts.
- **Impact:** Poor user experience; app appears frozen.
- **Detect:** Client-side monitoring; measure request completion times.
- **Prevent:** Set timeouts on all client-side HTTP requests; provide retry UI.
- **Test:** Slow the backend; assert client times out within expected duration.

### Case 4 — Timeout masking real issues

- **Scenario:** Timeouts increased to fix "frequent timeouts" but users now experience slow responses instead of errors.
- **Cause:** Timeouts hide underlying performance problems rather than exposing them.
- **Impact:** Users suffer slow responses; root cause remains unfixed.
- **Detect:** Monitor latency percentiles alongside timeout rates.
- **Prevent:** Investigate why dependencies are slow instead of just increasing timeouts.
- **Test:** Profile the dependency; identify and fix the performance bottleneck.

### Case 5 — Server-side request cancellation

- **Scenario:** Client times out and abandons a request, but server continues processing it.
- **Cause:** Server handler does not check for client disconnection.
- **Impact:** Wasted server resources processing abandoned requests.
- **Detect:** Compare client-observed latency with server-side processing time.
- **Prevent:** Propagate context; check `ctx.Done()` in long-running handlers.
- **Test:** Cancel client request mid-processing; assert server stops work.

## 7. Common Mistakes and Anti-Patterns

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|------------------|
| **No timeout at all** | Requests can hang indefinitely | Always set timeouts on outbound calls |
| **Timeout too short** | Legitimate slow requests fail | Base timeout on P99 latency + buffer |
| **Timeout too long** | Resource exhaustion, slow failure detection | Use shortest timeout that meets requirements |
| **Same timeout for all dependencies** | Different dependencies have different characteristics | Tune per-dependency based on SLA and criticality |
| **Not propagating context** | Downstream calls don't know about caller's deadline | Pass context through the call chain |
| **Ignoring timeout errors** | Failures silently swallowed | Handle timeout errors explicitly |
| **Timeouts without retries** | Transient failures cause permanent errors | Combine timeouts with retry logic |

## 8. Performance and Sccalability

### Cost model per request

- **Context creation:** O(1), negligible overhead
- **Timeout check:** O(1), handled by runtime timer
- **Memory per timeout:** O(1) per active request

### Complexity recap

| Operation | Time complexity | Space complexity |
|-----------|----------------|------------------|
| Create timeout context | O(1) | O(1) |
| Cancel timeout context | O(1) | O(1) |
| Check deadline | O(1) (runtime timer) | O(1) |

### Throughput and bottlenecks

- Timeouts do not significantly affect throughput
- The main bottleneck is the underlying dependency, not the timeout mechanism
- Too many concurrent timeouts can cause connection churn

### Scaling strategies

1. **Per-client timeouts** — simplest, start here
2. **Per-request context timeouts** — fine-grained control
3. **Gateway-level timeouts** — centralized enforcement
4. **Adaptive timeouts** — adjust based on observed latency percentiles

### Benchmarking method

- Benchmark `http.Client.Do` with and without timeouts
- Measure overhead of context creation and cancellation
- Compare latency percentiles with different timeout values
- Use `pprof` to verify no memory leaks from cancelled contexts

## 9. Testing and Debugging

### Unit tests (no dependencies)

```go
func TestHTTPClientTimeout(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(time.Hour)
    }))
    defer srv.Close()

    client := &http.Client{Timeout: 1 * time.Second}
    start := time.Now()
    _, err := client.Get(srv.URL)
    elapsed := time.Since(start)

    if err == nil {
        t.Fatal("expected timeout error")
    }
    if elapsed > 2*time.Second {
        t.Fatalf("timeout took too long: %v", elapsed)
    }
}
```

### Integration tests (real dependencies)

- Test with a real HTTP server that delays responses
- Verify timeout fires at expected time
- Verify connection is released after timeout

### Concurrency test

- Run N concurrent requests with timeouts against a slow dependency
- Assert all requests time out within expected window
- Assert no goroutine or connection leaks

### Load test (k6 sketch)

```javascript
import http from 'k6/http';
export default function() {
    const resp = http.get('http://slow-service:8080/data', { timeout: '15s' });
    check(resp, {
        'completed or timed out': (r) => r.status === 200 || r.status === 504,
    });
}
```

### Failure injection

- Use chaos engineering tools to delay responses
- Test with partial failures (some requests slow, some fast)
- Test with network partitions between service and dependency

### Debugging toolkit

- Check timeout metrics: `request_timeout_total`, `timeout_rate`
- Review timeout logs for dependency name and duration
- Use distributed tracing to identify which dependency times out
- Check connection pool metrics for exhaustion

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

1. What are the four main types of timeouts, and what does each protect against?
2. Why is a timeout better than no timeout when calling a slow dependency?
3. How does a timeout interact with connection pools?
4. What HTTP status code should be returned when a gateway times out?
5. How do timeouts and circuit breakers complement each other?

### Level 2 — Implementation

6. What is the difference between a connect timeout and a response timeout?
7. How does `context.WithTimeout` work in Go?
8. Why should you call `defer cancel()` after creating a timeout context?
9. How do you implement server-side timeout middleware?
10. How do timeouts propagate through a call chain?

### Level 3 — Advanced Engineering

11. How do you prevent timeout cascades in a multi-service call chain?
12. What happens when a server-side handler ignores client cancellation?
13. How do you set appropriate timeout values for different dependencies?
14. What's the relationship between timeouts and P99 latency?
15. How do you test timeout behavior without slowing down your test suite?

### Level 4 — Production Scenarios

16. Your service experiences frequent timeouts to a downstream dependency. How do you decide whether to increase the timeout or fix the dependency?
17. A client retries on timeout, causing a thundering herd. How do you handle this?
18. How do you coordinate timeouts between client, gateway, and backend?
19. What happens when a timeout fires but the underlying I/O isn't cancelled?
20. How do you monitor timeout rates across microservices?

### Level 5 — System Design

21. Design a timeout strategy for a system with 50+ dependencies.
22. How do timeouts interact with retries, circuit breakers, and bulkheads?
23. How would you implement adaptive timeouts that adjust based on observed latency?
24. How do you handle timeouts in asynchronous message-based systems?
25. When should you NOT use a timeout?

## 11. Scenario-Based Engineering Problems

1. **Connection Pool Exhaustion** — Your service's database connection pool is consistently exhausted during traffic spikes. Diagnose: check if queries lack timeouts, allowing slow queries to hold connections indefinitely.

2. **Cascading Timeout Failure** — Service A calls Service B, which calls Service C. Service C is slow, causing B to timeout, which causes A to timeout. Diagnose: implement timeouts at each layer with decreasing values (C < B < A).

3. **Client Hangs Indefinitely** — Your mobile app hangs when calling a backend API that has a slow dependency. Diagnose: ensure the client sets request timeouts, the API gateway enforces timeouts.

4. **Timeout Masking Real Issues** — You increased timeouts to fix "frequent timeouts" but now users experience slow responses instead of errors. Diagnose: timeouts shouldn't hide performance problems. Investigate why the dependency is slow.

5. **Server-Side Request Cancellation** — A client times out and abandons a request, but your server continues processing it. Diagnose: implement context propagation so server handlers detect client disconnection and cancel in-flight work.

## 12. Hands-On Exercises

### Beginner — HTTP client with timeouts

Create a Go HTTP client with connect and response timeouts. Test it against a slow server and verify the timeout fires correctly.

### Intermediate — Server-side timeout middleware

Build Go middleware that cancels request handlers when the client disconnects or the timeout expires. Return 504 Gateway Timeout on timeout.

### Advanced — Distributed timeout propagation

Build a client library that propagates timeout contexts through gRPC calls. Verify that the total end-to-end timeout is bounded by the outermost timeout.

### Solutions

#### Solution — Beginner

Set `http.Client.Timeout` and `http.Transport.DialContext.Timeout`. Test with `httptest.NewServer` that sleeps. Verify `context.DeadlineExceeded` error.

#### Solution — Intermediate (core assertions)

- Middleware wraps the handler with `context.WithTimeout`
- Select on `done` channel vs `ctx.Done()`
- Return 504 when context is cancelled before handler completes

#### Solution — Advanced (core structure)

- Parent context timeout is passed to child calls
- Child timeout is min(parent remaining, child-specific timeout)
- Total end-to-end time never exceeds root timeout

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Every outbound call needs a timeout to prevent indefinite blocking.
2. Timeouts protect connection pools, threads, and overall system stability.
3. Timeouts work with circuit breakers: timeout failures count toward breaker thresholds.
4. Timeout values should decrease down the call chain (outer > inner).
5. Always propagate context so downstream calls respect the caller's deadline.

### Quick revision sheet

| Concept | Key point |
|---------|-----------|
| Connect timeout | Time allowed for TCP/TLS handshake |
| Read/response timeout | Time allowed for response data after connection |
| Overall request timeout | Cap on total request duration |
| Idle timeout | Reclaim idle keep-alive connections |
| Context propagation | Pass deadline through the call chain |
| 504 Gateway Timeout | HTTP status for gateway-side timeout |

### Essential terminology

- **Timeout:** Maximum time a caller waits for a response before giving up
- **Connect timeout:** Time allowed for establishing a network connection
- **Response timeout:** Time allowed for receiving response data
- **Context cancellation:** Mechanism for propagating deadlines and cancellation
- **Deadline exceeded:** Error returned when a timeout fires

### Formulas and parameters

| Formula | Meaning |
|---------|---------|
| `timeout_budget = sum(child_timeouts) <= parent_timeout` | Call chain timeout budget |
| `P99_latency + buffer = recommended_timeout` | Timeout sizing heuristic |

### Decision-making checklist

- [ ] Does every outbound call have a timeout?
- [ ] Are connect and response timeouts set separately?
- [ ] Do timeouts decrease down the call chain?
- [ ] Is context propagated to downstream calls?
- [ ] Are timeout errors handled explicitly?
- [ ] Are timeout metrics and alerts configured?

### Flashcards

| Front | Back |
|-------|------|
| What is a timeout? | Maximum time a caller waits for a response before giving up |
| What is a connect timeout? | Time allowed for establishing a TCP connection |
| What is a response timeout? | Time allowed for receiving response data after connection |
| What happens without timeouts? | Connection pool exhaustion, thread starvation, cascading failure |
| What HTTP status for gateway timeout? | 504 Gateway Timeout |
| How do timeouts help circuit breakers? | Timeout failures count toward breaker failure threshold |
| What is P99 latency? | Latency at which 99% of requests complete; useful for setting timeouts |
| Why not set timeouts too short? | False failures on legitimate but slow requests |
| Why not set timeouts too long? | Resource exhaustion, slow failure detection |
| What is context propagation? | Passing the deadline through the call chain |

### Three questions to verify genuine understanding

1. **Why should timeouts decrease down the call chain instead of being equal at every level?** Equal timeouts at each level mean the total end-to-end timeout is the sum of all individual timeouts, which can be much longer than intended.

2. **What happens if you set a timeout but never check for context cancellation on the server side?** The server continues processing even after the client has timed out and gone away, wasting resources on work no one needs.

3. **Why is it dangerous to increase timeouts to fix "frequent timeout" errors?** Increasing timeouts masks the underlying performance problem. Users experience slow responses instead of fast errors, and the root cause remains unfixed.

### Authoritative references and further reading

- Go blog: "Go Concurrency Patterns: Context" — https://blog.golang.org/context
- Google SRE Book, Chapter 8: "Handling Overload" — https://sre.google/sre-book/handling-overload/
- HTTP/1.1 Semantics and Content (RFC 7231) — https://tools.ietf.org/html/rfc7231
- Go `net/http` package documentation — https://pkg.go.dev/net/http
- **Fail fast:** Clients receive errors instead of hanging indefinitely
