/**
 * Limiter abstraction: the middleware depends on this interface, never on
 * Redis directly. Unit tests inject fakes; routes can swap algorithms.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Best-effort estimate of requests left in the current effective window. */
  remaining: number;
  /** Milliseconds until the client should retry (0 when allowed). */
  retryAfterMs: number;
}

export interface Limiter {
  /**
   * @param key fully-built limit key, e.g. "rl:form-submit:f1:203.0.113.9"
   * @param cost weight of this request (heavy routes can cost > 1)
   */
  check(key: string, limit: number, windowMs: number, cost?: number): Promise<RateLimitDecision>;
}
