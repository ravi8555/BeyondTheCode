# Chapter 10 — Resilience Patterns

## Learning Objectives

- Implement circuit breakers to prevent cascading failures
- Configure retries, timeouts, and fallback strategies
- Apply bulkheads and rate limiting for resource protection
- Implement request validation and transformation patterns
- Design graceful degradation strategies
- Test resilience patterns with chaos engineering
- Evaluate resilience patterns against anti-patterns
- Integrate resilience patterns with service mesh capabilities

## 10.2 Circuit Breaker Pattern

### Circuit Breaker States

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open: failure_threshold_reached
    Open --> Half-Open: cooldown_timer_expired
    Half-Open --> Closed: success_on_next_call
    Half-Open --> Open: failure_on_next_call
    Open --> Open: force_remain_open
```

### Circuit Breaker Configuration

```yaml
# Istio DestinationRule circuit breaker settings
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: resilient-service-dr
spec:
  host: resilient-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 500
    timeout: 2s
    maxRetries: 3
    retryPolicy:
      retryOn: ["connect-failure", "refused-stream", "transport-failure"]
      perRetryTimeout: 1s
```

## 10.3 Retry and Timeout Patterns

### Retry Configuration

```yaml
# Istio retry settings via DestinationRule
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: retry-config
spec:
  host: target-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 1000
    timeout: 5s
    maxRetries: 3
    retryPolicy:
      retryOn: ["connect-failure", "refused-stream", "transient-error",
                "gateway-error", "available"]
      perRetryTimeout: 500ms
      httpsMaxRetries: 2
```

### Timeout boundaries

```yaml
## 10.4 Bulkhead and Rate Limiting

### Bulkhead Pattern

Isolate resources so that failure in one service doesn't deplete shared resources:

```yaml
# Connection pool isolation
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: bulkhead-dr
spec:
  host: shared-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 50  # Bulkhead for this service
      http:
        maxRequestsPerConnection: 100
    timeout: 2s
```

### Rate Limiting

```yaml
# Rate limiting via Envoy filter or middleware
# Example: limit to 100 requests per minute per client
apiVersion: networking.istio.io/v1beta1
kind: EnvoyFilter
metadata:
  name: rate-limit
  namespace: default
spec:
  workloadSelector:
    labels:
      app: my-service
  configPatches:
    - applyTo: HTTP_FILTER
      name: envoyhttp rate_limiting
      match:
        context: SIDECAR_INBOUND
        listener:
          filterChain:
            filter:
              name:envoy.filters.http.router
          name: rate_limiting
      patch:
        after: ""
        value:
          "@type": type.googleapis.com/envoy.extensions.filters.http.rate_limiting.v3.RateLimiting
          domain: "my-service.default.svc.cluster.local"
          stage: "REQUEST"
          rate_limit_service:
## 10.5 Fallback and Degradation Strategies

### Fallback Response

```yaml
# Fallback via VirtualService
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: service-fallback
spec:
  hosts:
    - my-service.default.svc.cluster.local
  http:
    - match:
        - headers:
            x-fallback-enable: "true"
      route:
        - destination.subset: fallback
    - route:
        - destination.subset: v1
        - weight: 90
        - destination.subset: fallback
        - weight: 10
```

### Graceful Degradation

```yaml
# Partial functionality when dependencies fail
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: degraded-mode
spec:
  hosts:
    - my-service.default.svc.cluster.local
  http:
    - condition:
        - key: "degraded-mode"
          value: "true"
      route:
        - destination.subset: degraded
    - route:
        - destination.subset: v1
## 10.6 Chaos Engineering for Resilience

### Failure Injection

```yaml
# Istio VirtualService for fault injection
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: fault-injection
spec:
  hosts:
    - my-service.default.svc.cluster.local
  http:
    - fault:
        abort:
          percentage: 20
          httpStatus: 500
      route:
        - destination.subset: fault-injection
    - route:
        - destination.subset: v1
        - weight: 80
        - destination.subset: fault-injection
        - weight: 20
```

### Latency Injection

```yaml
# Latency injection pattern
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: latency-injection
spec:
  hosts:
    - my-service.default.svc.cluster.local
  http:
    - latency:
        fixed: 2s  # Add 2s delay
      route:
        - destination.subset: latency-injection
    - route:
        - destination.subset: v1
## 10.7 Hands-On Exercises

### Beginner: Configure Basic Circuit Breaker

1. Create a DestinationRule with timeout and retry settings
2. Deploy a test service and observe circuit breaker behavior
3. Generate failures and verify circuit opens
4. Verify circuit closes after cool-down period

**Success criteria:** Circuit breaker trips on repeated failures, remains open during cool-down, closes after successful probe calls.

### Intermediate: Bulkhead and Rate Limiting

1. Configure bulkhead connection limits per service
2. Set up rate limiting via Envoy filter
3. Test that one service's overload doesn't affect others
4. Verify rate limit responses (429 Too Many Requests)

**Success criteria:** Connection limits enforced per service, rate limiting returns 429, isolation between services works.

## 10.8 Chapter Summary

### Key Takeaways (5 points)

1. **Resilience patterns prevent cascading failures** in microservice architectures
2. **Circuit breakers** have three states: Closed, Open, Half-Open
3. **Retries** should be limited with per-retry timeouts to avoid thundering herd
4. **Bulkheads** isolate resource consumption per service
5. **Fallbacks** provide graceful degradation when primary paths fail

### Resilience Pattern Quick Reference

| Pattern | Key Parameter | Typical Value |
|---------|--------------|---------------|
| **Circuit Breaker** | failure threshold | 50% over 10-30 seconds |
| **Circuit Breaker** | cool-down period | 30-60 seconds |
| **Retry** | max retries | 3-5 |
| **Retry** | per-retry timeout | 100ms-1s |
| **Timeout** | global request timeout | 1-5 seconds |
| **Bulkhead** | max connections per service | 50-500 |
| **Rate Limiting** | requests per minute | 10-1000 per client |
| **Fallback** | alternate response | service-specific |

### Comprehension Questions

1. What's the difference between a retry and a circuit breaker?
2. When should you use a bulkhead pattern vs. a circuit breaker?
3. What's the purpose of the half-open state in a circuit breaker?
4. How do you configure fallbacks in a service mesh?
5. What is chaos engineering and how does it relate to resilience patterns?

### Revision Sheet (Flashcards)

| Front | Back |
|-------|------|
| What pattern stops cascading failures by opening the circuit? | Circuit Breaker |
| What are the three states of a circuit breaker? | Closed, Open, Half-Open |
| What does a bulkhead pattern isolate? | Resource consumption per service |
| What's the typical retry timeout per attempt? | 100ms-1s |
| What's the typical circuit breaker failure threshold? | 50% over 10-30 seconds |
| What does a fallback provide when the primary path fails? | Alternate response behavior |
| What is the typical global request timeout? | 1-5 seconds |
| What does rate limiting protect against? | Overload from excessive requests |
| What is the half-open state probe testing? | Whether the failure has been resolved |
| What is the typical circuit breaker cool-down period? | 30-60 seconds |

### Engineering Problems (Solve These)

1. **Circuit breaker trips too quickly** — Your circuit breaker opens after just a few failures. Diagnose: increase failure threshold, add cool-down period, distinguish between transient and permanent failures.

2. **Retries cause thundering herd** — After a service recovers, too many retried requests arrive simultaneously. Diagnose: add jitter to retry backoff, limit concurrent retries, use per-retry timeouts.

3. **Bulkhead too restrictive** — Your bulkhead limits are so tight that legitimate traffic is rejected. Diagnose: analyze actual traffic patterns, increase connection limits gradually, prioritize critical traffic.

4. **Fallback not triggering** — Your circuit opens but fallback responses aren't served. Diagnose: verify VirtualService routing, check subset labels, confirm fallback destination exists and is healthy.

5. **Chaos experiments have no effect** — Fault injection and latency injection don't appear to affect service behavior. Diagnose: verify VirtualService is properly deployed, check that the subset is selected, ensure istioctl analyze passes, verify Envoy filter is applied.
### Advanced: Chaos Engineering Experiment

1. Set up fault injection (abort percentage) via VirtualService
2. Set up latency injection (fixed delay) via VirtualService
3. Measure impact on error rates and latency
4. Verify circuit breaker and retry behavior under chaos
5. Document findings and resilience improvements

**Success criteria:** Fault injection causes controlled failures, latency injection adds expected delay, resilience patterns respond correctly.
        - weight: 90
        - destination.subset: latency-injection
        - weight: 10
```
        - weight: 80
        - destination.subset: degraded
        - weight: 20
```
            name: "rate-limit-service"
            grpc:
              cluster: rate-limit-service
              timeout: 0.5s
```
# Global timeout configuration
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: timeout-config
spec:
  host: target-service
  trafficPolicy:
    timeout: 3s  # Global request timeout
    maxRetries: 2
    retryPolicy:
      perRetryTimeout: 1s
```