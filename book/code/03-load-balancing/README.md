# Chapter 03 — Load Balancing: Runnable Example

Nginx (open source, Layer 7) load balancing in front of **3 identical FormForge API instances**, each on its own port. Demonstrates round-robin distribution, passive health checks (`max_fails`/`fail_timeout`), and backend failover.

## Run

```bash
cp .env.example .env
docker compose up -d --build   # Nginx LB on :8080, 3 API instances on :3001-:3003

# Exercise the LB: 60 requests, observe distribution
for i in $(seq 1 60); do
  curl -s -o /dev/null -w "%{http_code} %{header_x-instance-id}\n" \
    http://localhost:8080/v1/forms/f1/submissions
done | sort | uniq -c -k2   # roughly 20 per instance

# Simulate a backend failure
curl -s -X POST http://localhost:3001/_test/fail
# Send traffic; after 3 failures Nginx marks api-1 down
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} %{header_x-instance-id}\n" \
    http://localhost:8080/v1/forms/f1/submissions
done

# Recover
curl -s -X POST http://localhost:3001/_test/recover
docker compose down
```

## Test

```bash
npm run typecheck
REQUIRE_INFRA=1 npm test   # CI: infra must be present
npm test                   # local: visible skips if Compose is down
```

Integration suites hit `localhost:8080` (Nginx) and the backend admin ports
`:3001-:3003` directly. The probe helper prints a warning and registers visible
`SKIPPED:` suites when Nginx is down; `REQUIRE_INFRA=1` fails CI instead.

## Honest notes

- open-source Nginx provides **passive** health checks (marks down after
  `max_fails` failed proxied requests). Active health probing is an Nginx Plus
  feature — this example uses passive checks, which is why the failover test
  sends real traffic to trigger the mark-down.
- `fail_timeout=10s` means a recovered backend is not re-added to rotation
  for up to 10 seconds — observable in the README steps above.
- This is a single-host simulation; it demonstrates LB *behavior* (algorithms,
  health checks, failover) but not production-scale performance.
