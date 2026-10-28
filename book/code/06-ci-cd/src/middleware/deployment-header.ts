import type { Request, Response, NextFunction } from 'express';
import { metrics } from '../metrics.js';
import { logger } from '../logger.js';

export interface DeploymentHeaderDeps {
  logger?: typeof logger;
  metrics?: typeof metrics;
}

/**
 * Middleware that stamps every response with the deployed version.
 * CI injects DEPLOY_VERSION (git SHA) at build time; this header lets
 * operators and ArgoCD verify which rollout is actually serving traffic.
 */
export function deploymentHeader(deps: DeploymentHeaderDeps = {}) {
  const log = deps.logger ?? logger;
  const counters = deps.metrics ?? metrics;
  return (_req: Request, res: Response, next: NextFunction): void => {
    const version = process.env.DEPLOY_VERSION ?? 'unknown';
    const env = process.env.NODE_ENV ?? 'development';
    res.setHeader('X-Deploy-Version', version);
    res.setHeader('X-Deploy-Env', env);
    counters.inc('deployment_header_set_total', { version, env });
    log.debug({ event: 'deployment_header', version, env });
    next();
  };
}