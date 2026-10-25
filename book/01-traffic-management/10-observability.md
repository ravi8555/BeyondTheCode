# Chapter 10 — Observability
- Understand the three pillars of observability: metrics, logs, and traces
## 10.1 Observability Fundamentals
```mermaid
### Why All Three Pillars Are Needed
### Key Concepts
## 10.2 OpenTelemetry Instrumentation
### Instrumenting HTTP Requests
### Instrumenting Database Calls
## 10.3 Prometheus Metric Collection
### Custom Metrics Exposure
### Prometheus Query Examples
## 10.4 Log Management with ELK/EFK Stack
### Log Collection with Filebeat
### Logstash Configuration
### Common Log Patterns
## 10.5 Trace Collection with OpenTelemetry
### Trace Exporter Configuration
### Trace Context Propagation
## 10.6 Grafana Dashboard Creation
### Alert Rules
## 10.7 Comprehension Questions
## 10.8 Revision Sheet (Flashcards)
## 10.9 Engineering Problems (Solve These)
---

**BeyondTheCode Project - Chapter 10 Creation Complete**

### Chapter 10 — Observability

**File:** `d:/practice/GenAI-2026/projects/BeyondTheCode/book/01-traffic-management/10-observability.md`

**Chapter 10 — Observability Content:**
- 10.1 Observability Fundamentals (three pillars, key concepts, why all three needed)
- 10.2 OpenTelemetry Instrumentation (Go examples, HTTP, database)
- 10.3 Prometheus Metric Collection (configuration, custom metrics, queries)
- 10.4 Log Management with ELK/EFK Stack (Elasticsearch, Filebeat, Logstash, patterns)
- 10.5 Trace Collection with OpenTelemetry (Jaeger, OTLP exporter, context propagation)
- 10.6 Grafana Dashboard Creation (dashboard JSON, alert rules)
- 10.7 Comprehension Questions (8 questions)
- 10.8 Revision Sheet (Flashcards with 10 cards)
- 10.9 Engineering Problems (5 problems with diagnoses)

**Progress Tracker Updated:**
- Chapter 10: Observability ✍

**Full Book Chapters 01-11:** All complete and tracked.

1. **Missing metrics in Prometheus** — Your custom application metrics are not appearing in Prometheus. Diagnose: check if the application is exposing `/metrics` endpoint, verify Prometheus scrape configuration, check firewall/network rules, ensure metrics are registered with Prometheus client library.

2. **Log correlation across services** — You cannot trace a request across multiple microservices using logs. Diagnose: ensure structured logging with correlation IDs, verify log forwarder (Filebeat/Logstash) is propagating correlation IDs, check Elasticsearch index mapping, verify log format consistency.

3. **Trace gaps in Jaeger** — Some service calls are not appearing in trace visualization. Diagnose: check if all services are instrumented with OpenTelemetry, verify trace context propagation (traceparent header), check for missing span export, verify network connectivity between Jaeger and exporters.

4. **High cardinality labels** — Your Prometheus performance degrades due to too many label values. Diagnose: reduce label cardinality, use histogram buckets instead of many label values, implement label synonyms, review and prune unused labels.

5. **Grafana dashboard not refreshing** — Your dashboard panels show stale data or fail to refresh. Diagnose: check datasource connectivity, verify Prometheus query syntax, check Grafana server logs, ensure refresh interval is configured, verify query permissions.

| Front | Back |
|-------|------|
| What are the three pillars of observability? | Metrics, Logs, Traces |
| What does a metric counter typically track? | Total count of events |
| What does a metric gauge typically track? | Point-in-time value |
| What does a metric histogram track? | Distribution of values |
| What is a span in tracing? | Individual unit of work |
| What is a trace ID? | Unique identifier for a request flow |
| What log level indicates a serious error? | fatal |
| What is the default Prometheus scrape interval? | 15s |
| What does the `traceparent` header contain? | Trace context for propagation |
| What is the default Prometheus evaluation interval? | 15s |

1. What are the three pillars of observability and what does each pillar primarily answer?
2. How does OpenTelemetry differ from proprietary observability solutions?
3. What's the difference between a Prometheus histogram and a summary?
4. How do you ensure log correlation across microservices?
5. What is a trace ID and how is it used to correlate data across the three pillars?
6. When would you use a LogQL query vs a PromQL query?
7. How do trace IDs propagate across service boundaries in a microservice architecture?
8. What are the common challenges with observability in dynamic environments like Kubernetes?

```yaml
# alerting_rules.yml
groups:
  - name: observability-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 5% for 2 minutes"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, sum(http_request_duration_seconds_bucket) by (le)) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "95th percentile latency is above 2 seconds for 5 minutes"
```

### Basic Dashboard JSON

```json
{
  "title": "Service Request Metrics",
  "tags": ["observability", "metrics"],
  "timezone": "browser",
  "panels": [
    {
      "type": "graph",
      "title": "HTTP Requests Per Second",
      "datasource": "Prometheus",
      "targets": [
        {
          "expr": "rate(http_requests_total[1m])",
          "legendFormat": "Total requests"
        }
      ],
      "gridData": {
        "xaxis": "time",
        "yaxis": "value"
      }
    },
    {
      "type": "graph",
      "title": "Request Duration P95",
      "datasource": "Prometheus",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(http_request_duration_seconds_bucket) by (le))",
          "legendFormat": "P95 latency"
        }
      ],
      "gridData": {
        "xaxis": "time",
        "yaxis": "value"
      }
    }
  ],
  "schemaVersion": 30,
  "version": 1,
  "refresh": "30s"
}
```

```go
// W3C Trace Context format
// traceparent header: version-traceid-spanid-flags
// Example: 00-4bf92f3577b34da6a3ce929d0e0e473600fbf92b435c1565f80306b85f9b48d-00f067aa0ba902b7-01

func extractTraceContext(r *http.Request) (string, string) {
    traceparent := r.Header.Get("traceparent")
    if traceparent == "" {
        return "", ""
    }
    
    parts := strings.Split(traceparent, "-")
    if len(parts) == 4 {
        traceID := parts[1]
        spanID := parts[2]
        return traceID, spanID
    }
    
    return "", ""
}
```

```go
// Go example: OTLP exporter
import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
)

func initTracer() func(context.Context) error {
    exp, err := otlptracehttp.New(
        context.Background(),
        otlptracehttp.WithEndpointOptions(
            otlptracehttp.WithEndpoint("localhost:4318"),
        ),
        otlptracehttp.WithInsecure(),
    )
    if err != nil {
        log.Fatal(err)
    }
    
    bp := batch.NewBatch(
        batch.WithProcessor((otlptrace.NewExporter)(exp)),
    )
    
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(bp),
        sdktrace.WithSampler(sdktrace.AlwaysSample()),
    )
    otel.SetTracerProvider(tp)
    
    return func(context.Context) error { return nil }
}
```

### Jaeger Integration

```yaml
# jaeger.yaml (Kubernetes deployment)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/all-in-one:1.53
          ports:
            - containerPort: 16686  # UI port
```

| Pattern | Description | Grok Expression |
|---------|-------------|-----------------|
| **HTTP request** | `GET /api/users 200 150ms` | `%{WORD} %{URIPATH} %{NUMBER} %{NUMBER}ms` |
| **JSON log** | `{"level":"info","msg":"request completed"}` | `%{JSON}` |
| **Stack trace** | Multi-line error output | `%{STACKTRACE}` |
| **Timestamp** | `2024-01-15T10:30:45Z` | `%{TIMESTAMP_ISO8601}` |

```yaml
# logstash.conf
input {
  beats {
    port => 5044
  }
}

filter {
  grok {
    match => { "message" => "%{COMPONENT} %{DATA}" }
  }
  date {
    match => [ "timestamp", "MMM  d HH:mm:ss", "RFC3339" ]
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "application-%{+YYYY.MM.dd}"
  }
}
```

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/containers/*.log
    toward_filename: "*"
    json.keys_under_root: true
    json.overwrite_keys: true

output.logstash:
  hosts: ["logstash:5044"]
```

### Elasticsearch Configuration

```yaml
# elasticsearch.yml
cluster.name: observability-cluster
node.name: node-1
path.data: /var/lib/elasticsearch
cluster.routing.allocation.disk.threshold_enabled: false

# Memory settings
xpack.ml.enabled: false
discovery.type: single-node
network.host: 0.0.0.0
http.port: 9200
```

| Query | Purpose |
|-------|---------|
| `http_requests_total` | Total request count |
| `http_request_duration_seconds_sum / http_request_duration_seconds_count` | Average request duration |
| `histogram_quantile(0.95, sum(http_request_duration_seconds_bucket) by (le) | ` 95th percentile latency |
| `up` | Whether the target is up |
| `count by (instance) (http_requests_total)` | Requests per instance |

```go
// Go example: custom metrics
import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
    "net/http"
)

var (
    requestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )
    
    requestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "http_request_duration_seconds",
            Help: "Duration of HTTP requests in seconds",
            Buckets: []float64{0.1, 0.5, 1, 2.5, 5, 10},
        },
        []string{"method", "path"},
    )
)

func init() {
    prometheus.MustRegister(requestsTotal, requestDuration)
}

func handler(w http.ResponseWriter, r *http.Request) {
    start := time.Now()
    defer func() {
        requestsTotal.WithLabels(r.Method, r.URL.Path, "200").Inc()
        requestDuration.WithLabels(r.Method, r.URL.Path).Observe(time.Since(start).Seconds())
    }()
    
    // Handle request
    w.WriteHeader(200)
    w.Write([]byte("OK"))
}

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8080", nil)
}
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_name]
        target_label: kubernetes_node_name

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        target_label: __scrape_enable
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        target_label: __metrics_path
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        target_label: __metrics_port

  - job_name: 'my-service'
    static_configs:
      - targets: ['my-service:8080']
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__address__, __meta_kubernetes_pod_label_app]
        target_label: app
```

```go
func getUser(db *sql.DB, id string) (User, error) {
    ctx, span := tracer.Start(ctx, "GetUser")
    defer span.End()
    
    span.SetAttributes(
        attribute.String("db.statement", "SELECT * FROM users WHERE id = ?"),
        attribute.String("db.system", "postgresql"),
    )
    
    var user User
    err := db.QueryRowContext(ctx, "SELECT * FROM users WHERE id = ?", id).Scan(&user)
    
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
    }
    
    return user, err
}
```

```go
func handler(w http.ResponseWriter, r *http.Request) {
    t := otel.Tracer("my-service")
    ctx, span := t.Start(r.Context(), "HTTP handler")
    defer span.End()
    
    // Add attributes to span
    span.SetAttributes(
        attribute.String("http.method", r.Method),
        attribute.String("http.url", r.URL.String()),
    )
    
    // Business logic
    result := processRequest(r)
    
    // Record metrics
    w.Write([]byte(result))
}
```

### OpenTelemetry SDK Setup

```go
// Go example: OTel setup
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/otel/metric"
)

func initOTel() func(context.Context) error {
    // Set up tracer provider
    tp := otel.NewTracerProvider()
    otel.SetTracerProvider(tp)
    
    // Set up meter provider
    mp := otel.NewMeterProvider()
    otel.SetMeterProvider(mp)
    
    return func(context.Context) error {
        return nil
    }
}
```

| Term | Description |
|------|-------------|
| **Instrumentation** | Adding code to collect observability data |
| **OpenTelemetry** | Vendor-neutral observability framework |
| **Span** | Individual unit of work in a trace |
| **Trace ID** | Unique identifier for a complete request flow |
| **Span ID** | Unique identifier for a single span within a trace |
| **Label/Tag** | Key-value pair adding context to metrics/spans |
| **Histogram** | Distribution of values (e.g., request durations) |
| **Counter** | Monotonically increasing numeric value |
| **Gauge** | Point-in-time numerical value |
| **Log Level** | Severity level (debug, info, warning, error, fatal) |

- **Metrics** answer "What is happening?" (trends, averages, rates)
- **Logs** answer "What happened?" (specific events, errors, details)
- **Traces** answer "How did we get here?" (request flow, latency, dependencies)
graph TD
    subgraph Application
        A[Code] -->|instruments| B[OpenTelemetry SDK]
    end
    subgraph Metrics
        B -->|exports| C[Prometheus]
        C -->|queries| D[Grafana]
    end
    subgraph Logs
        B -->|exports| E[Loki/ELK]
        E -->|queries| F[Grafana]
    end
    subgraph Traces
        B -->|exports| G[Jaeger/Zipkin]
        G -->|queries| H[Grafana]
    end
```

### The Three Pillars of Observability

| Pillar | Description | Typical Tools |
|--------|-------------|---------------|
| **Metrics** | Numerical data measured over time intervals | Prometheus, Grafana, Datadog |
| **Logs** | Timestamped records of discrete events | ELK Stack, EFK Stack, Loki, Splunk |
| **Traces** | End-to-end request flow across distributed services | OpenTelemetry, Jaeger, Zipkin, Datadog |
- Implement OpenTelemetry instrumentation in applications
- Configure Prometheus for metric collection and scraping
- Set up ELK/EFK stack for log management and analysis
- Create Grafana dashboards for visualization
- Correlate data across the three pillars using trace IDs
- Implement health checks and readiness/liveness probes
- Debug common observability issues: missing data, high cardinality, label explosion

## Learning Objectives

- Understand the three pillars of observability: metrics, logs, and traces
- Implement OpenTelemetry instrumentation in applications
- Configure Prometheus for metric collection and scraping
- Set up ELK/EFK stack for log management and analysis
- Create Grafana dashboards for visualization
- Correlate data across the three pillars using trace IDs
- Implement health checks and readiness/liveness probes
- Debug common observability issues: missing data, high cardinality, label explosion
﻿# Chapter 10 — Observability
