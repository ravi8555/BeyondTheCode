// AUTO-GENERATED from book/00-table-of-contents.md — do not edit by hand.
// Regenerate: python scripts/generate-toc.py   (from ui/)

export interface TocChapter {
  number: number;
  title: string;
  slug: string;
  folder: string;
}

export interface TocPart {
  id: number;
  roman: string;
  title: string;
  objective: string;
  chapters: TocChapter[];
}

export const TOC: TocPart[] = [
  {
    id: 1,
    roman: "I",
    title: "Traffic Management and Deployment",
    objective: "protect services from overload, route and shape traffic, deliver code safely, and make unreliable networks usable.",
    chapters: [
      { number: 1, title: "Rate Limiting", slug: "01-rate-limiting", folder: "01-traffic-management" },
      { number: 2, title: "Caching", slug: "02-caching", folder: "01-traffic-management" },
      { number: 3, title: "Load Balancing", slug: "03-load-balancing", folder: "01-traffic-management" },
      { number: 4, title: "Reverse Proxies", slug: "04-reverse-proxies", folder: "01-traffic-management" },
      { number: 5, title: "API Gateways", slug: "05-api-gateways", folder: "01-traffic-management" },
      { number: 6, title: "CI/CD", slug: "06-cicd", folder: "01-traffic-management" },
      { number: 7, title: "Docker", slug: "07-docker", folder: "01-traffic-management" },
      { number: 8, title: "Kubernetes", slug: "08-kubernetes", folder: "01-traffic-management" },
      { number: 9, title: "Service Discovery", slug: "09-service-discovery", folder: "01-traffic-management" },
      { number: 10, title: "Circuit Breakers", slug: "10-circuit-breakers", folder: "01-traffic-management" },
      { number: 11, title: "Timeouts", slug: "11-timeouts", folder: "01-traffic-management" },
      { number: 12, title: "Retries", slug: "12-retries", folder: "01-traffic-management" },
      { number: 13, title: "Exponential Backoff", slug: "13-exponential-backoff", folder: "01-traffic-management" },
      { number: 14, title: "Idempotency", slug: "14-idempotency", folder: "01-traffic-management" },
    ],
  },
  {
    id: 2,
    roman: "II",
    title: "Asynchronous and Distributed Workflows",
    objective: "decouple producers from consumers, survive partial failure in workflows, and choose the right communication model.",
    chapters: [
      { number: 15, title: "Message Queues", slug: "15-message-queues", folder: "02-asynchronous-systems" },
      { number: 16, title: "Pub/Sub", slug: "16-pubsub", folder: "02-asynchronous-systems" },
      { number: 17, title: "Event-Driven Architecture", slug: "17-event-driven-architecture", folder: "02-asynchronous-systems" },
      { number: 18, title: "Distributed Transactions", slug: "18-distributed-transactions", folder: "02-asynchronous-systems" },
      { number: 19, title: "Saga Pattern", slug: "19-saga-pattern", folder: "02-asynchronous-systems" },
      { number: 20, title: "Dead Letter Queues", slug: "20-dead-letter-queues", folder: "02-asynchronous-systems" },
      { number: 21, title: "Cron Jobs", slug: "21-cron-jobs", folder: "02-asynchronous-systems" },
      { number: 22, title: "WebSockets", slug: "22-websockets", folder: "02-asynchronous-systems" },
      { number: 23, title: "Long Polling", slug: "23-long-polling", folder: "02-asynchronous-systems" },
      { number: 24, title: "Server-Sent Events", slug: "24-server-sent-events", folder: "02-asynchronous-systems" },
    ],
  },
  {
    id: 3,
    roman: "III",
    title: "Database Engineering",
    objective: "make the database fast and safe under load — indexes, query plans, pooling, and the scaling ladder from replicas to shards.",
    chapters: [
      { number: 25, title: "Database Indexing", slug: "25-database-indexing", folder: "03-database-engineering" },
      { number: 26, title: "Query Optimization", slug: "26-query-optimization", folder: "03-database-engineering" },
      { number: 27, title: "N+1 Queries", slug: "27-n-plus-1-queries", folder: "03-database-engineering" },
      { number: 28, title: "Connection Pooling", slug: "28-connection-pooling", folder: "03-database-engineering" },
      { number: 29, title: "Read Replicas", slug: "29-read-replicas", folder: "03-database-engineering" },
      { number: 30, title: "Sharding", slug: "30-sharding", folder: "03-database-engineering" },
      { number: 31, title: "Partitioning", slug: "31-partitioning", folder: "03-database-engineering" },
      { number: 32, title: "Replication", slug: "32-replication", folder: "03-database-engineering" },
    ],
  },
  {
    id: 4,
    roman: "IV",
    title: "Distributed Systems and Concurrency",
    objective: "reason about correctness when many processes share state — coordination, consistency, and classic concurrency failures.",
    chapters: [
      { number: 33, title: "Leader Election", slug: "33-leader-election", folder: "04-distributed-systems" },
      { number: 34, title: "CAP Theorem", slug: "34-cap-theorem", folder: "04-distributed-systems" },
      { number: 35, title: "Eventual Consistency", slug: "35-eventual-consistency", folder: "04-distributed-systems" },
      { number: 36, title: "Optimistic Locking", slug: "36-optimistic-locking", folder: "04-distributed-systems" },
      { number: 37, title: "Pessimistic Locking", slug: "37-pessimistic-locking", folder: "04-distributed-systems" },
      { number: 38, title: "Distributed Locks", slug: "38-distributed-locks", folder: "04-distributed-systems" },
      { number: 39, title: "Race Conditions", slug: "39-race-conditions", folder: "04-distributed-systems" },
      { number: 40, title: "Deadlocks", slug: "40-deadlocks", folder: "04-distributed-systems" },
      { number: 41, title: "Memory Leaks", slug: "41-memory-leaks", folder: "04-distributed-systems" },
      { number: 42, title: "Garbage Collection", slug: "42-garbage-collection", folder: "04-distributed-systems" },
      { number: 43, title: "Thread Safety", slug: "43-thread-safety", folder: "04-distributed-systems" },
      { number: 44, title: "Backpressure", slug: "44-backpressure", folder: "04-distributed-systems" },
    ],
  },
  {
    id: 5,
    roman: "V",
    title: "Scaling and Caching Strategies",
    objective: "add capacity the right way and keep cached data honest.",
    chapters: [
      { number: 45, title: "Autoscaling", slug: "45-autoscaling", folder: "05-scaling-and-caching" },
      { number: 46, title: "Horizontal Scaling", slug: "46-horizontal-scaling", folder: "05-scaling-and-caching" },
      { number: 47, title: "Vertical Scaling", slug: "47-vertical-scaling", folder: "05-scaling-and-caching" },
      { number: 48, title: "CDN", slug: "48-cdn", folder: "05-scaling-and-caching" },
      { number: 49, title: "Edge Caching", slug: "49-edge-caching", folder: "05-scaling-and-caching" },
      { number: 50, title: "Cache Invalidation", slug: "50-cache-invalidation", folder: "05-scaling-and-caching" },
    ],
  },
  {
    id: 6,
    roman: "VI",
    title: "Deployment Strategies",
    objective: "ship changes continuously without breaking users, and detect breakage fast when it happens.",
    chapters: [
      { number: 51, title: "Feature Flags", slug: "51-feature-flags", folder: "06-deployment-strategies" },
      { number: 52, title: "Blue-Green Deployment", slug: "52-blue-green-deployment", folder: "06-deployment-strategies" },
      { number: 53, title: "Canary Releases", slug: "53-canary-releases", folder: "06-deployment-strategies" },
      { number: 54, title: "Rolling Deployments", slug: "54-rolling-deployments", folder: "06-deployment-strategies" },
      { number: 55, title: "Rollbacks", slug: "55-rollbacks", folder: "06-deployment-strategies" },
      { number: 56, title: "Health Checks", slug: "56-health-checks", folder: "06-deployment-strategies" },
      { number: 57, title: "Liveness & Readiness Probes", slug: "57-liveness-and-readiness-probes", folder: "06-deployment-strategies" },
    ],
  },
  {
    id: 7,
    roman: "VII",
    title: "Observability and Reliability",
    objective: "instrument a system so strangers can debug it, define what \"reliable\" means numerically, and manage reliability as a budget.",
    chapters: [
      { number: 58, title: "Monitoring", slug: "58-monitoring", folder: "07-observability" },
      { number: 59, title: "Logging", slug: "59-logging", folder: "07-observability" },
      { number: 60, title: "Distributed Tracing", slug: "60-distributed-tracing", folder: "07-observability" },
      { number: 61, title: "Metrics", slug: "61-metrics", folder: "07-observability" },
      { number: 62, title: "Alerts", slug: "62-alerts", folder: "07-observability" },
      { number: 63, title: "SLOs", slug: "63-slos", folder: "07-observability" },
      { number: 64, title: "SLIs", slug: "64-slis", folder: "07-observability" },
      { number: 65, title: "Error Budgets", slug: "65-error-budgets", folder: "07-observability" },
      { number: 66, title: "Observability", slug: "66-observability", folder: "07-observability" },
    ],
  },
  {
    id: 8,
    roman: "VIII",
    title: "Security and Identity",
    objective: "control who can do what, protect data in motion and at rest, and defend against the OWASP-style attack surface a real API exposes.",
    chapters: [
      { number: 67, title: "Secrets Management", slug: "67-secrets-management", folder: "08-security" },
      { number: 68, title: "IAM", slug: "68-iam", folder: "08-security" },
      { number: 69, title: "OAuth", slug: "69-oauth", folder: "08-security" },
      { number: 70, title: "JWT Rotation", slug: "70-jwt-rotation", folder: "08-security" },
      { number: 71, title: "TLS", slug: "71-tls", folder: "08-security" },
      { number: 72, title: "Encryption at Rest", slug: "72-encryption-at-rest", folder: "08-security" },
      { number: 73, title: "Encryption in Transit", slug: "73-encryption-in-transit", folder: "08-security" },
      { number: 74, title: "WAF", slug: "74-waf", folder: "08-security" },
      { number: 75, title: "DDoS Protection", slug: "75-ddos-protection", folder: "08-security" },
      { number: 76, title: "CORS", slug: "76-cors", folder: "08-security" },
      { number: 77, title: "CSRF", slug: "77-csrf", folder: "08-security" },
      { number: 78, title: "SQL Injection", slug: "78-sql-injection", folder: "08-security" },
      { number: 79, title: "XSS", slug: "79-xss", folder: "08-security" },
      { number: 80, title: "SSRF", slug: "80-ssrf", folder: "08-security" },
    ],
  },
  {
    id: 9,
    roman: "IX",
    title: "Data Management and Disaster Recovery",
    objective: "change schemas without downtime, and answer \"the region is gone — now what?\" with a plan you have already tested.",
    chapters: [
      { number: 81, title: "Database Migrations", slug: "81-database-migrations", folder: "09-data-management-and-recovery" },
      { number: 82, title: "Schema Versioning", slug: "82-schema-versioning", folder: "09-data-management-and-recovery" },
      { number: 83, title: "Disaster Recovery", slug: "83-disaster-recovery", folder: "09-data-management-and-recovery" },
      { number: 84, title: "Backups", slug: "84-backups", folder: "09-data-management-and-recovery" },
      { number: 85, title: "Failover", slug: "85-failover", folder: "09-data-management-and-recovery" },
      { number: 86, title: "Multi-Region Deployment", slug: "86-multi-region-deployment", folder: "09-data-management-and-recovery" },
      { number: 87, title: "Chaos Engineering", slug: "87-chaos-engineering", folder: "09-data-management-and-recovery" },
      { number: 88, title: "Cost Optimization", slug: "88-cost-optimization", folder: "09-data-management-and-recovery" },
    ],
  },
  {
    id: 10,
    roman: "X",
    title: "Cloud and Performance Engineering",
    objective: "understand serverless economics and latency anatomy — from average to P99 — and the distributed-systems pathologies that make them worse.",
    chapters: [
      { number: 89, title: "Cold Starts", slug: "89-cold-starts", folder: "10-cloud-and-performance" },
      { number: 90, title: "Serverless Limits", slug: "90-serverless-limits", folder: "10-cloud-and-performance" },
      { number: 91, title: "Latency", slug: "91-latency", folder: "10-cloud-and-performance" },
      { number: 92, title: "Throughput", slug: "92-throughput", folder: "10-cloud-and-performance" },
      { number: 93, title: "P99 Latency", slug: "93-p99-latency", folder: "10-cloud-and-performance" },
      { number: 94, title: "Tail Latency", slug: "94-tail-latency", folder: "10-cloud-and-performance" },
      { number: 95, title: "Network Partitions", slug: "95-network-partitions", folder: "10-cloud-and-performance" },
      { number: 96, title: "Clock Skew", slug: "96-clock-skew", folder: "10-cloud-and-performance" },
    ],
  },
  {
    id: 11,
    roman: "XI",
    title: "Networking and API Communication",
    objective: "know what happens between two sockets, choose the right protocol and communication style, and version an API that other teams depend on.",
    chapters: [
      { number: 97, title: "DNS", slug: "97-dns", folder: "11-networking-and-apis" },
      { number: 98, title: "TCP vs UDP", slug: "98-tcp-vs-udp", folder: "11-networking-and-apis" },
      { number: 99, title: "HTTP/2 & HTTP/3", slug: "99-http2-and-http3", folder: "11-networking-and-apis" },
      { number: 100, title: "gRPC", slug: "100-grpc", folder: "11-networking-and-apis" },
      { number: 101, title: "Webhooks", slug: "101-webhooks", folder: "11-networking-and-apis" },
      { number: 102, title: "API Versioning", slug: "102-api-versioning", folder: "11-networking-and-apis" },
      { number: 103, title: "Semantic Versioning", slug: "103-semantic-versioning", folder: "11-networking-and-apis" },
    ],
  },
  {
    id: 12,
    roman: "XII",
    title: "Infrastructure and Software Delivery",
    objective: "make infrastructure reproducible, reviewable, and fast to build — and keep dependency upgrades from becoming archaeology.",
    chapters: [
      { number: 104, title: "Infrastructure as Code", slug: "104-infrastructure-as-code", folder: "12-infrastructure-and-delivery" },
      { number: 105, title: "Terraform", slug: "105-terraform", folder: "12-infrastructure-and-delivery" },
      { number: 106, title: "Helm Charts", slug: "106-helm-charts", folder: "12-infrastructure-and-delivery" },
      { number: 107, title: "Build Caching", slug: "107-build-caching", folder: "12-infrastructure-and-delivery" },
      { number: 108, title: "Dependency Hell", slug: "108-dependency-hell", folder: "12-infrastructure-and-delivery" },
    ],
  },
  {
    id: 13,
    roman: "XIII",
    title: "Production Operations",
    objective: "operate software under pressure — detect, respond, recover, learn, and improve the organizational system around outages.",
    chapters: [
      { number: 109, title: "Production Incidents", slug: "109-production-incidents", folder: "13-production-operations" },
      { number: 110, title: "On-Call", slug: "110-on-call", folder: "13-production-operations" },
      { number: 111, title: "Postmortems", slug: "111-postmortems", folder: "13-production-operations" },
    ],
  },
];

export const ALL_CHAPTERS: TocChapter[] = TOC.flatMap((p) => p.chapters);

