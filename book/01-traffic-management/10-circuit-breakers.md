# Chapter 10 — Circuit Breakers

> **Part I — Traffic Management and Deployment**
> **Prerequisites:** Chapter 09 (Service Discovery), Chapter 09 (Observability)
> **FormForge context:** The submission API (`POST /v1/forms/:formId/submissions`) calls downstream validation and notification services. When those services degrade, cascading failures can bring down the entire submission path. Circuit breakers prevent this.

---

## 1. Definition and Fundamentals

### What it is

A circuit breaker is a resilience pattern that wraps calls to external dependencies. When failures exceed a threshold, the breaker "trips" and immediately rejects requests without attempting the call, giving the failing service time to recover.

**Inspiration:** Electrical circuit breakers that trip to prevent fires when current exceeds safe levels.

A circuit breaker sits between a caller and a dependency, tracking the outcome of each call. It transitions between states based on the failure rate, and in the Open state it short-circuits calls so the caller fails fast instead of waiting on a doomed dependency.

### Why it exists / what problem it solves

Without a circuit breaker, a slow or failing dependency causes:

- **Thread exhaustion:** All worker threads blocked waiting for the failing service
- **Cascading failure:** The calling service becomes unresponsive, affecting its own callers
- **Resource waste:** CPU and memory spent on requests that will inevitably fail
- **Recovery delay:** Even after the dependency recovers, the caller remains overloaded

With a circuit breaker:

- **Fail fast:** Immediate rejection when the dependency is known to be unhealthy
- **Automatic recovery:** Half-Open state tests whether the dependency has recovered
- **Resource protection:** Threads and connections are freed for healthy operations

Circuit breakers are the resilience counterpart to retries (→ Chapter 14) and timeouts (→ Chapter 13). Timeouts bound how long a single call waits; circuit breakers stop making calls altogether when a dependency is persistently unhealthy.

### How it works internally (first pass)

At its simplest, a circuit breaker maintains a counter of successes and failures within an evaluation window. On each call:

1. Check breaker state. If Open, reject immediately (fail fast).
2. If Closed or Half-Open, execute the call.
3. Record the outcome (success or failure).
4. If the failure rate exceeds the threshold, transition to Open.
5. If Open and the timeout has elapsed, transition to Half-Open to test recovery.

The three states form a finite state machine:

| State | Behavior | Transition Condition |
|-------|----------|---------------------|
| **Closed** | Requests flow normally; failures are counted | Failure rate < threshold → stay closed |
| **Open** | Requests immediately fail without calling the dependency | Timeout elapses → move to half-open |
| **Half-Open** | Limited trial requests allowed to test recovery | Success → close; failure → reopen |

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open : failure threshold exceeded
    Open --> Half-Open : timeout elapsed
    Half-Open --> Closed : trial request succeeds
    Half-Open --> Open : trial request fails
```

### Where it fits in the architecture

Circuit breakers are typically deployed at multiple layers:

1. **Client-side libraries** — in the service making the outbound call (our Go implementation in Section 4)
2. **Service mesh** — sidecar proxies (e.g., Istio, Linkerd) enforce breakers per upstream
3. **API gateway** — breakers per route or per upstream service (→ Chapter 05)
4. **Application middleware** — business-aware breakers with custom fallback logic

In the FormForge architecture, the submission API places a circuit breaker around each outbound call to validation and notification services, so a degradation in one downstream service cannot exhaust the submission path's thread pool.

## 2. Types, Variants, and Classifications

### By failure detection

| Type | How failure is detected | Best for |
|------|------------------------|----------|
| **Count-based** | Counts failures within a rolling window | General-purpose HTTP dependencies |
| **Time-based** | Trips based on consecutive slow calls (latency threshold) | Latency-sensitive dependencies |
| **Hybrid** | Combines failure count and latency | Production services with SLOs |

### By state management

| Type | Scope | Trade-off |
|------|-------|-----------|
| **Local (in-process)** | Breaker state lives in the service instance | Simple, no external dependency; state not shared across instances |
| **Distributed (Redis-backed)** | Breaker state shared via Redis or similar | All instances see the same state; adds latency and infrastructure |

### By fallback strategy

| Strategy | Behavior | Use case |
|----------|----------|----------|
| **Fail fast** | Return error immediately when Open | Non-critical dependencies |
| **Cached fallback** | Return stale/cached data when Open | Read-heavy dependencies |
| **Default response** | Return a static default value | Non-critical write operations |
| **Queue for later** | Buffer requests to retry when closed | Asynchronous, eventually-consistent workloads |

### Decision guide: choose your circuit breaker type

| Scenario | Recommended type |
|----------|-----------------|
| Single instance, simple dependency | Local, count-based |
| Multiple instances, shared dependency | Distributed, count-based |
| Latency-sensitive SLO | Time-based or hybrid |
| Need graceful degradation | With cached fallback or default response |



## 3. Internal Working and Architecture
### Execution flow: call by call

1. **Call arrives** at the circuit breaker wrapper.
2. **State check:** If Open and timeout not yet elapsed → return error immediately (fail fast).
3. **Half-Open probe:** If Open and timeout elapsed → transition to Half-Open, allow a limited number of trial calls.
4. **Execute:** Call the dependency. Record success or failure.
5. **Evaluate:** After each call (or at window close), check failure rate against threshold.
6. **Transition:** Closed → Open if threshold exceeded; Half-Open → Closed on success, → Open on failure.

### Failure paths drawn explicitly

| Stage | Failure mode | Effect | Mitigation |
|-------|-------------|--------|------------|
| **Closed state** | Failure rate creeps up gradually | Breaker doesn't trip until threshold crossed | Set threshold low enough for early detection |
| **Open state** | Dependency recovers but breaker stays Open | Clients keep getting failures | Ensure timeout is short enough; monitor Open duration |
| **Half-Open state** | Trial request fails, breaker re-opens immediately | Flapping between Open and Half-Open | Require multiple successes before closing |
| **State not shared** | Each instance has independent breaker state | One instance trips, others keep sending traffic | Use distributed state (Redis-backed) |

### Algorithms and complexity

| Metric | Value / assumption |
|--------|-------------------|
| **State transition** | O(1) per call |
| **Failure rate calculation** | O(1) with rolling counter; O(window) with full history |
| **Memory per breaker** | O(1) counters + last state change timestamp |
| **Distributed state** | O(1) Redis GET/SET per call, plus network RTT |

### Important configuration parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `FailureThreshold` | 5 | 1–100 | Failures within window that trigger Open |
| `MinRequests` | 10 | 1–1000 | Minimum calls before evaluating failure rate |
| `Timeout` | 30s | 5s–5min | Time in Open before attempting Half-Open |
| `Interval` | 10s | 1s–60s | Evaluation window length |
| `MaxHalfOpenRequests` | 1 | 1–10 | Trial requests allowed in Half-Open |

## 4. Practical Implementation

### Scenario

FormForge's submission API calls a downstream notification service to send confirmation emails. The notification service occasionally becomes slow or unresponsive under load. Without a circuit breaker, the submission API's threads block waiting for notifications, exhausting the connection pool and causing the entire submission path to fail.

### Requirements

- Wrap outbound HTTP calls to the notification service with a circuit breaker
- Trip after 5 failures in a 10-second window
- Stay Open for 30 seconds before attempting Half-Open
- Allow 1 trial request in Half-Open state
- Return a fallback response (cached email status) when breaker is Open
- Log all state transitions for observability

### Technology stack

- Go 1.21+
- Standard library (`sync`, `time`, `errors`)
- Optional: Redis for distributed breaker state

### Project structure

```
internal/circuitbreaker/
    breaker.go       # Core circuit breaker implementation
    breaker_test.go  # Unit tests
    example.go       # Usage example with HTTP client
```

### Configuration

```go
type Config struct {
    FailureThreshold int
    MinRequests      int
    Timeout          time.Duration
    Interval         time.Duration
}

func DefaultConfig() Config {
    return Config{
        FailureThreshold: 5,
        MinRequests:      10,
        Timeout:          30 * time.Second,
        Interval:         10 * time.Second,
    }
}
```

### Implementation

```go
package circuitbreaker

import (
    "errors"
    "sync"
    "time"
)

type State int

const (
    StateClosed State = iota
    StateOpen
    StateHalfOpen
)

type Config struct {
    FailureThreshold int
    MinRequests      int
    Timeout          time.Duration
    Interval         time.Duration
}

type CircuitBreaker struct {
    mu              sync.Mutex
    state           State
    config          Config
    failures        int
    successes       int
    lastStateChange time.Time
}

func New(config Config) *CircuitBreaker {
    return &CircuitBreaker{
        state:           StateClosed,
        lastStateChange: time.Now(),
        config:          config,
    }
}

func (cb *CircuitBreaker) Execute(fn func() error) error {
    cb.mu.Lock()

    if cb.state == StateOpen {
        if time.Since(cb.lastStateChange) >= cb.config.Timeout {
            cb.state = StateHalfOpen
            cb.failures = 0
            cb.successes = 0
        } else {
            cb.mu.Unlock()
            return errors.New("circuit breaker is open")
        }
    }

    cb.mu.Unlock()

    err := fn()

    cb.mu.Lock()
    defer cb.mu.Unlock()

    if err != nil {
        cb.failures++
        if cb.state == StateHalfOpen {
            cb.state = StateOpen
            cb.lastStateChange = time.Now()
            return err
        }
        if cb.successes+cb.failures >= cb.config.MinRequests {
            failureRate := float64(cb.failures) / float64(cb.successes+cb.failures)
            if failureRate >= float64(cb.config.FailureThreshold)/100.0 {
                cb.state = StateOpen
                cb.lastStateChange = time.Now()
            }
        }
    } else {
        cb.successes++
        if cb.state == StateHalfOpen {
            cb.state = StateClosed
            cb.failures = 0
            cb.successes = 0
        }
    }

    return err
}

func (cb *CircuitBreaker) State() State {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    return cb.state
}
```

### Execution

```go
cb := New(DefaultConfig())

err := cb.Execute(func() error {
    resp, err := httpClient.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 500 {
        return errors.New("downstream error")
    }
    return nil
})

if err != nil {
    // Breaker may be open — return fallback or error to caller
    return fallbackResponse(), err
}
```

### Testing

- Unit test: breaker trips after N failures within window
- Unit test: breaker stays open for timeout duration, then half-opens
- Unit test: half-open success closes the breaker
- Unit test: half-open failure re-opens the breaker
- Integration test: real HTTP client with breaker, simulate downstream failure
- Concurrency test: concurrent calls under breaker load

### Expected result (representative)

```
Breaker state: Closed
Call 1: success
Call 2: success
...
Call 6: failure (5th failure in window)
Breaker state: Open
Call 7: rejected immediately (fail fast)
...
[30 seconds later]
Breaker state: Half-Open
Call 31: success
Breaker state: Closed
```

### Explanation of key decisions

- **MinRequests** prevents the breaker from tripping on a small sample size (avoids false positives from a few failures).
- **FailureThreshold as a percentage** allows tuning sensitivity regardless of traffic volume.
- **Mutex-protected state** ensures thread safety for concurrent callers.
- **Half-Open with a single trial request** minimizes risk when testing recovery.

## 5. Production-Ready Implementation

### Correctness at scale: distributed breaker state

In a multi-instance deployment, each service instance has its own circuit breaker. If one instance trips, others continue sending traffic to the failing dependency. Solutions:

- **Redis-backed breaker state:** All instances read/write breaker state to Redis. Adds ~1ms RTT per call but ensures consistent behavior.
- **Gateway-level breaker:** Place the breaker in the API gateway or service mesh (→ Chapter 05), so all traffic passes through a single breaker.

### Security and access control

- Circuit breakers do not introduce new auth concerns, but breaker state should not be exposed to unauthenticated clients.
- If using Redis for distributed state, secure Redis with TLS and authentication (→ Chapter 37, Redis Security).

### Configuration and secrets

- Breaker thresholds should be configurable via environment variables, not hardcoded.
- Thresholds differ by dependency: payment service (stricter) vs. notification service (more lenient).
- Never store credentials in breaker configuration.

### Resource management and latency

- Each breaker adds minimal memory overhead (~100 bytes per breaker).
- Distributed state adds network latency per call; use local breakers when sub-millisecond latency matters.
- Limit the number of breakers per service (one per dependency) to avoid memory bloat.

### Observability (the part that makes it operable)

- **Metrics:** `breaker_state` (gauge: 0=closed, 1=open, 2=half-open), `breaker_trips_total` (counter), `breaker_rejections_total` (counter)
- **Logging:** Log every state transition with reason (threshold exceeded, timeout elapsed, trial success/failure)
- **Alerting:** Alert when a breaker stays Open for more than 5 minutes
- **Dashboard:** Show breaker state per dependency alongside dependency health metrics

### Timeouts, failure handling, graceful behavior

- Pair circuit breakers with timeouts (→ Chapter 13) so individual calls don't hang indefinitely.
- Always provide a fallback response when the breaker is Open (cached data, default value, or graceful error).
- Never let a breaker failure (e.g., Redis down for distributed state) cause the application to fail — fall back to local breaker or fail-open with logging.

### Deployment and rollback

- Deploy breaker configuration behind a feature flag so thresholds can be tuned without redeploying.
- Rollback = revert feature flag or configuration; breaker state resets on restart.
- Canary: deploy new breaker config to 10% of instances, compare failure rates before full rollout.

### Testing and maintainability

- Chaos engineering: kill the dependency in staging and verify the breaker trips and recovers.
- Load test with k6 to verify breaker behavior under concurrent load.
- Document breaker configuration per dependency in the service runbook.

### Cost and operational complexity

- Local breakers: near-zero cost, minimal operational complexity.
- Distributed breakers: Redis infrastructure cost, plus operational overhead of managing another dependency.
- The cost of *not* having breakers (cascading failures, outages) far exceeds the cost of implementing them.

## 6. Edge Cases and Failure Scenarios

### Case 1 — Breaker trips too frequently

- **Scenario:** Circuit breaker for a payment service trips during normal traffic spikes.
- **Cause:** Failure threshold too low, or MinRequests too small.
- **Impact:** Legitimate requests rejected even though the dependency is mostly healthy.
- **Detect:** Monitor `breaker_trips_total` and correlate with traffic spikes.
- **Prevent:** Increase FailureThreshold or MinRequests; use percentage-based threshold.
- **Test:** Load test with realistic error rates; assert breaker does not trip below expected error rate.

### Case 2 — Breaker stays open too long

- **Scenario:** After a downstream service recovers, the circuit breaker remains Open for minutes.
- **Cause:** Timeout too long, or Half-Open trial requests not being made.
- **Impact:** Dependency is healthy but all requests are rejected.
- **Detect:** Alert on Open duration > 5 minutes.
- **Prevent:** Set Timeout appropriately (30s–2min for most HTTP dependencies); ensure Half-Open probes are sent.
- **Test:** Simulate dependency recovery; assert breaker transitions to Closed within expected time.

### Case 3 — No fallback when open

- **Scenario:** When the circuit breaker is Open, the API returns 503 errors instead of graceful degradation.
- **Cause:** No fallback response implemented.
- **Impact:** Users see errors instead of stale/cached data or a friendly message.
- **Detect:** Monitor 503 rate correlated with breaker Open state.
- **Prevent:** Implement fallback (cached response, default value, or graceful error message).
- **Test:** Force breaker Open; assert API returns fallback instead of 503.

### Case 4 — Breaker state not shared across instances

- **Scenario:** Each service instance has its own circuit breaker; one instance trips while others still send traffic to the failing service.
- **Cause:** Local (in-process) breaker state.
- **Impact:** Inconsistent behavior; some clients get failures, others succeed unpredictably.
- **Detect:** Compare per-instance breaker states; look for divergence.
- **Prevent:** Use distributed (Redis-backed) breaker state or gateway-level breaker.
- **Test:** Deploy 2+ instances; trip one instance's breaker; assert all instances respect the tripped state.

### Case 5 — False positives from network blips

- **Scenario:** Brief network glitches cause the breaker to trip unnecessarily.
- **Cause:** No minimum request threshold before evaluation, or failure counting too sensitive.
- **Impact:** Breaker trips for transient issues that would resolve on their own.
- **Detect:** Correlate breaker trips with network error spikes.
- **Prevent:** Increase MinRequests; add short delay before counting failures; use retry (→ Chapter 14) before breaker.
- **Test:** Inject brief network failures; assert breaker does not trip.

## 7. Common Mistakes and Anti-Patterns

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|------------------|
| **No fallback when breaker is Open** | Users get hard errors instead of graceful degradation | Return cached data, default value, or friendly message |
| **Breaker threshold too low** | Trips on normal traffic variations | Use percentage-based threshold; tune with production data |
| **Breaker state not shared** | Inconsistent behavior across instances | Use distributed state or gateway-level breaker |
| **No timeout paired with breaker** | Calls hang indefinitely even when breaker is closed | Always set timeouts on outbound calls (→ Chapter 13) |
| **Breaker and retry fighting** | Retry storms when breaker is half-open | Coordinate retry and breaker; respect breaker state in retry logic |
| **Ignoring breaker state transitions** | No visibility into dependency health | Log and metric every transition; alert on prolonged Open |
| **Using breaker as the only resilience tool** | Breaker doesn't handle transient failures well | Combine with retries, timeouts, and bulkheads |

## 8. Performance and Scalability

### Cost model per request

- **Local breaker:** O(1) mutex lock/unlock + counter increment (~100ns per call)
- **Distributed breaker:** O(1) Redis GET/SET + network RTT (~0.5–2ms per call)

### Complexity recap

| Operation | Time complexity | Space complexity |
|-----------|----------------|------------------|
| Check state | O(1) | O(1) |
| Record outcome | O(1) | O(1) |
| State transition | O(1) | O(1) |
| Distributed state sync | O(1) + network RTT | O(1) per breaker in Redis |

### Throughput and bottlenecks

- A single local breaker can handle >100K calls/second per instance.
- Distributed breakers are limited by Redis throughput (~50K–100K ops/second per Redis instance).
- The mutex on the CircuitBreaker struct can become a contention point under extreme concurrency; consider sharding or lock-free counters if needed.

### Scaling strategies (order you will actually use them)

1. **Local breakers per instance** — simplest, start here
2. **Gateway-level breaker** — centralize at the API gateway or service mesh
3. **Redis-backed distributed state** — when instances must agree on breaker state
4. **Redis Cluster** — when a single Redis instance becomes a bottleneck

### Benchmarking method (reproduce, don't trust)

- Benchmark `CircuitBreaker.Execute` with `testing.B` and measure calls/second
- Benchmark with and without contention (goroutine count: 1, 10, 100, 1000)
- Compare local vs distributed breaker latency under load
- Use `pprof` to identify mutex contention

## 9. Testing and Debugging

### Unit tests (no Redis)

```go
func TestBreakerTripsAfterThreshold(t *testing.T) {
    cb := New(Config{
        FailureThreshold: 50, // 50%
        MinRequests:      2,
        Timeout:          time.Minute,
    })
    cb.Execute(func() error { return errors.New("fail") })
    cb.Execute(func() error { return nil })
    if cb.State() != StateOpen {
        t.Fatal("expected breaker to be Open")
    }
}
```

### Integration tests (real dependencies)

- Test with a real HTTP server that returns failures at a configurable rate
- Verify breaker trips at expected failure rate
- Verify breaker recovers after dependency becomes healthy again

### Concurrency test

- Run N concurrent goroutines calling `Execute` with a failing dependency
- Assert breaker trips and rejects subsequent calls
- Assert no race conditions (use `go test -race`)

### Load test (k6 sketch)

```javascript
import http from 'k6/http';
export default function() {
    const resp = http.get('http://localhost:8080/submit');
    check(resp, {
        'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    });
}
```

### Failure injection

- Use chaos engineering tools to kill the dependency and verify breaker behavior
- Test network partition between service and dependency
- Test dependency slow responses (not just hard failures)

### Debugging toolkit

- Check breaker metrics: `breaker_state`, `breaker_trips_total`
- Review logs for state transition reasons
- Use `curl` to hit endpoints and observe fast failures when breaker is Open
- Check Redis state if using distributed breakers

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

1. What are the three states of a circuit breaker, and what happens in each state?
2. How does a circuit breaker prevent cascading failures in a microservices architecture?
3. What triggers a transition from Closed to Open state?
4. What is the purpose of the Half-Open state?
5. What metrics should you monitor for circuit breakers?

### Level 2 — Implementation

6. How does a circuit breaker differ from a simple retry mechanism?
7. Why is MinRequests important in circuit breaker configuration?
8. What are the trade-offs between local and distributed circuit breaker state?
9. How would you implement a fallback response when the breaker is Open?
10. How do timeouts and circuit breakers complement each other?

### Level 3 — Advanced Engineering

11. How would you prevent a circuit breaker from tripping due to network blips?
12. How do you coordinate circuit breakers across multiple service instances?
13. What happens when the Redis backing distributed breaker state goes down?
14. How would you implement circuit breakers in a service mesh vs. application code?
15. How do you test circuit breaker behavior in a staging environment?

### Level 4 — Production Scenarios

16. A circuit breaker trips during a traffic spike. How do you determine if it's a false positive?
17. Your breaker stays Open for hours after the dependency recovers. What could be wrong?
18. How do you size the Half-Open trial request count?
19. What's the relationship between circuit breakers and bulkheads?
20. How do circuit breakers interact with retries and idempotency keys?

### Level 5 — System Design

21. Design a circuit breaker system for a service with 100+ dependencies.
22. How would you implement circuit breakers at the API gateway level vs. per-service?
23. How do circuit breakers fit into a broader resilience strategy (timeouts, retries, bulkheads, rate limiting)?
24. How would you make circuit breakers observable across a distributed system?
25. When should you NOT use a circuit breaker?

## 11. Scenario-Based Engineering Problems

1. **Breaker Trips Too Frequently** — Your circuit breaker for a payment service trips during normal traffic spikes. Diagnose: review failure threshold (too low?), minimum requests (too small?), and timeout (too short?).

2. **Breaker Stays Open Too Long** — After a downstream service recovers, your circuit breaker remains Open for minutes. Diagnose: check the timeout duration, verify Half-Open trial requests are being made.

3. **No Fallback When Open** — When the circuit breaker is Open, your API returns 503 errors instead of graceful degradation. Diagnose: implement fallback responses (cached data, default values).

4. **Breaker State Not Shared Across Instances** — Each service instance has its own circuit breaker, so one instance trips while others still send traffic to the failing service. Diagnose: consider a centralized breaker state (Redis-backed).

5. **False Positives from Network Blips** — Brief network glitches cause your breaker to trip unnecessarily. Diagnose: increase the minimum requests before evaluation, add a short delay before counting failures.

## 12. Hands-On Exercises

### Beginner — In-memory circuit breaker

Implement a basic circuit breaker in Go with Closed/Open/Half-Open states. Test it with a mock HTTP client that returns failures at a configurable rate. Verify the breaker trips after the threshold is exceeded.

### Intermediate — Redis-backed distributed circuit breaker

Extend the circuit breaker to store state in Redis so multiple service instances share the same breaker state. Verify that tripping the breaker on one instance causes all instances to reject calls.

### Advanced — Circuit breaker with fallback and metrics

Build a complete resilience wrapper that combines circuit breaker, timeout, and retry logic. Add Prometheus metrics for breaker state and transitions. Add structured logging for every state change.

### Solutions

#### Solution — Beginner

The key insight is that the breaker must track successes and failures within a window and transition to Open when the failure rate exceeds the threshold. Use a mutex to protect concurrent access.

#### Solution — Intermediate (core assertions)

- All instances read the same breaker state from Redis
- When one instance trips the breaker, other instances return failures immediately
- After the timeout elapses, all instances transition to Half-Open together

#### Solution — Advanced (core structure)

- Breaker wraps the HTTP client and intercepts all outbound calls
- Fallback response returned when breaker is Open
- Prometheus counter `breaker_state` updated on every transition
- Structured log entry for each state change with reason

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Circuit breakers prevent cascading failures by stopping calls to unhealthy dependencies.
2. The three states (Closed, Open, Half-Open) provide automatic fail-fast and recovery testing.
3. Always pair circuit breakers with timeouts and fallback responses.
4. In multi-instance deployments, use distributed breaker state or gateway-level breakers.
5. Circuit breakers work with retries and timeouts as part of a broader resilience strategy.

### Quick revision sheet

| Concept | Key point |
|---------|-----------|
| Closed state | Normal operation, failures counted |
| Open state | Immediate rejection, no calls to dependency |
| Half-Open state | Trial requests to test recovery |
| Failure threshold | Percentage of failures that triggers Open |
| MinRequests | Minimum calls before evaluating failure rate |
| Timeout | Time in Open before attempting Half-Open |
| Fallback | Graceful response when breaker is Open |

### Essential terminology

- **Circuit breaker:** Resilience pattern that wraps calls to external dependencies and trips when failures exceed a threshold
- **Fail-fast:** Immediately rejecting requests when the breaker is open
- **Half-Open:** State that allows limited trial requests to test dependency recovery
- **Breaker trip:** Transition from Closed to Open due to excessive failures
- **Fallback:** Alternative response returned when the breaker is open

### Formulas and parameters

| Formula | Meaning |
|---------|---------|
| `failure_rate = failures / (successes + failures)` | Determines if breaker should trip |
| `failure_rate >= threshold` | Condition for Closed → Open transition |
| `time_since_last_change >= timeout` | Condition for Open → Half-Open transition |

### Decision-making checklist

- [ ] Is the dependency external and potentially unreliable?
- [ ] Can the caller tolerate a fast failure instead of waiting?
- [ ] Is a fallback response available (cached data, default value)?
- [ ] Is the breaker paired with timeouts?
- [ ] Is breaker state shared across instances (if needed)?
- [ ] Are breaker state transitions logged and metered?

### Flashcards

| Front | Back |
|-------|------|
| What is a circuit breaker? | A resilience pattern that wraps calls to external dependencies and trips when failures exceed a threshold |
| What are the three states? | Closed, Open, Half-Open |
| What happens in Closed state? | Requests flow normally; failures are counted |
| What happens in Open state? | Requests immediately fail without calling the dependency |
| What happens in Half-Open state? | Limited trial requests test whether the dependency recovered |
| What triggers Closed → Open? | Failure rate exceeds threshold within evaluation window |
| What triggers Open → Half-Open? | Configured timeout elapses |
| What triggers Half-Open → Closed? | Trial request succeeds |
| What triggers Half-Open → Open? | Trial request fails |
| What is fail-fast? | Immediately rejecting requests when the breaker is open |
| Name two circuit breaker libraries | Resilience4j (Java), gobreaker (Go), Polly (.NET) |
| Why monitor breaker state? | To detect when a dependency is persistently unhealthy |

### Three questions to verify genuine understanding

1. **Why does a circuit breaker need a Half-Open state instead of just retrying periodically?** The Half-Open state allows controlled testing of recovery without flooding a recovering dependency with full traffic.

2. **What happens if you use a circuit breaker without a timeout on the underlying calls?** Calls can hang indefinitely even when the breaker is Closed, because the breaker only trips on failures, not slow responses.

3. **Why should circuit breaker state be shared across instances in a production deployment?** Without shared state, one instance may trip while others continue sending traffic to a failing dependency, causing inconsistent behavior and partial cascading failures.

### Authoritative references and further reading

- Martin Fowler, "Circuit Breaker" — https://martinfowler.com/bliki/CircuitBreaker.html
- Michael T. Nygard, "Release It!" — Circuit breaker pattern chapter
- Netflix Hystrix — https://github.com/Netflix/Hystrix
- Resilience4j — https://resilience4j.readme.io/docs
- gobreaker — https://github.com/sony/gobreaker
