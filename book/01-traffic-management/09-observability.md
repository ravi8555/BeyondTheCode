# Chapter 09 — Observability

## Learning Objectives

- Understand the three pillars of observability: metrics, logs, and traces
- Implement distributed tracing with OpenTelemetry in a microservices architecture
- Configure Prometheus for service metric collection and alerting
- Set up centralized log aggregation with ELK/EFK stack
- Create dashboards and alerts for production monitoring
- Differentiate between symptoms and root causes using observability data
- Evaluate observability tooling: commercial vs open-source options
- Instrument custom applications for automatic instrumentation

## 9.2 Distributed Tracing with OpenTelemetry

### Trace Context Propagation

```yaml
# HTTP headers for trace propagation
traceparent: 00-<trace_id>-<span_id>-<trace_flags>
tracestate: conga=example

# Example values
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
tracestate: conga=example;prod=yourtools
```

## 9.3 Prometheus Monitoring

### Prometheus Configuration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_name]
        target_label: kubernetes_node

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        target_label: __scrape_config

  - job_name: 'my-service'
    static_configs:
      - targets: ['my-service:8080']
    metrics_path: /metrics
    scrape_interval: 5s
```

### Prometheus Metric Types

| Type | Description | Example |
|------|-------------|---------|
| **Counter** | Monotonically increasing | `http_requests_total`, `errors_total` |
| **Gauge** | Current value can go up/down | `cpu_usage`, `memory_available` |
| **Histogram** | Distribution observation | `request_duration_seconds` |
## 9.4 Log Aggregation

### ELK Stack Configuration

```yaml
# Elasticsearch
apiVersion: elasticsearch/v1
kind: Elasticsearch
metadata:
  name: elasticsearch
spec:
  version: "8.10.0"
  nodeCount: 3
  config:
    node.roles: [master, data, ingest]

# Logstash
apiVersion: logstash/v1
kind: Logstash
metadata:
  name: logstash
spec:
  pipeline:
    pipelines:
      - pipeline.id: "system-logs"
        path.config: "/usr/share/logstash/pipeline/system-logs.conf"
      - pipeline.id: "app-logs"
        path.config: "/usr/share/logstash/pipeline/app-logs.conf"

# Kibana
apiVersion: kibana/v1
kind: Kibana
metadata:
  name: kibana
spec:
  elasticsearchRef:
    name: elasticsearch
```

### Fluent Bit for Log Collection

```ini
[INPUT]
    FluentTail
        Path /var/log/containers/*.log
        Tag kubernetes.***

[OUTPUT]
    @id out_kubernetes
    @type kubernetes
    API_URL https://kubernetes.default.svc/api
    HTTP_CA_CERT_FILE /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    HTTP_TOKEN_FILE /var/run/secrets/kubernetes.io/serviceaccount/token

[FILTER]
    @type parser
    key_name log
    parse As JSON
```

### Centralized Log Example

```json
{
  "timestamp": "2024-01-15T10:30:45Z",
## 9.5 Dashboards and Alerts

### Grafana Dashboard Example

```json
{
  "uid": "my-service-dashboard",
  "title": "My Service Observability",
  "tags": ["service", "my-service", "production"],
  "panels": [
    {
      "type": "stat",
      "title": "Request Rate",
      "datasource": "Prometheus",
      "targets": [
        {
          "expr": "rate(http_requests_total[5m])",
          "legendFormat": "Request Rate"
        }
      ]
    },
    {
      "type": "graph",
      "title": "Request Duration p95",
      "datasource": "Prometheus",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(request_duration_seconds_bucket[5m])) by le)",
          "legendFormat": "p95 Duration"
        }
      ]
    },
    {
      "type": "alert",
      "title": "High Error Rate",
      "condition": "WHEN avg(rate(errors_total[5m])) > 0.1 FOR 5m",
      "labels": {
        "severity": "critical"
      },
      "annotations": {
        "summary": "My Service error rate is high"
      }
    }
  ]
}
```

## 9.6 Instrumentation Best Practices

### OpenTelemetry SDK Setup

```go
// Go example
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/otel/attribute"
)

func initTracer() func(context.Context) error {
    ctx := context.Background()
    err := otel.SetTracerProvider(otel.NewTracerProvider())
    if err != nil {
        log.Fatal(err)
    }
    return otel.Tracer("my-service").Start(ctx)
}

// Usage
func handleRequest(w http.ResponseWriter, r *http.Request) {
    ctx, span := otel.Tracer("my-service").Start(r.Context(), "handleRequest")
    defer span.End()
    
    span.SetAttributes(attribute.String("http.method", r.Method))
    span.SetAttributes(attribute.String("http.url", r.URL.String()))
    
    // ... handler logic
## 9.7 Hands-On Exercises

### Beginner: Set Up Basic Observability

1. Deploy a sample application (e.g., hello-world service)
2. Enable OpenTelemetry auto-instrumentation
3. Deploy Jaeger and verify traces appear
4. Deploy Prometheus and confirm metrics are scraped
5. Create a basic Grafana dashboard

**Success criteria:** Traces visible in Jaeger, metrics queryable in Prometheus, dashboard loaded in Grafana.

### Intermediate: Complete Observability Stack

1. Deploy the full ELK/EFK stack (Elasticsearch, Logstash/Fluent Bit, Kibana)
2. Configure Fluent Bit to collect container logs
3. Create custom log queries in Kibana
4. Set up Prometheus with service-specific metrics
5. Create Grafana dashboards with alerts

**Success criteria:** Logs centralized in Kibana, metrics scraped by Prometheus, alerts triggered correctly.

## 9.8 Chapter Summary

### Key Takeaways (5 points)

1. **Observability = metrics + logs + traces** — three pillars working together
2. **Metrics answer "what"**, **logs answer "did anything unexpected happen?"**, **traces answer "where is the bottleneck?"**
3. **OpenTelemetry is the standard** for vendor-agnostic instrumentation
4. **Prometheus + Grafana** is the most common metrics monitoring combo
5. **Centralized logs** (ELK/EFK) enable root cause analysis across services

### Observability Tooling Comparison

| Tool | Category | License | Best For |
|------|----------|---------|----------|
| **OpenTelemetry** | Instrumentation | Apache 2.0 | Vendor-agnostic tracing/metrics |
| **Prometheus** | Metrics | Apache 2.0 | Time-series monitoring, alerting |
| **Grafana** | Visualization | AGPL | Dashboards, alerts |
| **Jaeger** | Tracing | Apache 2.0 | Distributed trace visualization |
| **Elasticsearch** | Log storage | SSPL | Full-text search, log aggregation |
| **Kibana** | Log visualization | SSPL | Log search, analysis |
| **Loki** | Log storage | AGPL | Lightweight log aggregation |
| **Commercial APM** | Full observability | Proprietary | End-to-end business KPI monitoring |

### Observability Terminology Quick Reference

| Term | Definition |
|------|------------|
| `METRICS` | Numerical data measured over time; quantitative system state |
| `LOGS` | Timestamped events; immutable records of what happened |
| `TRACES` | End-to-end request propagation across services; span-based |
| `OPENTELEMETRY` | Vendor-agnostic instrumentation and observability framework |
| `PROMETHEUS` | Popular open-source monitoring system and time-series database |
| `GRAFANA` | Open-source dashboard and alerting toolkit |
| `JAEGER` | Open-source distributed tracing system |
| `ELK STACK` | Elasticsearch + Logstash + Kibana for log aggregation |
| `FLUENT BIT` | Lightweight log collector for Kubernetes |
| `APM` | Application Performance Monitoring — full observability suite |

### Comprehension Questions

1. What are the three pillars of observability and what question does each answer?
2. How does OpenTelemetry differ from proprietary APM solutions?
3. What's the difference between a Prometheus Counter and Gauge?
4. How do trace context headers (traceparent, tracestate) propagate across services?
5. What is the difference between histogram and summary in Prometheus?

### Revision Sheet (Flashcards)

| Front | Back |
|-------|------|
| What are the three pillars of observability? | Metrics, Logs, Traces |
| What does a Prometheus Counter measure? | Monotonically increasing values |
| What does a Prometheus Gauge measure? | Current values that can fluctuate |
| What OpenTelemetry field propagates trace context in HTTP headers? | traceparent |
| What Prometheus metric type observes request duration distribution? | Histogram |
| What is the standard for vendor-agnostic instrumentation? | OpenTelemetry |
| What does the `traceparent` HTTP header contain? | trace_id, span_id, trace_flags |
| What is the difference between `histogram` and `summary` in Prometheus? | Histogram aggregates in the client; summary aggregates in the server |
| What is the typical log format for centralized log aggregation? | JSON |
| What is the standard query language for Prometheus? | PromQL |

### Engineering Problems (Solve These)

1. **Observability blind spot** — Your microservices have no visibility into production behavior. Diagnose: add OpenTelemetry auto-instrumentation, deploy Jaeger, configure Prometheus scraping, create basic Grafana dashboards.

2. **High cardinality logs** — Log flooding makes it impossible to find root causes. Diagnose: implement structured logging, add correlation IDs, reduce log verbosity, configure log rotation and retention.

3. **Metric scattering** — Inconsistent metric names and labels across services make querying difficult. Diagnose: implement OpenTelemetry semantic conventions, establish naming guidelines, add resource attributes (service.name, environment, namespace).

4. **Alert fatigue** — Too many alerts fire, causing teams to ignore them. Diagnose: adjust alert thresholds, implement alert grouping/deduplication, add time-based silencing, focus on business KPI alerts.

5. **Tracing gaps** — Some service hops don't appear in traces. Diagnose: verify OpenTelemetry instrumentation on all services, check header propagation, ensure consistent trace IDs, inspect network proxies/load balancers.
### Advanced: Custom Instrumentation

1. Instrument a custom microservice with OpenTelemetry SDK
2. Add semantic conventions for business logic spans
3. Implement context propagation across service boundaries
4. Create custom metrics for business KPIs
5. Set up alerting on anomalous behavior

**Success criteria:** Traces show complete request flow, custom metrics graphed in Grafana, alerts fire for business KPI thresholds.
}
```

### Semantic Conventions

| Convention | Field | Example |
|------------|-------|---------|
| **HTTP** | `http.method` | "GET" |
| **HTTP** | `http.url` | "/api/users" |
| **HTTP** | `http.status_code` | 200 |
| **Service** | `service.name` | "order-service" |
| **Error** | `error.type` | "TimeoutError" |
| **Error** | `error.message` | "Connection refused" |

### Resource Attributes

```go
resource := otel.NewResource(
    attribute.String("service.name", "my-service"),
    attribute.String("deployment.environment", "production"),
    attribute.String("k8s.namespace", "default"),
    attribute.String("host.id", "node-1"),
)
```
  "level": "ERROR",
  "service": "payment-gateway",
  "environment": "production",
  "message": "Payment timeout after 5s",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "container_name": "payment-gateway-abc123",
  "pod_name": "payment-gateway-7b8c9d",
  "node_name": "node-pool-1"
}
```
| **Summary** | Similar to histogram | `request_duration_seconds` |