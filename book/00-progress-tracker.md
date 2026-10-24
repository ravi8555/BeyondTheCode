# Progress Tracker — All 111 Chapters

Status legend: ⬜ not started · ✍ drafted · ✅ complete (all 13 sections + code validated where possible) · 🔁 needs audit (Phase 5/6)

Filename convention per chapter: `PART-FOLDER/NN-kebab-name.md` (numbers match the topic list exactly).

| # | Topic | Status | Notes |
|---|---|---|---|
| **Part I — Traffic Management and Deployment** ||||
| 01 | Rate Limiting | ✍ | Chapter written; runnable code in `code/01-rate-limiting/` |
| 02 | Caching | ✍ | Chapter written; runnable code in `code/02-caching/` (typecheck + 13 tests passed against real Redis + PostgreSQL; visible-skip/no-infra path verified) |
| 03 | Load Balancing | ✍ | Chapter written; runnable code in `code/03-load-balancing/` |
| 04 | Reverse Proxies | ✍ | Chapter written; runnable code in `code/04-reverse-proxies/` (typecheck + nginx -t + docker compose config passed; 14/14 Vitest assertions passed host-level against real Nginx 1.24 + backend; Docker runtime path unverified — sandbox daemon unavailable) |
| 05 | API Gateways | ✍ | Chapter written; runnable code in `code/05-api-gateways/` (typecheck + 18 Vitest tests passed) |
| 06 | CI/CD | ⬜ | |
| 07 | Docker | ⬜ | |
| 08 | Kubernetes | ⬜ | |
| 09 | Service Discovery | ⬜ | |
| 10 | Circuit Breakers | ⬜ | |
| 11 | Timeouts | ⬜ | |
| 12 | Retries | ⬜ | |
| 13 | Exponential Backoff | ⬜ | |
| 14 | Idempotency | ⬜ | |
| **Part II — Asynchronous and Distributed Workflows** ||||
| 15 | Message Queues | ⬜ | |
| 16 | Pub/Sub | ⬜ | |
| 17 | Event-Driven Architecture | ⬜ | |
| 18 | Distributed Transactions | ⬜ | |
| 19 | Saga Pattern | ⬜ | |
| 20 | Dead Letter Queues | ⬜ | |
| 21 | Cron Jobs | ⬜ | |
| 22 | WebSockets | ⬜ | |
| 23 | Long Polling | ⬜ | |
| 24 | Server-Sent Events | ⬜ | |
| **Part III — Database Engineering** ||||
| 25 | Database Indexing | ⬜ | |
| 26 | Query Optimization | ⬜ | |
| 27 | N+1 Queries | ⬜ | |
| 28 | Connection Pooling | ⬜ | |
| 29 | Read Replicas | ⬜ | |
| 30 | Sharding | ⬜ | |
| 31 | Partitioning | ⬜ | |
| 32 | Replication | ⬜ | |
| **Part IV — Distributed Systems and Concurrency** ||||
| 33 | Leader Election | ⬜ | |
| 34 | CAP Theorem | ⬜ | |
| 35 | Eventual Consistency | ⬜ | |
| 36 | Optimistic Locking | ⬜ | |
| 37 | Pessimistic Locking | ⬜ | |
| 38 | Distributed Locks | ⬜ | |
| 39 | Race Conditions | ⬜ | |
| 40 | Deadlocks | ⬜ | |
| 41 | Memory Leaks | ⬜ | |
| 42 | Garbage Collection | ⬜ | |
| 43 | Thread Safety | ⬜ | |
| 44 | Backpressure | ⬜ | |
| **Part V — Scaling and Caching Strategies** ||||
| 45 | Autoscaling | ⬜ | |
| 46 | Horizontal Scaling | ⬜ | |
| 47 | Vertical Scaling | ⬜ | |
| 48 | CDN | ⬜ | |
| 49 | Edge Caching | ⬜ | |
| 50 | Cache Invalidation | ⬜ | |
| **Part VI — Deployment Strategies** ||||
| 51 | Feature Flags | ⬜ | |
| 52 | Blue-Green Deployment | ⬜ | |
| 53 | Canary Releases | ⬜ | |
| 54 | Rolling Deployments | ⬜ | |
| 55 | Rollbacks | ⬜ | |
| 56 | Health Checks | ⬜ | |
| 57 | Liveness & Readiness Probes | ⬜ | |

| 58 | Monitoring | ⬜ | |
| 59 | Logging | ⬜ | |
| 60 | Distributed Tracing | ⬜ | |
| 61 | Metrics | ⬜ | |
| 62 | Alerts | ⬜ | |
| 63 | SLOs | ⬜ | |
| 64 | SLIs | ⬜ | |
| 65 | Error Budgets | ⬜ | |
| 66 | Observability | ⬜ | |
| **Part VIII — Security and Identity** ||||
| 67 | Secrets Management | ⬜ | |
| 68 | IAM | ⬜ | |
| 69 | OAuth | ⬜ | |
| 70 | JWT Rotation | ⬜ | |
| 71 | TLS | ⬜ | |
| 72 | Encryption at Rest | ⬜ | |
| 73 | Encryption in Transit | ⬜ | |
| 74 | WAF | ⬜ | |
| 75 | DDoS Protection | ⬜ | |
| 76 | CORS | ⬜ | |
| 77 | CSRF | ⬜ | |
| 78 | SQL Injection | ⬜ | |
| 79 | XSS | ⬜ | |
| 80 | SSRF | ⬜ | |
| **Part IX — Data Management and Disaster Recovery** ||||
| 81 | Database Migrations | ⬜ | |
| 82 | Schema Versioning | ⬜ | |
| 83 | Disaster Recovery | ⬜ | |
| 84 | Backups | ⬜ | |
| 85 | Failover | ⬜ | |
| 86 | Multi-Region Deployment | ⬜ | |
| 87 | Chaos Engineering | ⬜ | |
| 88 | Cost Optimization | ⬜ | |
| **Part X — Cloud and Performance Engineering** ||||
| 89 | Cold Starts | ⬜ | |
| 90 | Serverless Limits | ⬜ | |
| 91 | Latency | ⬜ | |
| 92 | Throughput | ⬜ | |
| 93 | P99 Latency | ⬜ | |
| 94 | Tail Latency | ⬜ | |
| 95 | Network Partitions | ⬜ | |
| 96 | Clock Skew | ⬜ | |
| **Part XI — Networking and API Communication** ||||
| 97 | DNS | ⬜ | |
| 98 | TCP vs UDP | ⬜ | |
| 99 | HTTP/2 & HTTP/3 | ⬜ | |
| 100 | gRPC | ⬜ | |
| 101 | Webhooks | ⬜ | |
| 102 | API Versioning | ⬜ | |
| 103 | Semantic Versioning | ⬜ | |
| **Part XII — Infrastructure and Software Delivery** ||||
| 104 | Infrastructure as Code | ⬜ | |
| 105 | Terraform | ⬜ | |
| 106 | Helm Charts | ⬜ | |
| 107 | Build Caching | ⬜ | |
| 108 | Dependency Hell | ⬜ | |
| **Part XIII — Production Operations** ||||
| 109 | Production Incidents | ⬜ | |
| 110 | On-Call | ⬜ | |
| 111 | Postmortems | ⬜ | |

## Phase Audit Checklist (Phase 5/6)

- [ ] All 111 chapter files exist with correct numbering and names
- [ ] Every chapter has all 13 mandatory sections (no stubs)
- [ ] Every runnable code block exists under `book/code/` and was executed or explicitly marked untested
- [ ] All Mermaid diagrams render
- [ ] Interview question index covers all chapters (Phase 4)
- [ ] All cross-references point to existing chapters
- [ ] Glossary covers all terms flagged during writing (Phase 4)

