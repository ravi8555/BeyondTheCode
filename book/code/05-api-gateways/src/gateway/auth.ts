import { verify } from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // workspace id
  role: 'owner' | 'member' | 'viewer';
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  ok: boolean;
  payload?: JwtPayload;
  reason?: 'missing' | 'expired' | 'invalid';
}

/**
 * Validate a bearer JWT issued by FormForge's auth service.
 *
 * The gateway is the auth chokepoint: every mutating request must carry a valid
 * token. Public read endpoints (public form pages, public submission create) are
 * exempt — they are handled by the route matcher before auth runs.
 *
 * Returns { ok: true, payload } on success, or { ok: false, reason } on failure.
 * The reason is deliberately coarse so the gateway never leaks token internals
 * to the client.
 */
export function validateBearerToken(
  authHeader: string | undefined,
  secret: string,
): AuthResult {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const payload = verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    return { ok: true, payload };
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}
