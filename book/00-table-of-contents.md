# Table of Contents

111 chapters across 13 parts. Chapter numbers are global and permanent; filenames are `NN-topic-name.md` inside each part folder.

## Front Matter

- [Preface](00-preface.md)
- [Table of Contents](00-table-of-contents.md) (this file)
- [Prerequisite Map and Study Roadmap](00-prerequisite-map.md)
- [Running Application Architecture Overview](00-architecture-overview.md)
- [Chapter Template](00-chapter-template.md)
- [Implementation and Documentation Standards](00-standards.md)
- [Progress Tracker](00-progress-tracker.md)

## Part I — Traffic Management and Deployment (Chapters 01–14)

*Learning objectives: protect services from overload, route and shape traffic, deliver code safely, and make unreliable networks usable.*

- [Chapter 01 — Rate Limiting](01-traffic-management/01-rate-limiting.md) ✍
- [Chapter 02 — Caching](01-traffic-management/02-caching.md)
- [Chapter 03 — Load Balancing](01-traffic-management/03-load-balancing.md)
- [Chapter 04 — Reverse Proxies](01-traffic-management/04-reverse-proxies.md)
- [Chapter 05 — API Gateways](01-traffic-management/05-api-gateways.md) ✍
- [Chapter 06 — CI/CD](01-traffic-management/06-cicd.md)
- [Chapter 07 — Docker](01-traffic-management/07-docker.md)
- [Chapter 08 — Kubernetes](01-traffic-management/08-kubernetes.md)
- [Chapter 09 — Service Discovery](01-traffic-management/09-service-discovery.md)
- [Chapter 10 — Circuit Breakers](01-traffic-management/10-circuit-breakers.md)
- [Chapter 11 — Timeouts](01-traffic-management/11-timeouts.md)
- [Chapter 12 — Retries](01-traffic-management/12-retries.md)
- [Chapter 13 — Exponential Backoff](01-traffic-management/13-exponential-backoff.md)
- [Chapter 14 — Idempotency](01-traffic-management/14-idempotency.md)

## Part II — Asynchronous and Distributed Workflows (Chapters 15–24)

*Learning objectives: decouple producers from consumers, survive partial failure in workflows, and choose the right communication model.*

- [Chapter 15 — Message Queues](02-asynchronous-systems/15-message-queues.md)
- [Chapter 16 — Pub/Sub](02-asynchronous-systems/16-pubsub.md)
- [Chapter 17 — Event-Driven Architecture](02-asynchronous-systems/17-event-driven-architecture.md)
- [Chapter 18 — Distributed Transactions](02-asynchronous-systems/18-distributed-transactions.md)
- [Chapter 19 — Saga Pattern](02-asynchronous-systems/19-saga-pattern.md)
- [Chapter 20 — Dead Letter Queues](02-asynchronous-systems/20-dead-letter-queues.md)
- [Chapter 21 — Cron Jobs](02-asynchronous-systems/21-cron-jobs.md)
- [Chapter 22 — WebSockets](02-asynchronous-systems/22-websockets.md)
- [Chapter 23 — Long Polling](02-asynchronous-systems/23-long-polling.md)
- [Chapter 24 — Server-Sent Events](02-asynchronous-systems/24-server-sent-events.md)

## Part III — Database Engineering (Chapters 25–32)

*Learning objectives: make the database fast and safe under load — indexes, query plans, pooling, and the scaling ladder from replicas to shards.*

- [Chapter 25 — Database Indexing](03-database-engineering/25-database-indexing.md)
- [Chapter 26 — Query Optimization](03-database-engineering/26-query-optimization.md)
- [Chapter 27 — N+1 Queries](03-database-engineering/27-n-plus-1-queries.md)
- [Chapter 28 — Connection Pooling](03-database-engineering/28-connection-pooling.md)
- [Chapter 29 — Read Replicas](03-database-engineering/29-read-replicas.md)
- [Chapter 30 — Sharding](03-database-engineering/30-sharding.md)
- [Chapter 31 — Partitioning](03-database-engineering/31-partitioning.md)
- [Chapter 32 — Replication](03-database-engineering/32-replication.md)

## Part IV — Distributed Systems and Concurrency (Chapters 33–44)

*Learning objectives: reason about correctness when many processes share state — coordination, consistency, and classic concurrency failures.*

- [Chapter 33 — Leader Election](04-distributed-systems/33-leader-election.md)
- [Chapter 34 — CAP Theorem](04-distributed-systems/34-cap-theorem.md)
- [Chapter 35 — Eventual Consistency](04-distributed-systems/35-eventual-consistency.md)
- [Chapter 36 — Optimistic Locking](04-distributed-systems/36-optimistic-locking.md)
- [Chapter 37 — Pessimistic Locking](04-distributed-systems/37-pessimistic-locking.md)
- [Chapter 38 — Distributed Locks](04-distributed-systems/38-distributed-locks.md)
- [Chapter 39 — Race Conditions](04-distributed-systems/39-race-conditions.md)
- [Chapter 40 — Deadlocks](04-distributed-systems/40-deadlocks.md)
- [Chapter 41 — Memory Leaks](04-distributed-systems/41-memory-leaks.md)
- [Chapter 42 — Garbage Collection](04-distributed-systems/42-garbage-collection.md)
- [Chapter 43 — Thread Safety](04-distributed-systems/43-thread-safety.md)
- [Chapter 44 — Backpressure](04-distributed-systems/44-backpressure.md)

## Part V — Scaling and Caching Strategies (Chapters 45–50)

*Learning objectives: add capacity the right way and keep cached data honest.*

- [Chapter 45 — Autoscaling](05-scaling-and-caching/45-autoscaling.md)
- [Chapter 46 — Horizontal Scaling](05-scaling-and-caching/46-horizontal-scaling.md)
- [Chapter 47 — Vertical Scaling](05-scaling-and-caching/47-vertical-scaling.md)
- [Chapter 48 — CDN](05-scaling-and-caching/48-cdn.md)
- [Chapter 49 — Edge Caching](05-scaling-and-caching/49-edge-caching.md)
- [Chapter 50 — Cache Invalidation](05-scaling-and-caching/50-cache-invalidation.md)

## Part VI — Deployment Strategies (Chapters 51–57)

*Learning objectives: ship changes continuously without breaking users, and detect breakage fast when it happens.*

- [Chapter 51 — Feature Flags](06-deployment-strategies/51-feature-flags.md)
- [Chapter 52 — Blue-Green Deployment](06-deployment-strategies/52-blue-green-deployment.md)
- [Chapter 53 — Canary Releases](06-deployment-strategies/53-canary-releases.md)
- [Chapter 54 — Rolling Deployments](06-deployment-strategies/54-rolling-deployments.md)
- [Chapter 55 — Rollbacks](06-deployment-strategies/55-rollbacks.md)
- [Chapter 56 — Health Checks](06-deployment-strategies/56-health-checks.md)
- [Chapter 57 — Liveness & Readiness Probes](06-deployment-strategies/57-liveness-and-readiness-probes.md)

## Part VII — Observability and Reliability (Chapters 58–66)

*Learning objectives: instrument a system so strangers can debug it, define what "reliable" means numerically, and manage reliability as a budget.*

- [Chapter 58 — Monitoring](07-observability/58-monitoring.md)
- [Chapter 59 — Logging](07-observability/59-logging.md)
- [Chapter 60 — Distributed Tracing](07-observability/60-distributed-tracing.md)
- [Chapter 61 — Metrics](07-observability/61-metrics.md)
- [Chapter 62 — Alerts](07-observability/62-alerts.md)
- [Chapter 63 — SLOs](07-observability/63-slos.md)
- [Chapter 64 — SLIs](07-observability/64-slis.md)
- [Chapter 65 — Error Budgets](07-observability/65-error-budgets.md)
- [Chapter 66 — Observability](07-observability/66-observability.md)

## Part VIII — Security and Identity (Chapters 67–80)

*Learning objectives: control who can do what, protect data in motion and at rest, and defend against the OWASP-style attack surface a real API exposes.*

- [Chapter 67 — Secrets Management](08-security/67-secrets-management.md)
- [Chapter 68 — IAM](08-security/68-iam.md)
- [Chapter 69 — OAuth](08-security/69-oauth.md)
- [Chapter 70 — JWT Rotation](08-security/70-jwt-rotation.md)
- [Chapter 71 — TLS](08-security/71-tls.md)
- [Chapter 72 — Encryption at Rest](08-security/72-encryption-at-rest.md)
- [Chapter 73 — Encryption in Transit](08-security/73-encryption-in-transit.md)
- [Chapter 74 — WAF](08-security/74-waf.md)
- [Chapter 75 — DDoS Protection](08-security/75-ddos-protection.md)
- [Chapter 76 — CORS](08-security/76-cors.md)
- [Chapter 77 — CSRF](08-security/77-csrf.md)
- [Chapter 78 — SQL Injection](08-security/78-sql-injection.md)
- [Chapter 79 — XSS](08-security/79-xss.md)
- [Chapter 80 — SSRF](08-security/80-ssrf.md)

## Part IX — Data Management and Disaster Recovery (Chapters 81–88)

*Learning objectives: change schemas without downtime, and answer "the region is gone — now what?" with a plan you have already tested.*

- [Chapter 81 — Database Migrations](09-data-management-and-recovery/81-database-migrations.md)
- [Chapter 82 — Schema Versioning](09-data-management-and-recovery/82-schema-versioning.md)
- [Chapter 83 — Disaster Recovery](09-data-management-and-recovery/83-disaster-recovery.md)
- [Chapter 84 — Backups](09-data-management-and-recovery/84-backups.md)
- [Chapter 85 — Failover](09-data-management-and-recovery/85-failover.md)
- [Chapter 86 — Multi-Region Deployment](09-data-management-and-recovery/86-multi-region-deployment.md)
- [Chapter 87 — Chaos Engineering](09-data-management-and-recovery/87-chaos-engineering.md)
- [Chapter 88 — Cost Optimization](09-data-management-and-recovery/88-cost-optimization.md)

## Part X — Cloud and Performance Engineering (Chapters 89–96)

*Learning objectives: understand serverless economics and latency anatomy — from average to P99 — and the distributed-systems pathologies that make them worse.*

- [Chapter 89 — Cold Starts](10-cloud-and-performance/89-cold-starts.md)
- [Chapter 90 — Serverless Limits](10-cloud-and-performance/90-serverless-limits.md)
- [Chapter 91 — Latency](10-cloud-and-performance/91-latency.md)
- [Chapter 92 — Throughput](10-cloud-and-performance/92-throughput.md)
- [Chapter 93 — P99 Latency](10-cloud-and-performance/93-p99-latency.md)
- [Chapter 94 — Tail Latency](10-cloud-and-performance/94-tail-latency.md)
- [Chapter 95 — Network Partitions](10-cloud-and-performance/95-network-partitions.md)
- [Chapter 96 — Clock Skew](10-cloud-and-performance/96-clock-skew.md)

## Part XI — Networking and API Communication (Chapters 97–103)

*Learning objectives: know what happens between two sockets, choose the right protocol and communication style, and version an API that other teams depend on.*

- [Chapter 97 — DNS](11-networking-and-apis/97-dns.md)
- [Chapter 98 — TCP vs UDP](11-networking-and-apis/98-tcp-vs-udp.md)
- [Chapter 99 — HTTP/2 & HTTP/3](11-networking-and-apis/99-http2-and-http3.md)
- [Chapter 100 — gRPC](11-networking-and-apis/100-grpc.md)
- [Chapter 101 — Webhooks](11-networking-and-apis/101-webhooks.md)
- [Chapter 102 — API Versioning](11-networking-and-apis/102-api-versioning.md)
- [Chapter 103 — Semantic Versioning](11-networking-and-apis/103-semantic-versioning.md)

## Part XII — Infrastructure and Software Delivery (Chapters 104–108)

*Learning objectives: make infrastructure reproducible, reviewable, and fast to build — and keep dependency upgrades from becoming archaeology.*

- [Chapter 104 — Infrastructure as Code](12-infrastructure-and-delivery/104-infrastructure-as-code.md)
- [Chapter 105 — Terraform](12-infrastructure-and-delivery/105-terraform.md)
- [Chapter 106 — Helm Charts](12-infrastructure-and-delivery/106-helm-charts.md)
- [Chapter 107 — Build Caching](12-infrastructure-and-delivery/107-build-caching.md)
- [Chapter 108 — Dependency Hell](12-infrastructure-and-delivery/108-dependency-hell.md)

## Part XIII — Production Operations (Chapters 109–111)

*Learning objectives: operate software under pressure — detect, respond, recover, learn, and improve the organizational system around outages.*

- [Chapter 109 — Production Incidents](13-production-operations/109-production-incidents.md)
- [Chapter 110 — On-Call](13-production-operations/110-on-call.md)
- [Chapter 111 — Postmortems](13-production-operations/111-postmortems.md)

## Back Matter

- [Glossary](glossary.md)
- [Consolidated Interview Question Index](interview-question-index.md)
- [References](references.md)
- [Progress Tracker](00-progress-tracker.md)



