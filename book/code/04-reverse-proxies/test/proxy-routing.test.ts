import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { probeProxy, proxyBase } from './helpers/infra.js';

const proxy = proxyBase();
const up = await probeProxy();

describe.runIf(up !== false)('proxy routing (real Nginx + backend)', () => {
  it('answers /healthz itself without touching the backend', async () => {
    const res = await request(proxy).get('/healthz');
    expect(res.status).toBe(200);
    // text/plain bodies arrive on res.text; fall back to raw text defensively.
    expect(res.text ?? '').toMatch(/proxy ok/);
  });

  it('proxies /api/forms/:formId to the backend', async () => {
    const res = await request(proxy).get('/api/forms/f1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('f1');
  });

  it('treats trailing slash consistently (no silent rewrite)', async () => {
    const plain = await request(proxy).get('/api/forms/f1');
    const slashed = await request(proxy).get('/api/forms/f1/');
    // Express strict routing is off: both reach the app. The point is the
    // proxy must not invent a DIFFERENT answer for the two spellings.
    expect(plain.status).toBe(slashed.status);
  });

  it('serves / itself without proxying (static edge content)', async () => {
    const res = await request(proxy).get('/');
    expect(res.status).toBe(200);
    expect(res.text ?? '').toMatch(/formforge/i);
  });

  it('returns JSON 404 for unknown /api paths', async () => {
    const res = await request(proxy).get('/api/nope-not-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe.runIf(up === false)('SKIPPED: proxy routing (Nginx unreachable)', () => {
  it('visible skip marker — bring the stack up and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
