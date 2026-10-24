import { describe, it, expect } from 'vitest';
import { resolveRoute } from '../src/gateway/route.js';

const upstreams = {
  forms: { name: 'forms', baseUrl: 'http://forms:3001' },
  submissions: { name: 'submissions', baseUrl: 'http://submissions:3002' },
  webhooks: { name: 'webhooks', baseUrl: 'http://webhooks:3003' },
};

describe('resolveRoute', () => {
  it('maps /api/forms/* to the forms service', () => {
    const m = resolveRoute('/api/forms/abc', upstreams);
    expect(m?.upstream.name).toBe('forms');
    expect(m?.path).toBe('/api/forms/abc');
  });

  it('maps /api/submissions/* to the submissions service', () => {
    const m = resolveRoute('/api/submissions/xyz', upstreams);
    expect(m?.upstream.name).toBe('submissions');
  });

  it('maps /api/webhooks/* to the webhooks service', () => {
    const m = resolveRoute('/api/webhooks/deliver', upstreams);
    expect(m?.upstream.name).toBe('webhooks');
  });

  it('returns null for unknown paths (no upstream to proxy to)', () => {
    expect(resolveRoute('/api/unknown', upstreams)).toBeNull();
    expect(resolveRoute('/healthz', upstreams)).toBeNull();
    expect(resolveRoute('/', upstreams)).toBeNull();
  });

  it('does not allow path traversal to reach an unconfigured host', () => {
    expect(resolveRoute('/api/forms/../../internal', upstreams)?.upstream.name).toBe('forms');
    // There is no upstream named 'internal'; resolveRoute only returns configured names.
    expect(resolveRoute('/api/whatever-internal', upstreams)).toBeNull();
  });
});
