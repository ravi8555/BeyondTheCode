# CI/CD Test Cases - Summary Reference

## Test Case Categories Created

| File | Category | Key Tests |
|------|----------|-----------|
| `06-ci-cd-test-actions.md` | GitHub Actions | CI Pipeline Basic Functionality, Pull Request Workflow Triggers |
| `06-ci-cd-test-docker.md` | Docker Build | Multi-stage Docker Build, Dockerfile Linting |
| `06-ci-cd-test-k8s.md` | Kubernetes | Deployment Manifest Validation, Readiness and Liveness Probes |
| `06-ci-cd-test-argocd.md` | Argo CD | Application Manifest, Sync Policy Configuration |
| `06-ci-cd-test-security.md` | Security | Secret Management, Image Vulnerability Scanning |
| `06-ci-cd-test-performance.md` | Performance | Pipeline Performance, Load Test Through Pipeline |

## Test Execution Overview

```bash
# GitHub Actions Tests
# Run: GitHub Actions UI or workflow_dispatch

# Docker Build Tests
hadolint Dockerfile
docker build -t test-image:latest .

# Kubernetes Tests
kubectl apply --dry-run=client -f k8s/
kubectl get deployment -o yaml

# Argo CD Tests
kubectl apply --dry-run=client -f argocd/application.yaml

# Security Tests
trivy image myapp:latest
# Check for hardcoded secrets

# Performance Tests
# Measure pipeline execution time
# Run k6 load tests
```

## Reference: Chapter 01 — Rate Limiting Test Cases

The rate limiting chapter (Chapter 01) includes the following test case categories referenced in the text:

### Test Case Categories from Chapter 01:

1. **Window-boundary burst tests** — Fixed window rate limiters allowing double bursts at window boundaries
   - **Test:** Integration test with synthetic `now` values at `windowStart−1ms` and `windowStart`
   - **Assertion:** Weighted estimate blocks the double burst

2. **Per-instance counter multiplication tests** — Multi-node deployments with in-memory counters
   - **Test:** k6 load test through LB with 2+ instances
   - **Assertion:** Aggregate deny count ≤ limit (with declared tolerance)

3. **Non-atomic check-then-increment race conditions** — Custom limiters with TOCTOU vulnerabilities
   - **Test:** Concurrency test (`Promise.all` of N+1 requests at limit N)
   - **Assertion:** Fails nondeterministically under concurrent access

4. **Rate limiter math regression tests** — General math validation
   - **Test:** Load test with deny-rate assertion in CI (k6, Section 9)
   - **Assertion:** Regressions show up as throughput cliffs

5. **Chaos drills** — Redis failure simulation
   - **Test:** Kill Redis in staging, verify route policies
   - **Assertion:** Each route's declared policy actually happens

### Integration with CI/CD:

- **Chapter 01 (Line 706):** "Load test in CI (k6, Section 9) with a deny-rate assertion — regressions in limiter math show up as throughput cliffs."
- **Chapter 01 (Line 707):** "Chaos drill (→ Chapter 87): kill Redis in staging and verify each route's declared policy actually happens."
- **Chapter 01 (Line 705):** "Contract test per limiter implementation: 'never allows more than limit within a simulated window; always sets Retry-After on deny.'"