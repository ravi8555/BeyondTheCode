# Chapter 06 — CI/CD: Runnable Example

**FormForge CI/CD pipeline companion code** — a small Express API with:
- **Health check** endpoint (`/healthz`) for liveness/readiness probes
- **Deployment version** header (`X-Deploy-Version`) for rollout verification
- **Structured logging** and **metrics counters** for CI observability
- **Multi-stage Docker build** (builder → runtime)
- **GitHub Actions workflow** (build → test → scan → deploy to staging)
- **Kubernetes manifests** (Deployment, Service, ArgoCD Application)

Companion code for `book/01-traffic-management/06-ci-cd.md`.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev              # http://localhost:3000

# Health check
curl http://localhost:3000/healthz

# See deployment version header
curl -i http://localhost:3000/api/v1/status
```

## Docker (multi-stage)

```bash
# 1. Compile TypeScript first
npm run build

# 2. Build the Docker image
docker build -t formforge-ci-cd-example:latest .

# 3. Run the container
docker run --rm -p 3000:3000 --env-file .env formforge-ci-cd-example:latest
```

## Local services (Redis for caching, Postgres for demo data)

```bash
docker compose up -d
```

## Test

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (skips CI-gated suites without secrets)

# CI mode: REQUIRES DOCKER_HUB_TOKEN and KUBECONFIG
REQUIRE_CI_SECRETS=1 npm test
```

## Honest notes

- Targets Node 20+ / TypeScript 5 / Express 4 / pino / vitest.
- `Dockerfile` uses two stages: `builder` (installs prod deps, copies pre-built `dist/`) → `runtime` (copies only `dist/` + `package.json`, ~60 MB smaller image). TypeScript is pre-compiled on the host (`npm run build`) before `docker build`, which mirrors CI/CD best practices (compile in CI, package in Docker).
- GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs on push/PR: lint → typecheck → unit test → Docker build → Trivy scan → (main only) deploy to staging via `kubectl`.
- Argo CD Application manifest (`k8s/argocd-app.yaml`) enables GitOps sync from this repo to the cluster.
- Secrets (Docker Hub token, kubeconfig) are **never** committed; inject via GitHub Secrets or local env.
- Production concerns beyond this example (canary, rollout strategies, secret rotation, OPA policy, cost alerts) are listed in chapter 06, section 7.