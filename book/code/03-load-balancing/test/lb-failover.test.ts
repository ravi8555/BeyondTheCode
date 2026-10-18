import { describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import { probeLb } from './helpers/infra.js';

const lb = 'http://127.0.0.1:8080';
// Backend instances are also mapped to host ports for direct test access.
const api1 = 'http://127.0.0.1:3001';
const api2 = 'http://127.0.0.1:3002';
const api3 = 'http://127.0.0.1:3003';

const up = await probeLb();

afterAll(async () => {
  // best-effort: make sure no backend is left in fail mode between runs
  try {
    await request(api1).post('/_test/recover');
  } catch {}
  try {
    await request(api2).post('/_test/recover');
  } catch {}
  try {
    await request(api3).post('/_test/recover');
  } catch {}
});

describe.runIf(up !== false)('LB failover (real Nginx passive health checks)', () => {
  it('marks a failing backend down and excludes it after max_fails', async () => {
    // 1. Make api-1 fail on every request.
    const failRes = await request(api1).post('/_test/fail');
    expect(failRes.status).toBe(200);
    expect(failRes.body.failMode).toBe(true);

    // 2. Fire requests through the LB as fast as possible. Nginx round robins;
    //    api-1 returns 500. After max_fails=3 failures within fail_timeout,
    //    Nginx marks api-1 down and stops sending it traffic.
    //    (proxy_next_upstream http_500 in nginx.conf is what makes a backend
    //    *returning* 500 count as a failure; tries 1 disables the retry so
    //    the client still sees the 500 as-is with no retry amplification.)
    const results = await Promise.all(
      Array.from({ length: 30 }, () => request(lb).get('/v1/forms/f1/submissions')),
    );

    const instanceCounts: Record<string, number> = {};
    let api1Attempts = 0;
    let api1Successes = 0;
    let api1Failures = 0;

    for (const res of results) {
      const id = res.headers['x-instance-id'];
      if (typeof id !== 'string') continue;
      instanceCounts[id] = (instanceCounts[id] ?? 0) + 1;
      if (id === 'api-1') {
        api1Attempts++;
        if (res.status === 201) api1Successes++;
        if (res.status === 500) api1Failures++;
      }
    }

    // api-1 should be excluded quickly: at most a handful of attempts
    // (concurrent in-flight requests may exceed max_fails by a little),
    // and it must never return a success once marked down.
    expect(api1Attempts).toBeLessThanOrEqual(6);
    expect(api1Successes).toBe(0);

    // The other two backends absorbed the traffic.
    const others = (instanceCounts['api-2'] ?? 0) + (instanceCounts['api-3'] ?? 0);
    expect(others).toBeGreaterThanOrEqual(24); // 30 - at most 6 to api-1
    expect(instanceCounts['api-2'] ?? 0).toBeGreaterThan(0);
    expect(instanceCounts['api-3'] ?? 0).toBeGreaterThan(0);

    // 3. Recover api-1.
    const rec = await request(api1).post('/_test/recover');
    expect(rec.status).toBe(200);
    expect(rec.body.failMode).toBe(false);

    // Note: Nginx keeps api-1 down for fail_timeout (10s) before retrying,
    // so a follow-up distribution test immediately after this one may still
    // see only api-2/api-3 for several seconds.
  });
});

describe.runIf(up === false)('SKIPPED: LB failover (Nginx unreachable)', () => {
  it('visible skip marker — `docker compose up -d` and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
