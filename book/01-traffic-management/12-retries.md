# Chapter 12 — Retries

> **Part I — Traffic Management and Deployment**
> **Prerequisites:** Chapter 10 (Circuit Breakers), Chapter 11 (Timeouts), Chapter 14 (Idempotency)
> **FormForge context:** The submission API calls a payment service that occasionally returns transient errors (503, network glitches). Retries allow automatic recovery from temporary failures without user intervention.

---

## 1. Definition and Fundamentals

### What it is

A retry automatically re-attempts a failed operation, typically with a delay between attempts. Retries handle transient failures—temporary issues that resolve on their own, such as network blips, momentary service overload, or brief database locks.

A retry mechanism wraps an operation and, on failure, waits for a delay and tries again, up to a maximum number of attempts. If all attempts fail, the last error is returned to the caller.

### Why it exists / what problem it solves

Without retries:

- **Transient failures become permanent:** A brief network glitch causes a user-facing error instead of a successful retry
- **Poor user experience:** Users see errors for issues that would resolve on their own
- **Increased support load:** Users contact support for errors that could be handled automatically
- **Lost business:** Failed payments, submissions, or operations mean lost revenue

With retries:

- **Automatic recovery:** Transient failures are handled transparently without user intervention
- **Improved reliability:** Overall success rate increases, especially under partial failure conditions
- **Better user experience:** Users see fewer errors for temporary issues
- **Resilience to transient infrastructure issues:** Network blips, brief overloads, momentary locks are handled gracefully

### How it works internally (first pass)

A retry mechanism follows this flow:

1. **Execute the operation** (e.g., HTTP request, database query)
2. **Check the result:** If success, return immediately
3. **Check if retryable:** If failure, determine whether the error is retryable (transient) or not
4. **Check attempt limit:** If max attempts reached, return the last error
5. **Wait:** Sleep for the configured delay (fixed, exponential, or with jitter)
6. **Repeat:** Go back to step 1

Key decisions in the retry flow:

- **Which errors are retryable?** Network timeouts, 502/503/504, 429 → retry; 400/401/403/404 → don't retry
- **How many attempts?** Typically 3-5; more attempts increase user wait time
- **What delay between attempts?** Fixed delay, exponential backoff, or with jitter
- **What's the retry budget?** Limit the percentage of total requests that can be retries

### Where it fits in the architecture

Retries are applied at multiple layers:

1. **Client-side libraries** — HTTP client retry logic, gRPC retry, database connection retry
2. **Application middleware** — retry wrapper around service calls with business-aware decisions
3. **API gateway / reverse proxy** — retry per upstream with circuit breaker integration (→ Chapter 05, 10)
4. **Message queues** — message redelivery on processing failure (→ Chapter 42)

Retries work closely with circuit breakers (→ Chapter 10) and timeouts (→ Chapter 11): timeouts determine when a call has failed, circuit breakers stop making calls when a dependency is unhealthy, and retries handle transient failures between these extremes.

Idempotency (→ Chapter 14) is critical for retries: retrying a non-idempotent operation can cause duplicate side effects (double charges, duplicate submissions).

## 2. Types, Variants, and Classifications
### By delay strategy

| Strategy | How delay is calculated | Best for |
|----------|------------------------|----------|
| **Fixed delay** | Same delay between every attempt | Simple services, predictable transient failures |
| **Exponential backoff** | Delay doubles each attempt: base × 2^(n-1) | Most general-purpose retry scenarios |
| **Exponential backoff with jitter** | Adds randomness to prevent thundering herd | High-contention services, many clients |
| **Immediate retry** | No delay between attempts | Very fast transient failures (rare) |

### By retry scope

| Scope | What is retried | Example |
|-------|----------------|---------|
| **Single operation** | One HTTP request, one DB query | GET /api/users/123 |
| **Multi-step transaction** | Sequence of operations | Create order → charge payment → send email |
| **Idempotent operation** | Safe to repeat without side effects | GET, PUT, DELETE |
| **Non-idempotent operation** | Requires deduplication key | POST /payments (needs idempotency key) |

### By retryability

| Error type | Retryable? | Example |
|------------|------------|---------|
| **Transient network errors** | Yes | TCP timeout, connection refused, DNS failure |
| **5xx server errors** | Yes | 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout |
| **429 Too Many Requests** | Yes (with backoff) | Rate limit exceeded; honor Retry-After header |
| **4xx client errors** | No | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found |
| **Business logic errors** | No | Insufficient funds, invalid input, duplicate resource |

### Decision guide: choose your retry strategy

| Scenario | Recommended strategy |
|----------|-------------------|
| External HTTP API | Exponential backoff with jitter, 3-5 attempts |
| Database query | Fixed delay, 3 attempts, short base delay |
| Internal gRPC service | Exponential backoff, 3 attempts |
| User-facing operation | Shorter timeouts, fewer attempts, clear error on failure |
| Background job | Longer timeouts, more attempts, exponential backoff |

## 3. Internal Working and Architecture

### Execution flow: retry attempt by attempt

1. **First attempt:** Execute the operation
2. **Success:** Return result immediately
3. **Failure:** Check if error is retryable (transient)
4. **Not retryable:** Return error immediately
5. **Retryable and attempts remaining:** Wait for delay, increment attempt counter
6. **Retryable and no attempts remaining:** Return last error
7. **Repeat:** Go back to step 1

### Failure paths drawn explicitly

| Stage | Failure mode | Effect | Mitigation |
|-------|-------------|--------|------------|
| **First attempt** | Transient failure (network blip) | Would fail without retry | Retry succeeds on second attempt |
| **Retryable check** | Non-retryable error retried | Wastes time and resources | Check error type/code before retrying |
| **Max attempts reached** | All attempts failed | Last error returned to caller | Consider circuit breaker to stop calls |
| **Delay too short** | Service still unhealthy on retry | Retries fail immediately | Use exponential backoff with jitter |
| **Idempotency missing** | Non-idempotent operation retried | Duplicate side effects (double charge) | Use idempotency keys for non-idempotent ops |

### Algorithms and complexity

| Metric | Value / assumption |
|--------|-------------------|
| **Retry delay calculation** | O(1) per attempt |
| **Total retry time** | Sum of delays across attempts |
| **Memory per retry** | O(1) - just attempt counter and last error |
| **Exponential backoff** | Delay = base × 2^(attempt-1), capped at maxDelay |

### Important configuration parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `MaxAttempts` | 3 | 1–10 | Maximum number of retry attempts |
| `BaseDelay` | 100ms | 10ms–5s | Initial delay between retries |
| `MaxDelay` | 30s | 1s–60s | Maximum delay between retries |
| `RetryableStatusCodes` | 502,503,504,429 | — | HTTP status codes that trigger retry |
| `Jitter` | enabled | true/false | Add randomness to delays |

## 4. Practical Implementation

### Scenario

FormForge's submission API calls a payment service that occasionally returns transient errors (503, network glitches). Without retries, every transient error becomes a user-facing failure. With retries, the API can automatically recover from temporary issues.

### Requirements

- Retry on transient errors: network timeouts, 502, 503, 504, 429
- Do not retry on client errors: 400, 401, 403, 404
- Maximum 3 retry attempts (4 total attempts)
- Exponential backoff with jitter: base delay 100ms, max delay 5s
- Idempotency key required for non-idempotent operations (POST /payments)
- Circuit breaker integration: stop retrying when breaker is open

### Technology stack

- Go 1.21+
- Standard library (`net/http`, `context`, `time`, `math/rand`)
- Optional: retry library (e.g., go-resiliency)

### Project structure

```
internal/retry/
    retry.go           # Core retry logic
    retryable.go       # Retryable error detection
    backoff.go         # Backoff strategies
    retry_test.go      # Unit tests
```

### Configuration

```go
type Config struct {
    MaxAttempts     int
    BaseDelay       time.Duration
    MaxDelay        time.Duration
    RetryableStatus map[int]bool
    Jitter          bool
}

func DefaultConfig() Config {
    return Config{
        MaxAttempts: 4,
        BaseDelay:   100 * time.Millisecond,
        MaxDelay:    5 * time.Second,
        RetryableStatus: map[int]bool{
            502: true, 503: true, 504: true, 429: true,
        },
        Jitter: true,
    }
}
```

### Implementation

**Retryable error detection:**

```go
package retry

import (
    "errors"
    "net/http"
)

func IsRetryable(err error) bool {
    if errors.Is(err, context.DeadlineExceeded) {
        return true
    }
    var statusErr *StatusError
    if errors.As(err, &statusErr) {
        return statusErr.Retryable
    }
    return false
}

type StatusError struct {
    StatusCode int
    Retryable  bool
    Err        error
}

func (e *StatusError) Error() string {
    return e.Err.Error()
}
```

**Retry with exponential backoff:**

```go
func Retry(fn func() error, config Config) error {
    var lastErr error
    
    for attempt := 0; attempt < config.MaxAttempts; attempt++ {
        if attempt > 0 {
            delay := config.Backoff(attempt)
            time.Sleep(delay)
        }
        
        err := fn()
        if err == nil {
            return nil
        }
        
        lastErr = err
        if !IsRetryable(err) {
            return err
        }
    }
    
    return fmt.Errorf("failed after %d attempts: %w", config.MaxAttempts, lastErr)
}

func (c Config) Backoff(attempt int) time.Duration {
    delay := time.Duration(float64(c.BaseDelay) * math.Pow(2, float64(attempt-1)))
    if delay > c.MaxDelay {
        delay = c.MaxDelay
    }
    if c.Jitter {
        delay = delay + time.Duration(rand.Int63n(int64(delay)/2))
    }
    return delay
}
```

**HTTP client with retry:**

```go
func DoWithRetry(client *http.Client, req *http.Request, config Config) (*http.Response, error) {
    var lastErr error
    
    for attempt := 0; attempt < config.MaxAttempts; attempt++ {
        if attempt > 0 {
            delay := config.Backoff(attempt)
            time.Sleep(delay)
        }
        
        resp, err := client.Do(req)
        if err != nil {
            lastErr = err
            if !IsRetryable(err) {
                return nil, err
            }
            continue
        }
        
        if config.RetryableStatus[resp.StatusCode] {
            resp.Body.Close()
            lastErr = &StatusError{
                StatusCode: resp.StatusCode,
                Retryable:  true,
                Err:        fmt.Errorf("HTTP %d", resp.StatusCode),
            }
            continue
        }
        
        return resp, nil
    }
    
    return nil, fmt.Errorf("failed after %d attempts: %w", config.MaxAttempts, lastErr)
}
```

### Execution

```go
config := DefaultConfig()
client := &http.Client{Timeout: 15 * time.Second}

req, _ := http.NewRequest("GET", "https://api.payment-service.com/charge", nil)
req.Header.Set("Idempotency-Key", "unique-payment-key-123")

resp, err := DoWithRetry(client, req, config)
if err != nil {
    // All retries exhausted
    return nil, err
}
defer resp.Body.Close()
```

### Testing

- Unit test: retry succeeds on second attempt after transient failure
- Unit test: no retry on non-retryable error (400, 401, 404)
- Unit test: max attempts exhausted returns last error
- Unit test: exponential backoff delay increases with each attempt
- Unit test: jitter produces different delays on each call
- Integration test: real HTTP server with flaky responses

### Expected result (representative)

```
Attempt 1: HTTP 503 Service Unavailable → retryable, wait 100ms
Attempt 2: HTTP 503 Service Unavailable → retryable, wait 200ms+jitter
Attempt 3: HTTP 200 OK → success
Total time: ~300ms + jitter
```

### Explanation of key decisions

- **MaxAttempts=4 (1 initial + 3 retries):** Balances reliability with user wait time
- **Exponential backoff with jitter:** Prevents thundering herd when many clients retry simultaneously
- **Idempotency key:** Ensures non-idempotent operations (payments) are not duplicated on retry
- **Retryable status codes:** Only retry on server-side errors, not client errors

## 5. Production-Ready Implementation

### Correctness at scale: retry storms

When many clients retry simultaneously after a service outage, they can overwhelm the recovering service — the **retry storm** problem. Solutions:

- **Jitter:** Add randomness to retry delays so clients don't retry in lockstep
- **Retry budget:** Limit retries to a percentage of total requests (e.g., 20%)
- **Exponential backoff:** Increase delay with each attempt, reducing retry rate over time
- **Circuit breaker:** Stop sending requests entirely when a dependency is unhealthy

### Security and access control

- Retries do not introduce new authentication concerns
- However, retry logic should not expose internal error details to unauthenticated clients
- Rate limiting combined with retries prevents retry-based abuse

### Configuration and secrets

- Retry configuration (max attempts, base delay, max delay) should be environment-variable configurable
- Different dependencies need different retry policies
- Never hardcode retry values; make them observable and tunable

### Resource management and latency

- Each retry adds delay to the total request time
- Too many retries can cause excessive latency for the user
- Retry budget prevents a small number of failing dependencies from consuming all retry capacity
- Memory overhead is minimal (attempt counter per retry)

### Observability (the part that makes it operable)

- **Metrics:** `retry_attempts_total` (counter), `retry_delay_seconds` (histogram), `retryable_errors_total` (counter)
- **Logging:** Log each retry attempt with attempt number, delay, and error type
- **Alerting:** Alert when retry rate exceeds threshold (e.g., >5% of requests retried)
- **Dashboard:** Show retry rate per dependency alongside success/failure rates

### Retries, failure handling, graceful behavior

- Always exhaust retries before returning an error to the caller
- Consider returning a fallback response when all retries are exhausted
- Log the final error after all retries are exhausted for debugging
- Combine with circuit breaker: when breaker is open, skip retries entirely

### Deployment and rollback

- Deploy retry configuration behind feature flags for easy tuning
- Rollback = revert retry values to previous known-good settings
- Canary: test new retry values on a small percentage of traffic

### Testing and maintainability

- Chaos engineering: introduce artificial failures and verify retry behavior
- Load test with failing dependencies to verify retry budget behavior
- Document retry policy per dependency in the service runbook

### Cost and operational complexity

- Retries: near-zero implementation cost, minimal operational overhead
- The cost of *not* having retries (lost business, poor UX) exceeds the cost of implementing them
- Operational complexity: tuning retry values requires production data

## 6. Edge Cases and Failure Scenarios

### Case 1 — Retry storm

- **Scenario:** After a service outage, thousands of clients retry simultaneously when the service recovers.
- **Cause:** No jitter, all clients retry at the same interval.
- **Impact:** The recovering service is overwhelmed again, causing another outage.
- **Detect:** Monitor request rate spike immediately after service recovery.
- **Prevent:** Add jitter to retry delays; use exponential backoff.
- **Test:** Recover service after outage; assert client retries are spread over time.

### Case 2 — Duplicate charges

- **Scenario:** Payment API retries failed charges, but customers are charged twice.
- **Cause:** Non-idempotent operation retried without deduplication key.
- **Impact:** Customers are charged multiple times for the same payment.
- **Detect:** Monitor for duplicate charges with same amount and customer.
- **Prevent:** Implement idempotency keys for all non-idempotent operations.
- **Test:** Retry a payment request with same idempotency key; assert single charge.

### Case 3 — Infinite retry loop

- **Scenario:** A client retries a request that always fails (e.g., invalid credentials).
- **Cause:** No max attempt limit, or non-retryable error treated as retryable.
- **Impact:** Client waits forever; resource waste.
- **Detect:** Monitor for requests with very high retry counts.
- **Prevent:** Set max attempt limit; distinguish retryable from non-retryable errors.
- **Test:** Send request that always fails; assert client stops after max attempts.

### Case 4 — Retry latency spikes

- **Scenario:** Users experience high latency because retries add cumulative delay.
- **Cause:** Too many attempts or too long base delay.
- **Impact:** Poor user experience; slow responses.
- **Detect:** Monitor latency percentiles alongside retry counts.
- **Prevent:** Reduce max attempts; use shorter base delays; implement circuit breaker.
- **Test:** Slow dependency; assert p99 latency stays within SLA.

### Case 5 — Out-of-order retries

- **Scenario:** Retry attempts arrive after the original request succeeded.
- **Cause:** Network delay causes retry to arrive after original was processed.
- **Impact:** Duplicate processing if operation is not idempotent.
- **Detect:** Server-side logs showing duplicate processing with same request ID.
- **Prevent:** Implement server-side deduplication using idempotency keys with TTL.
- **Test:** Send request, delay response, retry; assert server deduplicates.

## 7. Common Mistakes and Anti-Patterns

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|------------------|
| **Retrying non-retryable errors** | 400/401/404 errors will never succeed on retry | Check error type before retrying |
| **No max attempt limit** | Can retry indefinitely on persistent failure | Always set max attempts |
| **Retrying without idempotency** | Non-idempotent operations cause duplicate side effects | Use idempotency keys for POST/PATCH |
| **Fixed delay for all retries** | Doesn't adapt to service recovery | Use exponential backoff |
| **No jitter** | All clients retry simultaneously → thundering herd | Always add jitter |
| **Retrying when circuit breaker is open** | Wastes resources on known-failing dependency | Check breaker state before retrying |
| **Ignoring Retry-After header** | Server tells client when to retry; ignoring causes premature retries | Respect Retry-After on 429/503 |

## 8. Performance and Scalability

### Cost model per retry

- **Delay calculation:** O(1) per attempt
- **Additional latency:** Sum of all retry delays
- **Memory per retry:** O(1) - attempt counter and last error

### Complexity recap

| Operation | Time complexity | Space complexity |
|-----------|----------------|------------------|
| Execute with retry | O(attempts × operation_time) | O(1) |
| Backoff calculation | O(1) per attempt | O(1) |
| Retryable check | O(1) | O(1) |

### Throughput and bottlenecks

- Retries reduce effective throughput (failed attempts consume resources)
- Retry storms can overwhelm downstream services
- Circuit breakers prevent retry storms by stopping calls to unhealthy dependencies

### Scaling strategies

1. **Client-side retries** — simplest, start here
2. **Gateway-level retries** — centralized, no app changes
3. **Retry budgets** — limit retry percentage per dependency
4. **Adaptive retries** — adjust retry policy based on observed error rates

### Benchmarking method

- Benchmark operation with and without retries
- Measure total time with different retry configurations
- Test retry storm scenario: many clients retrying simultaneously
- Verify circuit breaker prevents retry storm

## 9. Testing and Debugging

### Unit tests (no dependencies)

```go
func TestRetrySucceedsOnSecondAttempt(t *testing.T) {
    attempts := 0
    fn := func() error {
        attempts++
        if attempts == 1 {
            return errors.New("transient failure")
        }
        return nil
    }
    
    err := Retry(fn, DefaultConfig())
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if attempts != 2 {
        t.Fatalf("expected 2 attempts, got %d", attempts)
    }
}

func TestNoRetryOnNonRetryableError(t *testing.T) {
    attempts := 0
    fn := func() error {
        attempts++
        return &StatusError{StatusCode: 400, Retryable: false, Err: errors.New("bad request")}
    }
    
    err := Retry(fn, DefaultConfig())
    if err == nil {
        t.Fatal("expected error")
    }
    if attempts != 1 {
        t.Fatalf("expected 1 attempt, got %d", attempts)
    }
}
```

### Integration tests (real dependencies)

- Test with a real HTTP server that returns 503 on first attempt, 200 on second
- Verify retry succeeds
- Verify no retry on 400 errors

### Concurrency test

- Run N concurrent operations with retries against a flaky dependency
- Assert all operations either succeed or fail after max attempts
- Assert no goroutine leaks

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
- Test with cascading failures (dependency of dependency fails)

### Debugging toolkit

- Check retry metrics: `retry_attempts_total`, `retry_rate`
- Review retry logs for attempt number and error type
- Identify which dependencies have the highest retry rates
- Check circuit breaker state to see if retries are being bypassed

## 10. Follow-Up Interview Questions

### Level 1 — Fundamentals

1. What types of failures are suitable for retries?
2. What types of failures should NOT be retried?
3. What is the difference between fixed delay and exponential backoff?
4. What is jitter, and why is it important?
5. What is idempotency, and why does it matter for retries?

### Level 2 — Implementation

6. What is a retry budget, and why is it needed?
7. What HTTP status codes are typically retryable?
8. How do you implement exponential backoff with jitter?
9. How do you distinguish retryable from non-retryable errors?
10. How does a retry interact with a circuit breaker?

### Level 3 — Advanced Engineering

11. How do you prevent retry storms after a service outage?
12. What's the relationship between retries and idempotency keys?
13. How do you set appropriate max attempts for different dependencies?
14. How do you handle retries in a distributed transaction?
15. What happens when a retry arrives after the original request succeeded?

### Level 4 — Production Scenarios

16. Your service experiences a retry storm after an outage. How do you mitigate it?
17. A client retries a payment and gets charged twice. How do you fix this?
18. How do you coordinate retry policies between client, gateway, and backend?
19. What's the impact of retries on P99 latency?
20. How do you monitor retry rates across microservices?

### Level 5 — System Design

21. Design a retry strategy for a system with 50+ dependencies.
22. How do retries interact with timeouts, circuit breakers, and bulkheads?
23. How would you implement adaptive retries based on observed error rates?
24. How do you handle retries in asynchronous message-based systems?
25. When should you NOT use retries?

## 11. Scenario-Based Engineering Problems

1. **Retry Storm** — After a service outage, thousands of clients retry simultaneously when the service recovers. Diagnose: implement jitter, exponential backoff, and retry budgets.

2. **Duplicate Charges** — Your payment API retries failed charges, but customers are charged twice. Diagnose: implement idempotency keys to deduplicate payment requests.

3. **Infinite Retry Loop** — A client retries a request that always fails (e.g., invalid credentials). Diagnose: implement max attempt limits and distinguish retryable from non-retryable errors.

4. **Retry Latency Spikes** — Users experience high latency because retries add cumulative delay. Diagnose: reduce max attempts, use shorter base delays, implement circuit breakers.

5. **Out-of-Order Retries** — Retry attempts arrive after the original request succeeded. Diagnose: implement server-side deduplication using idempotency keys with TTL expiration.

## 12. Hands-On Exercises

### Beginner — Basic retry with fixed delay

Implement a Go function that retries a failed operation with fixed delay between attempts. Test with a mock that fails once then succeeds.

### Intermediate — Exponential backoff with jitter

Build a retry mechanism with exponential backoff and jitter. Verify that delays increase exponentially and jitter adds randomness.

### Advanced — Retry with circuit breaker integration

Build a retry wrapper that checks circuit breaker state before retrying. When the breaker is open, skip retries and return immediately.

### Solutions

#### Solution — Beginner

Loop with max attempts, sleep fixed delay between failures, return error when exhausted.

#### Solution — Intermediate (core assertions)

- Delay = baseDelay × 2^(attempt-1)
- Jitter = delay + random(0, delay/2)
- Verify delays are different on each call (jitter works)

#### Solution — Advanced (core structure)

- Check circuit breaker state before each attempt
- If breaker is open, return error without retrying
- Log breaker state when retry is skipped

## 13. Chapter Summary and Revision Notes

### Five key takeaways

1. Retries handle transient failures automatically without user intervention.
2. Only retry on retryable errors (network, 5xx, 429); never on 4xx client errors.
3. Always use idempotency keys for non-idempotent operations (payments, submissions).
4. Exponential backoff with jitter prevents retry storms.
5. Retries work with circuit breakers: stop retrying when breaker is open.

### Quick revision sheet

| Concept | Key point |
|---------|-----------|
| Transient failure | Temporary failure that may resolve on its own |
| Retryable error | Network timeout, 502/503/504, 429 |
| Non-retryable error | 400/401/403/404, business logic errors |
| Fixed delay | Same delay between every retry attempt |
| Exponential backoff | Delay doubles each attempt |
| Jitter | Randomness added to prevent thundering herd |
| Idempotency key | Unique key for deduplicating retries |
| Retry budget | Limit on percentage of requests that are retries |

### Essential terminology

- **Retry:** Automatically re-attempting a failed operation after a delay
- **Transient failure:** Temporary failure that may resolve on its own
- **Exponential backoff:** Delay increases exponentially with each retry attempt
- **Jitter:** Randomness added to retry delays to prevent thundering herd
- **Thundering herd:** Many clients retrying simultaneously, overwhelming the service
- **Idempotency:** Same request multiple times produces same result as once
- **Idempotency key:** Unique identifier clients send to allow server to deduplicate retries
- **Retry budget:** Limit on percentage of requests that can be retries

### Formulas and parameters

| Formula | Meaning |
|---------|---------|
| `delay = base × 2^(attempt-1)` | Exponential backoff delay |
| `delay_with_jitter = delay + random(0, delay/2)` | Delay with equal jitter |
| `retry_rate = retries / total_requests` | Retry rate for budget monitoring |

### Decision-making checklist

- [ ] Is the error retryable (network, 5xx, 429)?
- [ ] Is the operation idempotent or protected by idempotency key?
- [ ] Is there a max attempt limit?
- [ ] Is there jitter to prevent thundering herd?
- [ ] Is there a retry budget?
- [ ] Is circuit breaker checked before retrying?

### Flashcards

| Front | Back |
|-------|------|
| What is a retry? | Automatically re-attempting a failed operation after a delay |
| What is a transient failure? | Temporary failure that may resolve on its own |
| What is fixed delay retry? | Waiting the same interval between each retry attempt |
| What is exponential backoff? | Delay increases exponentially with each retry attempt |
| What is jitter? | Randomness added to retry delays to prevent thundering herd |
| What is thundering herd? | Many clients retrying simultaneously, overwhelming the service |
| What is idempotency? | Same request multiple times produces same result as once |
| Why is idempotency critical for retries? | Non-idempotent operations can cause duplicate side effects |
| What is an idempotency key? | Unique identifier clients send to allow server to deduplicate retries |
| What is a retry budget? | Limit on percentage of requests that can be retries |
| Name three retryable HTTP status codes | 502, 503, 504 |
| Name three non-retryable HTTP status codes | 400, 401, 404 |

### Three questions to verify genuine understanding

1. **Why should you never retry a 400 Bad Request error?** A 400 error means the request is malformed or invalid — retrying the same request will always produce the same error, wasting resources and delaying the real error response.

2. **What happens if you retry a non-idempotent operation without an idempotency key?** The operation may be executed multiple times, causing duplicate side effects like double charges or duplicate submissions.

3. **How does jitter prevent retry storms?** Without jitter, all clients retry at the same interval, creating a synchronized spike in load. Jitter spreads retries randomly over time, reducing peak load on the recovering service.

### Authoritative references and further reading

- Google SRE Book, Chapter 8: "Handling Overload" — https://sre.google/sre-book/handling-overload/
- AWS Architecture Blog: "Exponential Backoff And Jitter" — https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Resilience4j Retry — https://resilience4j.readme.io/docs/retry
- Go resiliency library — https://github.com/eapache/go-resiliency
5. **Out-of-Order Retries** — Retry attempts arrive after the original request succeeded. Diagnose: implement server-side deduplication using idempotency keys with TTL expiration.
