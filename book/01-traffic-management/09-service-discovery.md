## 9.1 Service Discovery Fundamentals

### Why Service Discovery is Needed

In dynamic microservice environments, containers/pods frequently:
- Get created and destroyed (scale up/down)
- Change IP addresses (redeploying, node failure)
- Move between hosts (scheduling decisions)

**Traditional approach (static):** Hardcoded IP addresses in configuration → fails when IPs change.

**Service Discovery approach:** Dynamic lookup → works regardless of IP changes.

### Key Concepts

| Term | Description |
|------|-------------|
| **Service Registry** | Central database of service instances |
| **Service Mesh** | Infrastructure layer for service-to-service communication |
| **DNS-based Discovery** | Uses DNS to resolve service names IPs |
| **Environment Variables** | Static IP config injected at pod startup |
| **Sidecar Proxy** | Intercepts service calls (e.g., Envoy, Istio) |
| **Health Checking** | Registry only returns healthy endpoints |

### DNS-Based Service Discovery in Kubernetes

Kubernetes provides built-in service discovery via DNS:

```mermaid
graph LR
    subgraph Client Pod
        A[app-service] -->|DNS query| B[kube-dns/CoreDNS]
    end
    subgraph Control Plane
        B -->|resolves| C[Service ClusterIP]
        C -->|backs| D[Endpoints]
        D -->|pod IPs| E[Target Pods]
## 9.2 Kubernetes Built-in Service Discovery

### Automatic DNS Registration

Every Kubernetes Service automatically gets DNS entry:

```
Service Name: my-db
Namespace: default
Full DNS: my-db.default.svc.cluster.local
Cluster IP: 10.96.123.45
```

### Accessing Services via DNS

```bash
# From within the cluster
mysql my-db.default.svc.cluster.local -P 3306 -u root -p

# Using kubectl
kubectl get svc my-db
# OUTPUT: TYPE CLUSTER-IP   EXTERNAL-IP   PORT(S)    AGE
#        ClusterIP 10.96.123.45   <none>        3306/TCP   1h
```

### Service Discovery via Environment Variables

Kubernetes can inject service information as environment variables:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
    - name: app
      image: myapp:latest
      env:
        - name: DB_SERVICE_HOST
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        - name: DB_SERVICE_PORT
          value: "3306"
```

### Using `headless` Services for Direct Pod Discovery

## 9.3 External Service Discovery Patterns

### Consul Service Discovery

```yaml
# Register service with Consul
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-service
  template:
    metadata:
      annotations:
        # Consul sidecar injection
        consul.io/connect-inject: "true"
        consul.io/connect-service: "my-service"
    spec:
      containers:
        - name: my-service
          image: myregistry.io/my-service:latest
          ports:
            - containerPort: 8080
```

### etcd Key-Value Based Discovery

```bash
# Register service instance
etcdctl put /services/my-service/instances/"$(hostname)" \
  '{"address":"10.0.0.1","port":8080,"tags":["v1"]}'

# Discover healthy instances
etcdctl get /services/my-service/instances --prefix --keys-only
```

### DNS-Based External Service Discovery

```yaml
apiVersion: v1
kind: Service
metadata:
## 9.4 Hands-On Exercises

### Beginner: Verify Kubernetes DNS Service Discovery

1. Create a Service: `kubectl expose deployment my-db --port=3306 --name=my-service`
2. Verify DNS resolution: `nslookup my-service.default.svc.cluster.local`
3. From another pod, use the DNS name to connect
4. Check: DNS resolves to Service ClusterIP

**Success criteria:** DNS lookup returns ClusterIP; application can connect using service name.

### Intermediate: Environment Variable Service Discovery

1. Create a Deployment with envFrom referencing a Service
2. Deploy two pods of the application
3. Observe that environment variables are identical on both pods
4. Test inter-pod communication using the environment variables

**Success criteria:** Both pods have same DB_SERVICE_HOST/PORT env vars; can connect to service.
## 9.5 Chapter Summary

### Key Takeaways (5 points)

1. **Kubernetes DNS is automatic** — every Service gets a DNS entry without configuration
2. **ClusterIP enables internal DNS resolution** — `my-service.namespace.svc.cluster.local`
3. **Environment variables provide static config** — injected at pod creation time
4. **Headless Services (clusterIP: None)** — bypass kube-proxies for direct pod access
5. **ExternalName provides CNAME mapping** — for on-prem to cloud integration

### Service Discovery Quick Reference

| Method | Command/Config | Purpose |
|--------|---------------|---------|
| DNS lookup | `nslookup my-service.namespace.svc.cluster.local` | Resolve service IP |
| Service env vars | `envFrom.configMapRef` | Static IP/Port injection |
| Headless Service | `spec.clusterIP: None` | Direct pod IP access |
| ExternalName | `spec.type: ExternalName`, `externalName: hostname` | CNAME to external DNS |
| kubectl get svc | `kubectl get services my-service` | View service details |
| kubectl get ep | `kubectl get endpoints my-service` | View endpoint IPs |

### Comprehension Questions

1. What's the difference between standard Kubernetes Service DNS and environment variable-based discovery?
2. When would you use a headless Service (clusterIP: None) instead of a regular Service?
3. How does Kubernetes Service Discovery differ from Consul/etcd service discovery?
4. What happens to DNS resolution when a pod is deleted and a new one created with the same label selectors?
5. When would you use ExternalName Service type?

### Revision Sheet (Flashcards)

| Front | Back |
|-------|------|
| What does Kubernetes service discovery solve? | Dynamic IP changes when pods scale/redeploy |
| What DNS name does Kubernetes auto-create for a Service? | `my-service.namespace.svc.cluster.local` |
| What Service type enables direct pod IP access? | Headless Service (clusterIP: None) |
| What does ExternalName Service type use? | CNAME record to external DNS name |
| How do you view Service endpoints? | `kubectl get endpoints <name>` |
| What env var holds the Service ClusterIP? | `SERVICE_HOST` (service controller injected) |
| What is the default Service type in Kubernetes? | ClusterIP |
| How does a headless Service differ from regular Service? | clusterIP set to None, no proxy |
| What does `kubectl get svc` display? | Service type, ClusterIP, ports, selector |
| When would you use `externalName` in a Service? | To CNAME to an external hostname |

### Engineering Problems (Solve These)

1. **Service not resolvable** — `nslookup my-service.namespace.svc.cluster.local` returns NXDOMAIN. Diagnose: check Service exists, verify correct namespace, ensure CoreDNS is running, check selector matches pod labels.

2. **Intermittent connectivity** — Service resolves but connections time out. Diagnose: check Endpoints are populated, verify pod labels match Service selector, check pod readiness/liveness, review network policies.

3. **Environment variables not updating** — New pods don't get updated DB_HOST env var after Service IP changes. Diagnose: understand env vars are set at pod creation; redeploy pods or use volume/mount for dynamic config.

4. **DNS resolution slow** — `nslookup` takes 2-3 seconds. Diagnose: check CoreDNS ConfigMap, verify cache TTL settings, check upstream DNS forwarding configuration.

5. **Cross-namespace service access** — Pod in namespace-a can't resolve Service in namespace-b. Diagnose: check namespace isolation, use full FQDN `my-service.namespace-b.svc.cluster.local`, verify NetworkPolicy allows DNS traffic.

### Advanced: Headless Service for Direct Pod Access

1. Create a headless Service: `kubectl expose deployment my-db --port=3306 --clusterIP=None --name=my-db-headless`
2. Get Endpoints: `kubectl get endpoints my-db-headless`
3. Connect directly to pod IPs listed in endpoints
4. Compare behavior with non-headless Service

**Success criteria:** Endpoints show pod IPs; direct IP access works; DNS returns individual pod IPs.
  name: external-api
spec:
  type: ExternalName
  # CNAME to external service
  externalName: api.example.com
```

**Use case:** On-premises services need to resolve to cloud endpoints.
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-db-headless
spec:
  clusterIP: None  # headless service
  selector:
    app: my-db
```

**Use case:** Direct pod IP access, load balancing done by application.
    end
```

### Service Types and Discovery

| Service Type | Discovery Mechanism |
|--------------|---------------------|
| **ClusterIP** | Internal DNS resolution (`my-service.namespace.svc.cluster.local`) |
| **NodePort** | DNS + node IP:port lookup |
| **LoadBalancer** | Cloud DNS + load balancer DNS |
| **ExternalName** | CNAME to external DNS name |