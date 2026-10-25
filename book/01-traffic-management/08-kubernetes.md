## 8.1 Kubernetes Architecture Fundamentals

### Control Plane vs Worker Nodes

```mermaid
graph TD
    subgraph Control Plane
        direction TB
        A[api-server] -->|validates&stores| B[etcd]
        B --> C[scheduler]
        C --> D[controller-manager]
        D -->|reconciles state| E[controller]
    subgraph Worker Nodes
        direction TB
        F[kubelet] -->|manages pods| G[pod]
        G -->|runs containers| H[container runtime]
        F -->|reports status| I[metrics-server]
    end
    E -->|updates desired| F
```

### Key Concepts

| Term | Description |
|------|-------------|
| **Pod** | Smallest deployable unit; one or more containers |
| **Deployment** | Managing stateless apps with ReplicaSet |
| **Service** | Stable network endpoint for pods (ClusterIP, NodePort, LoadBalancer) |
| **Ingress** | HTTP/HTTPS routing to services (with TLS termination) |
| **Namespace** | Virtual cluster partitioning within a cluster |
| **Label/Selector** | Key-value pairs for organizing and selecting objects |
| **Volume** | Persistent data mounting outside container filesystem |

### kubectl Essential Commands

| Command | Description |
|---------|-------------|
| `kubectl get pods` | List pods in current namespace |
## 8.2 Working with Deployments

### Basic Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
  labels:
    app: my-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-service
  template:
    metadata:
      labels:
        app: my-service
    spec:
      containers:
        - name: my-service
          image: myregistry.io/my-service:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
```

### Rolling Update Strategy

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Rollback

```bash
## 8.3 Services and Networking

### Service Types

| Service Type | Exposes To | External Access |
|--------------|------------|-----------------|
| **ClusterIP** | Internal cluster only | None (internal only) |
| **NodePort** | Port on each node | `http://<node-ip>:<nodePort>` |
| **LoadBalancer** | Cloud provider LB | `https://<lb-ip>:<port>` |
| **ExternalName** | CNAME to external DNS | `kubectl get externalname` |

### Ingress with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-service-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  tls:
    - hosts:
        - my-service.example.com
      secretName: my-service-tls
  rules:
    - host: my-service.example.com
      http:
        paths:
        - path: /
          pathType: Prefix
          backend:
            service:
## 8.4 Secrets and ConfigMaps

### ConfigMap (non-sensitive config)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-service-config
data:
  # Use as environment variables
  DATABASE_URL: "postgresql://db:5432/mydb"
  LOG_LEVEL: "info"
  # Use as files in volume
  .re2c:
    content: "buffer_size=4096"
```

### Secret (sensitive data - base64 encoded)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-service-secrets
type: Opaque
data:
  # Keys are base64 encoded values
  username: YWRtaW4=
  password: cGFzc3dvcmQ=
```

### Using Secrets as Environment Variables

```yaml
env:
## 8.5 Hands-On Exercises

### Beginner: Create and Run a Deployment

1. Create a Deployment from manifest: `kubectl apply -f deployment.yaml`
2. Verify pods are running: `kubectl get pods`
3. Expose as Service: `kubectl expose deployment my-service --port=8080 --type=ClusterIP`
4. Check Service: `kubectl get services`
5. View logs: `kubectl logs -l app=my-service`

**Success criteria:** Deployment has 3 ready pods; Service is ClusterIP; logs accessible.

### Intermediate: Configure Probes and Resources

1. Create a Deployment with liveness/readiness probes and resource limits
2. Simulate crash: `kubectl delete pod <pod-name>` (kubelet restarts it)
3. Observe kubelet restart behavior and backoff period
4. Update resource limits and verify pod scheduling

**Success criteria:** Pod restarts on liveness probe failure; readiness probe prevents traffic until healthy; resources fit within node constraints.

## 8.6 Chapter Summary

### Key Takeaways (5 points)

1. **Kubernetes = declarative infrastructure** — define desired state, controller reconciles to actual state
2. **Pods are ephemeral** — use Deployments for management; never manage pods directly
3. **Probes protect the system** — liveness/readiness/startup probes prevent cascading failures
4. **Resources affect scheduling** — requests/limits determine pod placement and QoS tier
5. **Services provide stable networking** — ClusterIP/NodePort/LoadBalancer/Ingress for different access patterns

### Kubernetes Object Quick Reference

| Object | API Version | Primary Purpose |
|--------|-------------|-----------------|
| `Pod` | v1 | Smallest unit; one or more containers |
| `Deployment` | apps/v1 | Manage stateless app replicas with rolling updates |
| `Service` | v1 | Stable network endpoint (ClusterIP, NodePort, LB) |
| `Ingress` | networking.k8s.io/v1 | HTTP/HTTPS routing with TLS termination |
| `ConfigMap` | v1 | Non-sensitive configuration data |
| `Secret` | v1 | Sensitive data (base64 encoded) |
| `Namespace` | v1 | Virtual cluster partitioning |
| `Role/RoleBinding` | rbac.authorization.k8s.io/v1 | Authorization within namespace |

### Comprehension Questions

1. What's the difference between a Pod and a Deployment?
2. How do liveness, readiness, and startup probes differ in their purpose?
3. What are the four main Service types and when would you use each?
4. How does a RollingUpdate strategy differ from an OnDelete strategy?
5. What's the difference between a ConfigMap and a Secret?

### Revision Sheet (Flashcards)

| Front | Back |
|-------|------|
| What is the smallest deployable unit in Kubernetes? | Pod |
| What does a Deployment manage? | ReplicaSet and pod lifecycle with rolling updates |
| What Service type exposes traffic only within the cluster? | ClusterIP |
| What Ingress annotation configures TLS termination? | kubernetes.io/ingress.class or nginx.ingress.kubernetes.io/rewrite-target |
| What key is used to add labels to a pod template? | `metadata.labels` |
| What does `resources.requests` determine? | Minimum resources guaranteed for pod scheduling |
| What does `resources.limits` enforce? | Maximum resources a container can use |
| What probe runs once at startup before liveness/readiness checks? | startupProbe |
| What does `kubectl rollout undo` do? | Reverts the Deployment to the previous revision |
| What is the default Service type when using `kubectl expose`? | ClusterIP |

### Engineering Problems (Solve These)

1. **CrashLoopBackOff** — Your pod is in CrashLoopBackOff. Diagnose: check container logs with `kubectl logs`, examine health probe configuration, verify image existence and tag, check resource limits causing OOMkill.

2. **OOMKilled** — Container was terminated due to out-of-memory. Diagnose: increase memory limits, add swap, review memory leak in application, adjust resource requests vs limits.

3. **ImagePullBackOff** — kubecan't pull the container image. Diagnose: check image name/tag, verify registry credentials in ImagePullSecret, ensure network access to registry, check image pull policy.

4. **Service external traffic not reaching pods** — NodePort or LoadBalancer created but traffic can't reach services. Diagnose: check Service type, endpoint addresses, node firewall rules, cloud provider LB configuration, ingress controller status.

5. **Rolling update stalls** — Deployment rollout stuck at 0% or 100%. Diagnose: check pod status, probe configurations, resource constraints, and manually unblock by marking revision complete with `kubectl rollout pause`/`resume`.
### Advanced: Rolling Updates and Rollbacks

1. Create a Deployment with 2 replicas
2. Simulate an update: modify the image tag in the manifest and `kubectl apply -f`
3. Monitor rollout status: `kubectl rollout status deployment/my-service`
4. Introduce a bad version and observe rollback: `kubectl rollout undo deployment/my-service`
5. Verify service availability throughout the update process

**Success criteria:** Rolling update completes with zero downtime; rollback restores previous version; service remains available.
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: my-service-secrets
        key: username
```
              name: my-service
              port:
                number: 8080
```
# View revision history
kubectl rollout history deployment/my-service

# Rollback to previous version
kubectl rollout undo deployment/my-service

# Rollback to specific revision
kubectl rollout undo deployment/my-service --to-revision=2
```
| `kubectl describe pod <name>` | Show detailed pod information |
| `kubectl logs <pod>` | Stream container logs |
| `kubectl exec -it <pod> -- /bin/bash` | Execute command inside container |
| `kubectl apply -f <file>` | Apply configuration from file |
| `kubectl delete <resource> <name>` | Delete a resource |
| `kubectl get all` | List all resources (pods, services, deployments) |