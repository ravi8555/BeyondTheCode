import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { probeProxy, proxyBase } from './helpers/infra.js';

const proxy = proxyBase();
const up = await probeProxy();

describe.runIf(up !== false)('forwarded headers (real Nginx + backend)', () => {
  it('forwards Host, scheme, and client address to the backend', async () => {
    const res = await request(proxy)
      .get('/api/echo')
      .set('Host', 'forms.example.com');
    expect(res.status).toBe(200);
    // The app reconstructs client truth from the forwarded headers.
    expect(res.body.host).toBe('forms.example.com');
    expect(res.body.protocol).toBe('http');
    expect(typeof res.body.forwardedFor).toBe('string');
    expect((res.body.forwardedFor as string).length).toBeGreaterThan(0);
    expect(typeof res.body.realIp).toBe('string');
  });

  it('does not let a client spoof a trusted X-Forwarded-For past the proxy', async () => {
    // The proxy APPENDS the real peer address ($proxy_add_x_forwarded_for),
    // so a forged header becomes "..., real-ip" — the app must read the
    // LAST (rightmost, proxy-added) entry, never the first.
    const res = await request(proxy)
      .get('/api/echo')
      .set('X-Forwarded-For', '9.9.9.9');
    expect(res.status).toBe(200);
    const xff = res.body.forwardedFor as string;
    const parts = xff.split(',').map((s: string) => s.trim());
    expect(parts[parts.length - 1]).not.toBe('9.9.9.9');
    expect(parts).toContain('9.9.9.9');
  });

  it('sets X-Request-Id for correlation on proxied responses', async () => {
    const res = await request(proxy).get('/api/forms/f1');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('sets security headers on proxied responses', async () => {
    const res = await request(proxy).get('/api/forms/f1');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

describe.runIf(up === false)('SKIPPED: forwarded headers (Nginx unreachable)', () => {
  it('visible skip marker — bring the stack up and re-run; REQUIRE_INFRA=1 fails instead', () => {
    expect(true).toBe(true);
  });
});
