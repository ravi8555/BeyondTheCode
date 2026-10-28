# 6. CI/CD

**BeyondTheCode Project - Chapter 6: CI/CD**

## 6.1 CI/CD Fundamentals

### What is CI/CD?
Continuous Integration (CI) and Continuous Deployment/Delivery (CD) are practices that enable development teams to deliver code changes more frequently and reliably.

- **Continuous Integration**: Developers frequently merge code changes into a shared repository, where automated builds and tests run
- **Continuous Deployment**: Every change that passes the pipeline is automatically deployed to production
- **Continuous Delivery**: Every change that passes the pipeline is automatically deployed to a staging or production-like environment

### CI/CD Pipeline Stages
1. **Source**: Code commit triggers the pipeline
2. **Build**: Compile code, download dependencies, create artifacts
3. **Test**: Run unit tests, integration tests, linting, code quality checks
4. **Deploy**: Deploy to environment (staging, development, production)
5. **Monitor**: Observe application health and performance

### Benefits of CI/CD
- Faster feedback on code changes
- Reduced integration risks
- Improved software quality
- Faster time to market
- Consistent deployment processes
## 6.2 CI/CD Tools

### Popular CI/CD Tools
- **GitHub Actions**: Native integration with GitHub, YAML-based workflows
- **GitLab CI/CD**: Built into GitLab, powerful pipeline editor
- **Jenkins**: Open-source, highly extensible, massive plugin ecosystem
- **CircleCI**: Cloud-native, fast execution, good Docker support
- **Azure DevOps Pipelines**: Integrated with Azure, multi-language support
- **Travis CI**: Simple cloud-based CI, GitHub focused

### GitHub Actions Workflow Example
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    
    steps:
      # Checkout code
      - name: Checkout repository
        uses: actions/checkout@v3
      
      # Set up Python
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      # Install dependencies
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      # Run linting
      - name: Lint with ruff
        run: ruff check .
      
      # Run unit tests
      - name: Run unit tests
        run: |
          python -m pytest -v
      
      # Build Docker image
      - name: Build Docker image
        run: |
          docker build -t myapp:${{ github.sha } } .
      
      # Push Docker image
      - name: Push Docker image
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push myapp:${{ github.sha } }
      
      # Deploy to staging
      - name: Deploy to staging
        if: github.ref == 'refs/heads/main'
        run: |
          kubectl apply -f k8s/staging
          kubectl rollout deployment/myapp -n staging
```
## 6.3 Docker-based CI/CD Pipeline

### Multi-stage Docker Build
```dockerfile
# Stage 1: Build
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /app/.pip /root/.pip
COPY . .
EXPOSE 8080
CMD ["python", "app.py"]
```

### Kubernetes Deployment with CI/CD
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myrepo/myapp:latest
        ports:
        - containerPort: 8080
        env:
        - name: ENVIRONMENT
          value: "production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: LoadBalancer
```
## 6.4 GitOps with Argo CD

### Argo CD Application Manifest
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/example/myapp.git
    targetRevision: HEAD
    path: k8s/
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

## 6.5 Comprehension Questions

1. What's the difference between Continuous Delivery and Continuous Deployment?
2. Which CI/CD tool would you choose for a team already using GitHub, and why?
3. What are the key differences between a monolithic pipeline and microservices-based pipeline?
4. Explain the concept of "shift left" in CI/CD.
5. What is the purpose of a Dockerfile multi-stage build?

## 6.6 Revision Sheet (Flashcards)

| Front | Back |
|-------|------|
| What does CI stand for? | Continuous Integration |
| What does CD stand for? | Continuous Deployment/Delivery |
| What is the main purpose of a CI pipeline? | Automated building and testing of code changes |
| What triggers a CI/CD pipeline? | Code commit, pull request, or schedule |
| Name three common CI/CD tools. | GitHub Actions, Jenkins, GitLab CI/CD, CircleCI, etc. |
| What is a Dockerfile multi-stage build? | A build strategy that uses multiple FROM statements to reduce final image size |
| What is the difference between liveness and readiness probes? | Liveness probe checks if the container is running; readiness probe checks if it's ready to serve traffic |
| What does GitOps mean? | Kubernetes configuration stored in Git, automatically synced by tools like Argo CD |
| What is the purpose of a service account in Kubernetes CI/CD? | Permissions for CI/CD tools to interact with the cluster |
| Name one benefit of implementing CI/CD. | Faster feedback, improved quality, reduced deployment risk, etc. |

## 6.7 Engineering Problems

1. **Flaky Tests in CI Pipeline** — Your CI pipeline has tests that occasionally fail even though the code is correct. Diagnose: investigate test ordering dependencies, add test isolation, implement retry mechanisms, ensure test data cleanup, check for race conditions, review test environment consistency.

2. **Slow Pipeline Performance** — Your CI pipeline takes over 30 minutes to complete, slowing down developer feedback. Diagnose: optimize build caching, parallelize test execution, use layer caching in Docker, remove unnecessary steps, upgrade runner resources, implement test filtering.

3. **Deployment Failure Due to Resource Limits** — Your Kubernetes deployment fails because of resource quota exceeded. Diagnose: review resource requests/limits, increase quota, optimize application memory usage, implement horizontal pod autoscaling, review namespace resource usage.

4. **Secret Management in CI/CD** — Your pipeline needs access to database credentials but you're hardcoding them in pipeline scripts. Diagnose: implement secret management with Vault, use Kubernetes secrets, integrate with cloud secret managers, avoid environment variable exposure, rotate credentials regularly.

5. **Rollback Strategy After Failed Deployment** — A new deployment caused service outages and you need to quickly rollback. Diagnose: implement canary deployments, maintain previous image tags, use Kubernetes rollout history, automate rollback triggers, document rollback procedures.
```