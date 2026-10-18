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
   * `limit` and `windowMs` are algorithm *hints*: implementations configured
   * at factory time (e.g. the token bucket, whose capacity/refill are fixed
   * in its options) may ignore them; the middleware always passes its
   * rule's values, so callers never omit them.
   *
   * @param key fully-built limit key, e.g. "rl:form-submit:f1:203.0.113.9"
   * @param cost weight of this request (heavy routes can cost > 1)
   */
  check(key: string, limit: number, windowMs: number, cost?: number): Promise<RateLimitDecision>;
}
