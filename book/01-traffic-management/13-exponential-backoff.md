# Chapter 13 — Exponential Backoff

> **Part I — Traffic Management and Deployment**
> **Prerequisites:** Chapter 12 (Retries)
> **FormForge context:** When the notification service is overwhelmed, FormForge's retry clients all hit it simultaneously at fixed intervals, making the outage worse. Exponential backoff spreads retry load over time, giving the service room to recover.

---

## 1. Definition and Fundamentals

### What it is

Exponential backoff is a retry strategy where the delay between retry attempts increases exponentially with each failure. This reduces load on struggling services and gives them time to recover.

Instead of retrying at fixed intervals (which can overwhelm a recovering service), exponential backoff waits progressively longer between each attempt, reducing the request rate as failures continue.

### Why it exists / what problem it solves

Without exponential backoff:

- **Thundering herd:** All clients retry at the same fixed interval, overwhelming the recovering service
- **No recovery window:** The service never gets a break because clients keep hammering it
- **Wasted resources:** Each failed retry consumes connection, thread, and CPU resources
- **Cascading failure:** Retry load makes the outage worse, extending recovery time

With exponential backoff:

- **Load reduction:** Fewer retries per unit time as failures continue
- **Recovery window:** The failing service gets progressively more time between attempts
- **Self-throttling:** Clients automatically slow down when the service is unhealthy
- **Graceful degradation:** System degrades gracefully instead of collapsing under retry load

### How it works internally (first pass)

The exponential backoff algorithm:

1. **First failure:** Wait base_delay (e.g., 100ms), then retry
2. **Second failure:** Wait base_delay × 2 (e.g., 200ms), then retry
3. **Third failure:** Wait base_delay × 4 (e.g., 400ms), then retry
4. **Nth failure:** Wait base_delay × 2^(N-1), capped at maxDelay
5. **Max attempts reached:** Return the last error

The delay grows exponentially: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms...

This means the time between retries increases rapidly, giving the struggling service more and more time to recover between attempts.

### Where it fits in the architecture

Exponential backoff is typically used in combination with:

- **Retries (→ Chapter 12):** Backoff determines the delay between retry attempts
- **Circuit breakers (→ Chapter 10):** When backoff is exhausted and the service is still failing, the circuit breaker trips
- **Timeouts (→ Chapter 11):** Each retry attempt is bounded by a timeout
- **Idempotency (→ Chapter 14):** Retried requests must be idempotent to avoid duplicate side effects

Backoff can be implemented at multiple layers:

1. **Client-side libraries** — HTTP client retry with backoff, gRPC retry with backoff
2. **Application middleware** — backoff wrapper around service calls
3. **API gateway** — per-upstream backoff configuration
4. **Message queues** — message redelivery with exponential backoff

## 2. Types, Variants, and Classifications
### By jitter strategy

| Strategy | Formula | Best for |
|----------|---------|----------|
| **No jitter** | `base × 2^(attempt-1)` | Simple cases, low client count |
| **Equal jitter** | `base × 2^(attempt-1)/2 + random(0, base × 2^(attempt-1)/2)` | General purpose |
| **Full jitter** | `random(0, base × 2^(attempt-1))` | High contention, many clients |
| **Decorrelated jitter** | `random(base, previous_delay × 3)` | Smooth retry distribution |

### By multiplier

| Multiplier | Behavior | Use case |
|------------|----------|----------|
| **2.0 (doubling)** | Delay doubles each attempt | Standard exponential backoff |
| **1.5** | Slower growth | When you want gentler backoff |
| **3.0** | Faster growth | When you want rapid load reduction |

### By cap strategy

| Strategy | Behavior | Use case |
|----------|----------|----------|
| **Fixed maxDelay** | Cap delay at a fixed value | Predictable maximum wait time |
| **No cap** | Delay grows without bound | Not recommended; can cause very long waits |

### Decision guide: choose your backoff strategy

| Scenario | Recommended strategy |
|----------|-------------------|
| External HTTP API, few clients | Equal jitter, base 100ms, max 30s |
| External HTTP API, many clients | Full jitter, base 100ms, max 60s |
| Internal service, low contention | Equal jitter, base 50ms, max 10s |
| Database connection retry | No jitter, base 1s, max 30s |
| Payment/retry critical | Full jitter, base 500ms, max 30s |

## 3. Internal Working and Architecture

### Execution flow: backoff attempt by attempt

1. **First attempt:** Execute the operation immediately (no delay before first attempt)
2. **Failure:** Calculate delay using backoff formula: base × multiplier^(attempt-1)
3. **Apply cap:** If calculated delay exceeds maxDelay, use maxDelay
4. **Apply jitter:** Add randomness based on jitter strategy
5. **Sleep:** Wait for the calculated delay
6. **Retry:** Execute the operation again
7. **Repeat:** Steps 2-6 until success or max attempts reached

### Failure paths drawn explicitly

| Stage | Failure mode | Effect | Mitigation |
|-------|-------------|--------|------------|
| **First attempt fails** | Transient failure | Would fail without backoff | Backoff allows recovery time |
| **Delay too short** | Service still unhealthy | Retry fails immediately | Increase base delay or multiplier |
| **Jitter missing** | All clients retry simultaneously | Thundering herd on recovery | Always use jitter in production |
| **No maxDelay cap** | Delay grows without bound | Very long waits on persistent failure | Always set maxDelay |
| **No max attempts** | Infinite retries | Resource exhaustion | Always set max attempts |

### Algorithms and complexity

| Metric | Value / assumption |
|--------|-------------------|
| **Delay calculation** | O(1) per attempt |
| **Total wait time** | O(base × 2^attempts) worst case, capped by maxDelay |
| **Memory per backoff** | O(1) - attempt counter and last delay |

### Important configuration parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `BaseDelay` | 100ms | 10ms–5s | Initial delay between retries |
| `MaxDelay` | 30s | 1s–60s | Maximum delay between retries |
| `Multiplier` | 2.0 | 1.5–3.0 | Exponential growth factor |
| `MaxAttempts` | 5 | 1–10 | Maximum number of retry attempts |
| `Jitter` | equal | none/equal/full/decorrelated | Jitter strategy |

## 4. Practical Implementation

### Scenario

When the notification service is overwhelmed, FormForge's retry clients all hit it simultaneously at fixed intervals, making the outage worse. Exponential backoff spreads retry load over time, giving the service room to recover.

### Requirements

- Implement exponential backoff with base delay 100ms, max delay 30s, max 5 attempts
- Support multiple jitter strategies: none, equal, full, decorrelated
- Respect `Retry-After` header from server when present
- Combine with circuit breaker: stop retrying when breaker is open
- Thread-safe backoff state for concurrent retries

### Technology stack

- Go 1.21+
- Standard library (`math`, `math/rand`, `time`, `sync`)

### Project structure

```
internal/backoff/
    backoff.go         # Core backoff implementation
    backoff_test.go    # Unit tests
    example.go         # Usage example
```

### Configuration

```go
package backoff

import (
    "math"
    "math/rand"
    "time"
)

type Strategy int

const (
    StrategyNone Strategy = iota
    StrategyEqualJitter
    StrategyFullJitter
    StrategyDecorrelated
)

type Config struct {
    BaseDelay   time.Duration
    MaxDelay    time.Duration
    MaxAttempts int
    Strategy    Strategy
    Multiplier  float64
}

func DefaultConfig() Config {
    return Config{
        BaseDelay:   100 * time.Millisecond,
        MaxDelay:    30 * time.Second,
        MaxAttempts: 5,
        Strategy:    StrategyEqualJitter,
        Multiplier:  2.0,
    }
}
```

### Implementation

```go
type Backoff struct {
    mu       sync.Mutex
    config   Config
    attempt  int
    lastDelay time.Duration
}

func New(config Config) *Backoff {
    return &Backoff{
        config:   config,
        attempt:  0,
        lastDelay: config.BaseDelay,
    }
}

func (b *Backoff) Next() time.Duration {
    b.mu.Lock()
    defer b.mu.Unlock()

    b.attempt++

    if b.attempt == 1 {
        b.lastDelay = b.config.BaseDelay
        return b.lastDelay
    }

    exponentialDelay := time.Duration(
        float64(b.config.BaseDelay) * math.Pow(b.config.Multiplier, float64(b.attempt-1)),
    )

    if exponentialDelay > b.config.MaxDelay {
        exponentialDelay = b.config.MaxDelay
    }

    switch b.config.Strategy {
    case StrategyFullJitter:
        b.lastDelay = time.Duration(rand.Int63n(int64(exponentialDelay)))
    case StrategyDecorrelated:
        min := int64(b.config.BaseDelay)
        max := int64(b.lastDelay * 3)
        b.lastDelay = time.Duration(min + rand.Int63n(max-min))
    case StrategyEqualJitter:
        fixed := exponentialDelay / 2
        random := time.Duration(rand.Int63n(int64(fixed)))
        b.lastDelay = fixed + random
    default: // StrategyNone
        b.lastDelay = exponentialDelay
    }

    return b.lastDelay
}

func (b *Backoff) Done() bool {
    b.mu.Lock()
    defer b.mu.Unlock()
    return b.attempt >= b.config.MaxAttempts
}

func (b *Backoff) Reset() {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.attempt = 0
    b.lastDelay = b.config.BaseDelay
}
```

### Usage Example

```go
backoff := New(DefaultConfig())

for !backoff.Done() {
    err := callDownstreamService()
    if err == nil {
        return nil // Success
    }
    if !isRetryable(err) {
        return err // Don't retry non-retryable errors
    }
    delay := backoff.Next()
    time.Sleep(delay)
}
return fmt.Errorf("failed after %d attempts", backoff.config.MaxAttempts)
```

### Testing

- Unit test: delay increases exponentially with each attempt
- Unit test: max delay is respected
- Unit test: jitter produces different delays on each call
- Unit test: Done() returns true after max attempts
- Unit test: Reset() resets attempt counter
- Concurrency test: concurrent calls to Next() are thread-safe

### Expected result (representative)

```
Attempt 1: failure, delay = 100ms
Attempt 2: failure, delay = 200ms ± jitter
Attempt 3: failure, delay = 400ms ± jitter
Attempt 4: failure, delay = 800ms ± jitter
Attempt 5: failure, delay = 1600ms ± jitter
Attempt 6: Done() = true, return error
```

### Explanation of key decisions

- **Mutex protection:** Backoff state is shared across retries; mutex ensures thread safety
- **Base delay of 100ms:** Short enough for quick recovery, long enough to avoid overwhelming
- **Max delay of 30s:** Prevents excessively long waits on persistent failure
- **Equal jitter default:** Good balance between predictability and randomness
- **Multiplier of 2.0:** Standard exponential growth

## 5. Production-Ready Implementation

### Correctness at scale: thundering herd prevention

When many clients retry simultaneously after an outage, they can overwhelm the recovering service. Exponential backoff with jitter prevents this by:

- **Spreading retries over time:** Each client waits a different amount before retrying
- **Reducing retry rate:** Delay grows exponentially, so fewer retries per unit time
- **Combining with circuit breaker:** When breaker is open, no retries are attempted at all

### Security and access control

- Backoff configuration should not be exposed to unauthenticated clients
- Rate limiting combined with backoff prevents abuse through rapid retries

### Configuration and secrets

- Backoff parameters (base delay, max delay, multiplier, max attempts) should be environment-variable configurable
- Different dependencies need different backoff policies
- Never hardcode backoff values; make them observable and tunable

### Resource management and latency

- Each backoff delay adds to total request time
- Too many attempts can cause excessive user-perceived latency
- Memory overhead is minimal (attempt counter per backoff instance)

### Observability (the part that makes it operable)

- **Metrics:** `backoff_attempts_total` (counter), `backoff_delay_seconds` (histogram), `backoff_exhausted_total` (counter)
- **Logging:** Log each backoff delay with attempt number and calculated delay
- **Alerting:** Alert when backoff exhaustion rate exceeds threshold (e.g., >5% of requests exhaust retries)
- **Dashboard:** Show backoff delay distribution and retry rate per dependency

### Backoff, failure handling, graceful behavior

- Always respect `Retry-After` header from server when present
- Combine backoff with circuit breaker: when breaker is open, skip backoff entirely
- Return a meaningful error when all retries are exhausted
- Consider returning a fallback response when backoff is exhausted

### Deployment and rollback

- Deploy backoff configuration behind feature flags for easy tuning
- Rollback = revert backoff values to previous known-good settings
- Canary: test new backoff values on a small percentage of traffic

### Testing and maintainability

- Chaos engineering: introduce artificial failures and verify backoff behavior
- Load test with failing dependencies to verify backoff reduces load over time
- Document backoff policy per dependency in the service runbook

### Cost and operational complexity

- Exponential backoff: near-zero implementation cost, minimal operational overhead
- The cost of *not* having backoff (thundering herd, outages) exceeds the cost of implementing it

## 6. Edge Cases and Failure Scenarios

### Case 1 — Thundering herd on recovery

- **Scenario:** After an outage, all clients retry at the same second.
- **Cause:** Clients using fixed-delay or no-jitter backoff.
- **Impact:** The recovering service is overwhelmed again.
- **Detect:** Monitor request rate spike immediately after service recovery.
- **Prevent:** Implement full jitter or equal jitter.
- **Test:** Recover service after outage; assert client retries are spread over time.

### Case 2 — Excessive retry latency

- **Scenario:** Users wait 30+ seconds for a response because of too many retry attempts.
- **Cause:** Max attempts too high, maxDelay too large.
- **Impact:** Poor user experience; slow responses.
- **Detect:** Monitor p99 latency alongside retry counts.
- **Prevent:** Reduce max attempts to 3-5, lower maxDelay, implement circuit breaker.
- **Test:** Slow dependency; assert p99 latency stays within SLA.

### Case 3 — Backoff not respected

- **Scenario:** Clients ignore calculated backoff delays and retry immediately.
- **Cause:** Backoff state not persisted across retries, or client doesn't sleep for calculated delay.
- **Impact:** Clients hammer the service despite backoff being configured.
- **Detect:** Monitor for rapid successive retries from same client.
- **Prevent:** Ensure backoff state persists; client actually sleeps for calculated delay.
- **Test:** Configure backoff; assert client waits at least the calculated delay between retries.

### Case 4 — Mixed jitter strategies

- **Scenario:** Some clients use full jitter, others use no jitter.
- **Cause:** Different client libraries or configurations.
- **Impact:** Inconsistent retry behavior; no-jitter clients can cause thundering herd.
- **Detect:** Compare retry patterns across different client types.
- **Prevent:** Standardize on one jitter strategy across all client libraries.
- **Test:** All clients use same jitter strategy; assert consistent retry distribution.

### Case 5 — Retry-After ignored

- **Scenario:** Server sends Retry-After: 60 but clients retry after 1 second.
- **Cause:** Client code doesn't check for or respect the Retry-After header.
- **Impact:** Clients retry too soon, adding load to the server.
- **Detect:** Monitor for retries sooner than Retry-After value.
- **Prevent:** Client code checks for and respects Retry-After header.
- **Test:** Server returns Retry-After header; assert client waits at least that long.

## 7. Common Mistakes and Anti-Patterns

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|------------------|
| **No jitter** | All clients retry simultaneously → thundering herd | Always add jitter in production |
| **No max attempts** | Can retry indefinitely on persistent failure | Always set max attempts |
| **No max delay cap** | Delay grows without bound on persistent failure | Always set maxDelay |
| **Fixed delay for all retries** | Doesn't reduce load over time | Use exponential backoff |
| **Retrying immediately after backoff exhausts** | Wastes resources on known-failing service | Combine with circuit breaker |
| **Ignoring Retry-After header** | Server tells client when to retry; ignoring causes premature retries | Respect Retry-After on 429/503 |
| **Using backoff without retries** | Backoff is meaningless without retry logic | Always pair backoff with retries |

## 8. Performance and Scalability

### Cost model per backoff attempt

- **Delay calculation:** O(1) per attempt
- **Additional latency:** Sum of all backoff delays
- **Memory per backoff:** O(1) - attempt counter and last delay

### Complexity recap

| Operation | Time complexity | Space complexity |
|-----------|----------------|------------------|
| Calculate next delay | O(1) | O(1) |
| Check if done | O(1) | O(1) |
| Reset backoff | O(1) | O(1) |

### Throughput and bottlenecks

- Backoff reduces effective throughput (failed attempts consume time)
- Thundering herd can overwhelm downstream services
- Circuit breakers prevent backoff storms by stopping calls to unhealthy dependencies

### Scaling strategies

1. **Client-side backoff** — simplest, start here
2. **Gateway-level backoff** — centralized, no app changes
3. **Adaptive backoff** — adjust parameters based on observed error rates
4. **Retry budgets** — limit retry percentage per dependency

### Benchmarking method

- Benchmark backoff delay calculation
- Measure total time with different backoff configurations
- Test thundering herd scenario: many clients retrying simultaneously
- Verify circuit breaker prevents backoff storm

## 9. Testing and Debugging

### Unit tests (no dependencies)

```go
func TestBackoffDelayIncreases(t *testing.T) {
    b := New(Config{
        BaseDelay:   100 * time.Millisecond,
        MaxDelay:    30 * time.Second,
        MaxAttempts: 5,
        Strategy:    StrategyNone,
        Multiplier:  2.0,
    })
    
    d1 := b.Next() // attempt 1 → base delay
    d2 := b.Next() // attempt 2 → base × 2
    d3 := b.Next() // attempt 3 → base × 4
    
    if d2 <= d1 {
        t.Fatal("delay should increase with each attempt")
    }
    if d3 <= d2 {
        t.Fatal("delay should increase with each attempt")
    }
}

func TestBackoffMaxDelay(t *testing.T) {
    b := New(Config{
        BaseDelay:   100 * time.Millisecond,
        MaxDelay:    1 * time.Second,
        MaxAttempts: 10,
        Strategy:    StrategyNone,
        Multiplier:  2.0,
    })
    
    for i := 0; i < 10; i++ {
        b.Next()
    }
    
    // After many attempts, delay should be capped at maxDelay
    delay := b.Next()
    if delay > b.config.MaxDelay {
        t.Fatalf("delay %v exceeds maxDelay %v", delay, b.config.MaxDelay)
    }
}

func TestBackoffDone(t *testing.T) {
    b := New(Config{
        BaseDelay:   100 * time.Millisecond,
        MaxDelay:    30 * time.Second,
        MaxAttempts: 3,
        Strategy:    StrategyNone,
        Multiplier:  2.0,
    })
    
    if b.Done() {
        t.Fatal("should not be done initially")
    }
    b.Next() // attempt 1
    b.Next() // attempt 2
    if b.Done() {
        t.Fatal("should not be done after 2 attempts with max 3")
    }
    b.Next() // attempt 3
    if !b.Done() {
        t.Fatal("should be done after max attempts")
    }
}
```

### Integration tests (real dependencies)

- Test with a real HTTP server that returns 503 on first attempt, 200 on second
- Verify backoff delay is applied between attempts
- Verify success on retry

### Concurrency test

- Run N concurrent backoff instances
- Assert each instance maintains independent state
- Assert no race conditions (use `go test -race`)

### Load test (k6 sketch)

```javascript
import http from 'k6/http';

export default function() {
    const resp = http.get('http://flaky-service:8080/data', {
        retries: 3,
    });
    check(resp, {
        'eventually succeeds': (r) => r.status === 200,
    });
}
```

### Failure injection

- Use chaos engineering tools to inject transient failures
- Test with partial failures (some requests fail, some succeed)
- Test with cascading failures

### Debugging toolkit

- Check backoff metrics: `backoff_attempts_total`, `backoff_delay_seconds`
- Review backoff logs for calculated delays
- Identify which dependencies have the longest backoff delays
- Check circuit breaker state to see if backoff is being bypassed

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

1. What is the formula for exponential backoff delay?
2. What is jitter, and why is it essential in exponential backoff?
3. What is the thundering herd problem?
4. How does full jitter differ from equal jitter?
5. What is the purpose of maxDelay in backoff configuration?

### Level 2 — Implementation

6. How should clients handle the Retry-After header?
7. How do you implement thread-safe backoff state?
8. How does exponential backoff differ from fixed delay retry?
9. What happens when maxDelay is reached?
10. How do you reset backoff state after a successful call?

### Level 3 — Advanced Engineering

11. How do you prevent thundering herd after a service outage?
12. What's the relationship between backoff and circuit breakers?
13. How do you set appropriate baseDelay and maxDelay values?
14. How do you handle backoff in distributed systems?
15. What's the impact of backoff on P99 latency?

### Level 4 — Production Scenarios

16. Your service experiences a thundering herd after an outage. How do you mitigate it?
17. How do you coordinate backoff between client, gateway, and backend?
18. What's the relationship between backoff and P99 latency?
19. How do you monitor backoff rates across microservices?
20. When should you use full jitter vs equal jitter?

### Level 5 — System Design

21. Design a backoff strategy for a system with 50+ dependencies.
22. How does backoff interact with retries, circuit breakers, and timeouts?
23. How would you implement adaptive backoff based on observed error rates?
24. How do you handle backoff in asynchronous message-based systems?
25. When should you NOT use exponential backoff?

## 11. Scenario-Based Engineering Problems

1. **Thundering Herd on Recovery** — After an outage, all clients retry at the same second. Diagnose: clients are using fixed-delay or no-jitter backoff. Implement full jitter.

2. **Excessive Retry Latency** — Users wait 30+ seconds for a response because of 8 retry attempts. Diagnose: reduce max attempts to 3-5, lower maxDelay, implement circuit breaker.

3. **Backoff Not Respected** — Clients ignore calculated backoff delays and retry immediately. Diagnose: ensure backoff state persists across retries, client actually sleeps for calculated delay.

4. **Mixed Jitter Strategies** — Some clients use full jitter, others use no jitter. Diagnose: standardize on one jitter strategy across all client libraries.

5. **Retry-After Ignored** — Server sends Retry-After: 60 but clients retry after 1 second. Diagnose: client code should check for and respect the Retry-After header.

## 12. Hands-On Exercises

### Beginner — Basic exponential backoff

Implement a Go backoff calculator that returns exponentially increasing delays. Test that delays double with each attempt.

### Intermediate — Jitter strategies

Implement all four jitter strategies (none, equal, full, decorrelated). Verify that jitter produces different delays on each call.

### Advanced — Backoff with circuit breaker integration

Build a backoff wrapper that checks circuit breaker state before calculating delay. When the breaker is open, return immediately without calculating backoff.

### Solutions

#### Solution — Beginner

delay = baseDelay × multiplier^(attempt-1). Test that delay doubles each attempt.

#### Solution — Intermediate (core assertions)

- Full jitter: random(0, calculatedDelay)
- Equal jitter: calculatedDelay/2 + random(0, calculatedDelay/2)
- Decorrelated: random(baseDelay, previousDelay × 3)
- Verify delays are non-deterministic (jitter works)

#### Solution — Advanced (core structure)

- Check circuit breaker state before each backoff calculation
- If breaker is open, return error without calculating backoff
- Log breaker state when backoff is skipped

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Exponential backoff reduces load on struggling services by increasing delay between retries.
2. Jitter is essential to prevent thundering herd when many clients retry simultaneously.
3. Always set maxDelay and maxAttempts to bound total retry time.
4. Backoff works with circuit breakers: when breaker is open, stop retrying.
5. Respect Retry-After header when servers provide it.

### Quick revision sheet

| Concept | Key point |
|---------|-----------|
| Exponential backoff | Delay increases exponentially with each failure |
| Formula | delay = base × multiplier^(attempt-1) |
| Jitter | Randomness added to prevent thundering herd |
| Full jitter | random(0, calculatedDelay) |
| Equal jitter | calculatedDelay/2 + random(0, calculatedDelay/2) |
| Decorrelated jitter | random(baseDelay, previousDelay × 3) |
| maxDelay | Upper cap on backoff delay |
| maxAttempts | Maximum number of retry attempts |
| Thundering herd | Many clients retrying simultaneously |
| Retry-After | Server hint telling client how long to wait |

### Essential terminology

- **Exponential backoff:** Retry strategy where delay increases exponentially with each failure
- **Jitter:** Randomness added to retry delays
- **Thundering herd:** Many clients retrying simultaneously, overwhelming the service
- **Base delay:** Initial delay before first retry
- **Max delay:** Maximum delay between retries
- **Multiplier:** Exponential growth factor (typically 2.0)

### Formulas and parameters

| Formula | Meaning |
|---------|---------|
| `delay = base × multiplier^(attempt-1)` | Exponential backoff delay |
| `delay_with_full_jitter = random(0, delay)` | Full jitter |
| `delay_with_equal_jitter = delay/2 + random(0, delay/2)` | Equal jitter |
| `delay_with_decorrelated = random(base, prevDelay × 3)` | Decorrelated jitter |

### Decision-making checklist

- [ ] Does every retry use exponential backoff?
- [ ] Is jitter enabled to prevent thundering herd?
- [ ] Is maxDelay set to bound total wait time?
- [ ] Is maxAttempts set to prevent infinite retries?
- [ ] Is circuit breaker checked before retrying?
- [ ] Is Retry-After header respected when present?

### Flashcards

| Front | Back |
|-------|------|
| What is exponential backoff? | Retry strategy where delay increases exponentially with each failure |
| What is the backoff formula? | delay = base_delay × multiplier^(attempt-1) |
| What is jitter? | Randomness added to retry delays |
| What is full jitter? | delay = random(0, calculated_delay) |
| What is equal jitter? | Half fixed delay + half random delay |
| What is thundering herd? | Many clients retrying simultaneously, overwhelming the service |
| What is decorrelated jitter? | Uses previous delay to calculate next delay range |
| What is maxDelay? | Upper cap on backoff delay |
| What is Retry-After header? | Server hint telling client how long to wait before retrying |
| Why combine backoff with circuit breakers? | Backoff handles transient failures; breakers handle persistent failures |
| What is a good base delay? | 100ms - 1s depending on service SLA |
| What is a good max attempts? | 3-5 attempts |

### Three questions to verify genuine understanding

1. **Why is jitter essential in exponential backoff?** Without jitter, all clients using the same backoff parameters will retry at the same times, creating synchronized spikes that overwhelm the recovering service (thundering herd).

2. **What happens if you set maxDelay too high?** On a persistent failure, clients will wait very long between retries, which can mask the failure and delay user-visible error reporting. It also means recovery takes longer to detect.

3. **How does decorrelated jitter differ from full jitter?** Full jitter picks a random delay from 0 to the calculated delay. Decorrelated jitter uses the previous delay to set a range (base to previous×3), which produces a smoother distribution and avoids very short delays after very long ones.

### Authoritative references and further reading

- AWS Architecture Blog: "Exponential Backoff And Jitter" — https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Google SRE Book, Chapter 8: "Handling Overload" — https://sre.google/sre-book/handling-overload/
- HTTP/1.1 Semantics and Content (RFC 7231) — https://tools.ietf.org/html/rfc7231 (Retry-After header)
- Go `time` package documentation — https://pkg.go.dev/time
| **Self-throttling** | Clients automatically slow down when the service is unhealthy |
