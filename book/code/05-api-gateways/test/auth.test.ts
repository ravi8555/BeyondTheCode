import { describe, it, expect } from 'vitest';
import { validateBearerToken } from '../src/gateway/auth.js';

const SECRET = 'test-secret';

function makeToken(payload: object): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

describe('validateBearerToken', () => {
  it('accepts a valid bearer token', () => {
    const token = makeToken({ sub: 'ws_1', role: 'owner' });
    const result = validateBearerToken(`Bearer ${token}`, SECRET);
    expect(result.ok).toBe(true);
    expect((result.payload as { sub: string }).sub).toBe('ws_1');
  });

  it('rejects missing token', () => {
    const result = validateBearerToken(undefined, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('rejects missing Bearer prefix', () => {
    const result = validateBearerToken('some-random-string', SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('rejects an invalid token', () => {
    const result = validateBearerToken('Bearer not-a-real-token', SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid');
  });

  it('rejects a token signed with a different secret', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 'ws_1' }, 'wrong-secret');
    const result = validateBearerToken(`Bearer ${token}`, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid');
  });
});
