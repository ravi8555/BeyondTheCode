import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { metrics } from '../src/metrics.js';

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('increments health check counter', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    await request(app).get('/healthz');
    expect(metrics.get('health_check_requests_total', { endpoint: '/healthz' })).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/status', () => {
  it('returns deploy version and environment', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'abc1234',
    });
    const res = await request(app).get('/api/v1/status');
    expect(res.status).toBe(200);
    expect(res.body.deployVersion).toBe('abc1234');
    expect(res.body.environment).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('sets X-Deploy-Version header', async () => {
    process.env.DEPLOY_VERSION = 'test-sha-123';
    const app = createApp({
      port: 3000,
      deployVersion: 'test-sha-123',
    });
    const res = await request(app).get('/api/v1/status');
    expect(res.headers['x-deploy-version']).toBe('test-sha-123');
    expect(res.headers['x-deploy-env']).toBeDefined();
    delete process.env.DEPLOY_VERSION;
  });

  it('increments status request counter', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    await request(app).get('/api/v1/status');
    expect(metrics.get('status_requests_total')).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/items', () => {
  it('returns items array', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    const res = await request(app).get('/api/v1/items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('500 error handler', () => {
  it('returns 500 on unhandled errors', async () => {
    const app = createApp({
      port: 3000,
      deployVersion: 'test-v1',
    });
    // Force an error by accessing a route that throws
    app.get('/api/v1/error', () => {
      throw new Error('test error');
    });
    const res = await request(app).get('/api/v1/error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_server_error');
  });
});