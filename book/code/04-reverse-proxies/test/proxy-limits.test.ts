import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { probeProxy, proxyBase } from './helpers/infra.js';

const proxy = proxyBase();
const up = await probeProxy();

describe.runIf(up !== false)('proxy limits (real Nginx + backend)', () => {
  it('rejects oversized bodies at the proxy with 413', async () => {
    const big = 'x'.repeat(300 * 1024); // 300 KiB > client_max_body_size 256k
    const res = await request(proxy)
      .post('/api/upload')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: big }));
    expect(res.status).toBe(413);
  });

  it('accepts small bodies through to the backend', async () => {
    const res = await request(proxy)
      .post('/api/upload')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ hello: 'world' }));
    expect(res.status).toBe(201);
    expect(typeof res.body.receivedBytes).toBe('number');
  });
});

describe.runIf(up === false)('SKIPPED: proxy limits (Nginx unreachable)', () => {
  it('visible skip marker — bring the stack up and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
