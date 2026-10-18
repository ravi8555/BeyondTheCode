import type { Request, Response, NextFunction } from 'express';
import type { Limiter } from '../limiter/types.js';
import { logger as defaultLogger } from '../logger.js';
import { metrics as defaultMetrics } from '../metrics.js';
import type { MetricsSink } from '../metrics.js';

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

/** Injection points for observability; defaults are module singletons.
 *  Tests pass a silent logger and an isolated counter registry. */
export interface RateLimitDeps {
  logger?: { error: (obj: object, msg?: string) => void };
  metrics?: MetricsSink;
}

export function rateLimit(limiter: Limiter, rule: RateLimitRule, deps: RateLimitDeps = {}) {
  const failureMode = rule.failureMode ?? 'fail-closed';
  const log = deps.logger ?? defaultLogger;
  const counters = deps.metrics ?? defaultMetrics;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `rl:${rule.name}:${rule.keyBuilder(req)}`;
    let decision;
    try {
      decision = await limiter.check(key, rule.limit, rule.windowMs);
    } catch (err) {
      // Structured log + metric (chapter 01, section 5); alert on the
      // counter in production — silent fail-open is an unenforced limiter.
      counters.inc('rate_limit_store_errors_total', { rule: rule.name });
      log.error(
        {
          event: 'rate_limit_store_error',
          rule: rule.name,
          error: err instanceof Error ? err.message : String(err),
        },
        'rate limiter store unavailable',
      );
      if (failureMode === 'fail-closed') {
        counters.inc('rate_limit_decisions_total', { rule: rule.name, action: 'store_error_503' });
        res.status(503).json({ error: 'rate_limit_unavailable' });
        return;
      }
      counters.inc('rate_limit_decisions_total', { rule: rule.name, action: 'fail_open_allow' });
      return next(); // fail-open: allow; the limiter is advisory during outage
    }

    // Header shape follows the IETF RateLimit headers draft; verify its
    // current status before relying on it as a standard (chapter 01, s.3).
    // Semantics implemented here: RateLimit-Reset = delta-seconds until the
    // window's limit resets (NOT an epoch timestamp).
    res.setHeader('RateLimit-Limit', String(rule.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      res.setHeader('RateLimit-Reset', String(retryAfterSeconds));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      counters.inc('rate_limit_decisions_total', { rule: rule.name, action: 'deny' });
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
      });
      return;
    }
    counters.inc('rate_limit_decisions_total', { rule: rule.name, action: 'allow' });
    next();
  };
}
