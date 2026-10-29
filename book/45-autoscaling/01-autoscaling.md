# Chapter 45 — Autoscaling

> **Part IV — Advanced Patterns**  
> **Prerequisites:** Chapter 29 (Read Replicas), Chapter 28 (Connection Pooling), Chapter 44 (Caching, Volumes, and Memory)  
> **FormForge context:** The course dashboard auto-scaling policy that lags 10 minutes behind demand — causing 30-second page load times during the midday peak.

## 1. Definition and Fundamentals

- **What the concept is:** Autoscaling is the automatic adjustment of compute resources (number of instances, CPU, memory, or database connections) in response to observed demand (load, traffic, queue depth, or latency). It is a self-tuning mechanism that keeps application performance within an SLA by scaling out (adding capacity) before demand exceeds current resources, and scaling in (removing capacity) when demand drops.
- **Why it exists / what problem it solves:** Fixed-capacity systems either over-provisioned (wasting money) or under-provisioned (causing outages). Autoscaling matches capacity to demand in near real-time: peak loads are handled by adding instances, off-peak loads are handled by removing them. The goal is to keep latency within a target, maintain availability, and optimize cost.
- **How it works internally (progressively deeper):** At the top level, a monitoring system (e.g., Prometheus, CloudWatch) observes metrics (CPU, memory, request rate, latency, queue length). Below that, a scaling policy (static, predictive, or reactive) calculates the desired capacity and triggers the cluster autoscaler (e.g., Kubernetes HPA, cloud auto-scaling groups). At the lowest level, the infrastructure provider provisions new compute instances (VMs, containers, or serverless functions), the new instances register with the load balancer, and the old instances are drained. The entire cycle runs in minutes (scaling out) or seconds (scaling in).
- **Where it fits in a typical application architecture:** Autoscaling sits at the infrastructure layer, above the application. It is triggered by metrics that the application exposes (custom metrics like queue depth, session count) or that the platform exposes (CPU, memory, request rate). The autoscaler is the last line of defense before capacity becomes insufficient; it must be configured with scale-up (proactive) and scale-down (conservative) policies to avoid thrashing.
- **A real-world analogy:** A restaurant that opens more tables during a rush. The restaurant knows it can handle 50 customers comfortably. When the line grows to 80, the manager opens 20 more tables (scales out). After the rush, the manager closes the extra tables (scales in). Autoscaling is the manager: it opens capacity before the line gets too long, and closes it when demand drops.
- **A production example:** At FormForge, the course dashboard's pod is CPU-bound during peak hours. The current deployment has 3 replicas; during the midday peak, CPU is at 80% and p95 latency is 3s. The team configures an HPA with a CPU target of 70% and a min of 3, max of 20. The HPA scales out to 12 replicas in 2 minutes; p95 latency drops to 400ms. After the peak, the HPA scales in to 5 replicas; cost drops by 70%.
- **When it is necessary / when it is unnecessary:** Necessary for systems with highly variable, unpredictable load (web services, API gateways, message queues). Unnecessary for systems with constant, predictable load (internal batch jobs, single-tenant services) where fixed capacity is cheaper and simpler.

## 2. Types, Variants, and Classifications

- **Horizontal autoscaling (HPA):** Adds or removes instances (replicas) of the application. Used for stateless, horizontally scalable services.
- **Vertical autoscaling (VPA):** Increases or decreases the resources (CPU, memory) allocated to each instance. Used for stateful services where horizontal scaling is not possible (e.g., databases).
- **Predictive autoscaling:** Uses historical data and machine learning to forecast demand and scale proactively (before the load arrives).
- **Reactive autoscaling:** Responds to current load metrics (CPU, memory, request rate) with a delay (the scaling cycle time).
- **Custom metrics autoscaling:** Scales based on application-specific metrics (queue depth, active sessions, request latency) rather than CPU/memory.
- **Comparison table:**

| Type | Unit of scaling | Typical use case | Catch |
|---|---|---|---|
| Horizontal (HPA) | Replicas | Stateless services, web apps | Throttling, scheduling latency |
| Vertical (VPA) | CPU/memory per instance | Stateful, non-scalable services | Many databases don't support live resize |
| Predictive | Replicas (forecast) | Traffic with seasonal patterns | Model accuracy, cold start |
| Reactive | Replicas (current load) | Most web services | Lag between load and reaction |

**Decision guide:** Choose horizontal autoscaling for stateless, horizontally scalable services (most web apps). Choose vertical for databases or stateful services where horizontal scaling is not possible. Use predictive if demand is seasonal and you can forecast; otherwise use reactive.
## 3. Internal Working and Architecture

- **Step-by-step execution flow:**
  1. The monitoring system collects metrics (CPU, memory, request rate, queue depth) from the application and infrastructure.
  2. The scaling policy evaluates the metrics against thresholds (e.g., CPU > 70% for 2 minutes).
  3. The policy calculates the desired capacity (e.g., 12 replicas) using a formula (e.g., `desired = ceil(current * (metric / target))`).
  4. The autoscaler (e.g., Kubernetes HPA) sends a scale request to the cluster orchestrator (e.g., Kubernetes kube-apiserver).
  5. The orchestrator provisions new instances (pods) or IP addresses and updates the load balancer.
  6. The new instances start, register with the load balancer, and serve traffic.
  7. The old instances are drained gradually to avoid dropping in-flight requests.
## 11. Scenario-Based Engineering Problems

- **Scenario 1:** The application is CPU-bound at 80%. The autoscaler scales from 3 to 20 replicas, but the p95 latency remains at 800ms (the replicas are still CPU-bound). The team thinks scaling fixed the problem.
  - *Problem statement:* The autoscaler scaled but the latency didn't improve; the application is CPU-bound per request.
  - *Constraints:* p95 must be <500ms.
  - *Options:* (a) Optimize the code (reduce CPU per request); (b) Add more replicas (up to max); (c) Use a faster database/query.
  - *Recommended solution:* (a) Optimize the code; the CPU per request is the bottleneck. Scaling only helps if the overhead is parallelism, not per-request CPU.
  - *Alternatives/trade-offs:* (b) doesn't fix the per-request CPU; (c) could help but the problem is the app's code.
  - *Failure scenarios:* The team scales to max and still sees 800ms; the cost increases without improvement.
  - *Testing strategy:* Profile the application; measure CPU per request before and after optimization.

## 12. Hands-On Exercises

- **Beginner:** Implement a simple HPA in Kubernetes; verify it scales from 3 to 10 replicas under load.
- **Intermediate:** Add a custom metric (queue depth) to the HPA; verify it scales based on the metric.
- **Advanced:** Implement a scale-up bias (pre-warm instances 5 minutes before the known peak).
- **Solutions:** Solutions are in `book/code/45-autoscaling/solutions/` (to be added).

## 13. Chapter Summary and Revision Notes

- **Five key takeaways:**
  1. Autoscaling automatically adjusts capacity to demand, keeping latency within an SLA.
  2. Horizontal scaling (HPA) adds instances; vertical (VPA) increases resources per instance.
  3. Use scale-up bias (fast) and scale-down bias (conservative) to avoid thrashing.
  4. Monitor p95 latency and CPU per replica; scaling only helps if the bottleneck is parallelism.
  5. Set hard limits (`maxReplicas`, budget alerts) to prevent cost overruns.
- **Quick revision sheet:** HPA = horizontal; VPA = vertical; scale-up bias = fast, scale-down bias = slow; CPU is a lagging indicator; custom metrics for application signals.
- **Essential terminology:** Autoscaling, HPA, VPA, scale-up bias, scale-down bias, hysteresis, predictive scaling, custom metrics, load testing, cost budget.
- **Important formulas/configuration:** `desired = ceil(current * (metric / target))`; `scaleUpDelay = 30s`; `scaleDownDelay = 300s`; `maxReplicas = 20`; `targetCPUUtilizationPercentage = 70`.
- **Decision-making checklist:** "Is the load variable? Use HPA. Is the workload CPU-bound? Optimize code. Can the database scale? Use VPA or replicas. Is demand predictable? Use predictive scaling."
- **Five flashcards:** What is autoscaling? → Automatic capacity adjustment to demand. What is horizontal scaling? → Adding instances. What is vertical scaling? → Increasing resources per instance. How to avoid thrashing? → Scale-up bias + scale-down bias. What is the limit of autoscaling? → It can't fix a CPU-bound bottleneck; optimize code first.
- **Three comprehension-verification questions:**
  1. How would you size `maxReplicas` for a system with 5000 r/s?
  2. How would you handle a cost overrun from autoscaling?
  3. How would you tune `scaleUpDelay` and `scaleDownDelay`?
- **Authoritative references and further reading:** Kubernetes HPA documentation; Prometheus documentation; "The DevOps Handbook" (Ch. 8) on autoscaling; "Designing Data-Intensive Applications" (Ch. 8) on scaling.

---

> **Cross-Reference:** See → Chapter 29 (Read Replicas) for database scaling, → Chapter 28 (Connection Pooling) for pool sizing, and → Chapter 44 (Caching, Volumes, and Memory) for caching to reduce load.

---

> **FormForge context:** The course dashboard's HPA was initially set to `minReplicas: 3`, `maxReplicas: 10`, `targetCPUUtilizationPercentage: 80`. The team found that during the midday peak, CPU was at 95% and p95 latency was 3s. They adjusted to `minReplicas: 3`, `maxReplicas: 20`, `targetCPUUtilizationPercentage: 70`, and added a scale-up bias of 5 minutes before 12pm. During the peak, the HPA scaled to 12 replicas and p95 latency dropped to 400ms.

---

## Writing Guidance per Section

**Section 1** must be readable by someone who has never heard of the topic. Delay jargon; introduce it with its purpose attached ("an *autoscaling*..."). **Section 2** is where interviews are won or lost. Tables must compare *along dimensions that drive decisions* (unit of scaling, typical use case, catch) — not vague feature checklists. **Section 3** should leave the reader able to mentally step through the mechanism. If a diagram would help and the reader would benefit, draw it. Never describe a flow in prose that a 6-line sequence diagram would make obvious.

**Section 4** code must be internally consistent with the FormForge stack and with the `code/` directory. Label anything non-runnable as illustrative.

**Sections 6–7** are the anti-fragility core. Prefer failure stories that chain into other chapters (a rate-limit failure that becomes a retry storm that becomes a deadlock) over isolated trivia.

**Section 10** questions must test *decision-making*, not recall.

**Section 12** exercises must have checkable acceptance criteria.

## Cross-Reference Format

Use `→ Chapter NN (Topic Name)` inline. First mention in a chapter gets a one-line summary of why the link matters; later mentions can be bare. Example:

> Autoscaling adds capacity, but caching reduces it. See → Chapter 44 (Caching, Volumes, and Memory) for how caching can reduce the need for scaling.

---

> **End of Chapter 45.**

  8. The monitoring system verifies the new metrics; if they remain high, the policy scales further.

```mermaid
sequenceDiagram
    participant Monitor as Monitoring
    participant Policy as Scaling Policy
    participant Autoscaler as Autoscaler (HPA)
    participant Orchestrator as Orchestrator (K8s)
    participant LB as Load Balancer
    participant App as Application

    Monitor->>Policy: Collect metrics (CPU, latency)
    Policy->>Policy: Evaluate thresholds; calculate desired capacity
    Policy->>Autoscaler: Request scale-out (12 replicas)
    Autoscaler->>Orchestrator: Create 9 new pods
    Orchestrator->>LB: Register new pods
    Orchestrator-->>App: New replicas start
    App->>Monitor: Increased capacity reduces CPU
    Monitor->>Policy: Re-evaluate; scale-in if load drops
```

- **Failure paths drawn explicitly:**
  - **Scaling lag:** The demand grows faster than the autoscaler can provision. During the lag, instances are overcommitted. Mitigation: scale-up bias (pre-warm instances before threshold), max allowed replicas, and circuit breaker.
  - **Throttling:** The application is CPU-bound; new replicas are created, but each is still CPU-bound because the bottleneck is not parallelism but CPU per request. Mitigation: scale-down bias, or optimize the code instead of scaling.
  - **Thrash:** The autoscaler oscillates (scale out, then in, then out) due to noisy metrics or too frequent scaling. Mitigation: scale-down bias (longer wait time, minimum scale), hysteresis (scale-out at 70%, scale-in at 40%).
  - **Cold start:** New instances take time to be ready (container image pull, process start). Mitigation: pre-warm instances, use a warm-up period before counting in the autoscaler.
- **Algorithms and complexity:**
  - Scale-up: desired = ceil(current * (observed / target)) with scale-up bias. Complexity O(1).
  - Scale-down: desired = max(min, desired - (scaleOutRate * seconds)) with scale-down bias. Complexity O(1).
  - Scaling cycle: minutes for scale-out (provisioning), seconds for scale-in.
- **Important configuration parameters with safe defaults:**
  - `minReplicas` = 2 (minimum number of instances)
  - `maxReplicas` = 20 (maximum number of instances)
  - `targetCPUUtilizationPercentage` = 70 (CPU utilization target for scale-out)
  - `scaleUpDelay` = 30s (how long to keep the scale-out before scaling again)
  - `scaleDownDelay` = 300s (how long to keep the scale-in after scaling down)
  - `scaleDownStabilizationWindow` = 10m (how long to wait for load to drop before scaling in)

---

## 4. Practical Implementation

- **Scenario → Requirements (functional + non-functional):**
  - *Scenario:* The course dashboard sees 500 requests/s at 8am, 5000 requests/s at 12pm, and 200 requests/s at 2am.
  - *Functional requirements:* p95 latency < 500ms at any load; no more than 20 replicas at any time.
  - *Non-functional requirements:* Cost: no more than 2x the baseline cost; no manual intervention during the day.

- **Technology stack:** Kubernetes (HPA), Prometheus (metrics), Grafana (alerting), Terraform (infrastructure).

- **Project structure:**
  ```
  book/code/45-autoscaling/
  ├── config/
  │   ├── k8s-hpa.yaml
  │   ├── prometheus-rules.yaml
  │   └── autoscaling-policy.yaml
  ├── terraform/
  │   ├── main.tf
  │   └── variables.tf
  └── README.md
  ```

