import type { Request, Response, NextFunction } from 'express';
import type { Limiter } from '../limiter/types.js';

export interface RateLimitRule {
  /** Appears in logs and metrics. */
  name: string;
  limit: number;
  windowMs: number;
  keyBuilder: (req: Request) => string;
  /**
   * Behavior when the limiter store is unavailable.
   * Default 'fail-closed' (safer). Override to 'fail-open' only when the
   * blast radius of unlimited traffic is smaller than the blast radius of
   * rejecting good clients — e.g. public form submissions (see chapter 01,
   * section 5/6, case 6).
   */
  failureMode?: 'fail-open' | 'fail-closed';
}

export function rateLimit(limiter: Limiter, rule: RateLimitRule) {
  const failureMode = rule.failureMode ?? 'fail-closed';
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `rl:${rule.name}:${rule.keyBuilder(req)}`;
    let decision;
    try {
      decision = await limiter.check(key, rule.limit, rule.windowMs);
    } catch (err) {
      // Production: structured logger (pino) + rate_limit_store_errors_total
      // metric + alert (chapter 01, section 5). console here for brevity.
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'rate_limit_store_error',
          rule: rule.name,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      if (failureMode === 'fail-closed') {
        res.status(503).json({ error: 'rate_limit_unavailable' });
        return;
      }
      return next(); // fail-open: allow; the limiter is advisory during outage
    }

    // Header shape follows the IETF RateLimit headers draft; verify its
    // current status before relying on it as a standard (chapter 01, s.3).
    res.setHeader('RateLimit-Limit', String(rule.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      res.setHeader('RateLimit-Reset', String(retryAfterSeconds));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
      });
      return;
    }
    next();
  };
}
