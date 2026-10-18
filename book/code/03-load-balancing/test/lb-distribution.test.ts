import { describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import { probeLb } from './helpers/infra.js';

const lb = 'http://127.0.0.1:8080';
const up = await probeLb();

afterAll(async () => {
  // nothing to teardown; Docker Compose owns the containers
});

describe.runIf(up !== false)('LB distribution (real Nginx + 3 backends)', () => {
  it('round robins across all 3 healthy instances', async () => {
    const counts: Record<string, number> = {};
    const N = 60;
    const statuses: number[] = [];

    for (let i = 0; i < N; i++) {
      const res = await request(lb).get('/v1/forms/f1/submissions');
      statuses.push(res.status);
      const id = res.headers['x-instance-id'];
      if (typeof id === 'string') {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }

    // Every request should succeed (all 3 backends healthy).
    expect(statuses.every((s) => s === 201)).toBe(true);
    // All 3 instances should have been selected.
    expect(Object.keys(counts).sort()).toEqual(['api-1', 'api-2', 'api-3']);
    // Roughly even: each instance within ±8 of N/3 = 20.
    for (const id of ['api-1', 'api-2', 'api-3'] as const) {
      expect(counts[id] ?? 0).toBeGreaterThanOrEqual(12);
      expect(counts[id] ?? 0).toBeLessThanOrEqual(28);
    }
  });

  it('includes X-Instance-Id on every response', async () => {
    const res = await request(lb).get('/v1/forms/f1/submissions');
    expect(res.status).toBe(201);
    expect(res.headers['x-instance-id']).toMatch(/^api-[123]$/);
  });

  it('health endpoint returns 200', async () => {
    const res = await request(lb).get('/healthz');
    expect(res.status).toBe(200);
  });
});

describe.runIf(up === false)('SKIPPED: LB distribution (Nginx unreachable)', () => {
  it('visible skip marker — `docker compose up -d` and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
