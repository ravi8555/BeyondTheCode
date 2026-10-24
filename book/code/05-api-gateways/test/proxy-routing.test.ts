import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { startTestServer, makeApp } from './helpers/infra.js';
import { validateBearerToken } from '../src/gateway/auth.js';
import type { RateLimitResult } from '../src/gateway/rate-limit.js';

const fakeRateLimiter = {
  consume: async (): Promise<RateLimitResult> => ({
    allowed: true,
    remaining: 999,
    resetAt: Date.now() + 60_000,
  }),
};

function echoUpstream(port: number): Promise<{ close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ upstream: 'echo', ok: true }));
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({ close: () => new Promise((r) => server.close(r)) });
    });
  });
}

describe('proxy routing (integration against local upstreams)', () => {
  let formsClose: () => Promise<void>;
  let gatewayClose: () => Promise<void>;
  let gatewayUrl: string;

  beforeAll(async () => {
    await echoUpstream(31001); // forms stub
    await echoUpstream(31002); // submissions stub
    await echoUpstream(31003); // webhooks stub

    const { app, baseUrl, close } = await startTestServer(
      makeApp({
        rateLimiter: fakeRateLimiter,
        rateLimitMaxRequests: 1000,
        upstreams: {
          forms: { baseUrl: 'http://127.0.0.1:31001' },
          submissions: { baseUrl: 'http://127.0.0.1:31002' },
          webhooks: { baseUrl: 'http://127.0.0.1:31003' },
        },
      }).app,
    );
    gatewayUrl = baseUrl;
    gatewayClose = close;
  });

  afterAll(async () => {
    await gatewayClose();
  });

  it('routes /api/forms/* to the forms upstream', async () => {
    const res = await fetch(`${gatewayUrl}/api/forms/abc`, {
      headers: { authorization: `Bearer ${validToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upstream).toBe('echo');
  });

  it('routes /api/submissions/* to the submissions upstream', async () => {
    const res = await fetch(`${gatewayUrl}/api/submissions/xyz`, {
      headers: { authorization: `Bearer ${validToken()}` },
    });
    expect(res.status).toBe(200);
  });

  it('returns 401 without a valid JWT', async () => {
    const res = await fetch(`${gatewayUrl}/api/forms/abc`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${gatewayUrl}/api/nope`, {
      headers: { authorization: `Bearer ${validToken()}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('allows public submission create without a JWT', async () => {
    const res = await fetch(`${gatewayUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formId: 'f1' }),
    });
    expect(res.status).toBe(200);
  });
});

function validToken(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwt = require('jsonwebtoken');
  return jwt.sign({ sub: 'ws_1', role: 'owner' }, 'test-secret', {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}
