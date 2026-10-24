import express from 'express';
import type { AppConfig } from './config.js';

export interface AppDeps {
  config: AppConfig;
}

/**
 * FormForge API backend behind the reverse proxy.
 *
 * The proxy chapter's observables:
 * - /healthz — liveness for the proxy operator and orchestrator.
 * - /api/echo — echoes what the app *believes* about the request
 *   (client IP, protocol, host) so tests can assert the forwarded
 *   headers survive the proxy hop and trust-proxy is correct.
 * - /api/forms/:formId — representative resource route (201 Created).
 * - /api/upload — bounded body route proving client_max_body_size
 *   rejects oversized payloads at the proxy with 413.
 */
export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);
  // Small JSON cap: the proxy enforces 256k first; this is defense in depth.
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/echo', (req, res) => {
    res.status(200).json({
      // .ip/.protocol/.hostname derive from trust-proxy + forwarded headers.
      ip: req.ip,
      protocol: req.protocol,
      host: req.hostname,
      forwardedFor: req.headers['x-forwarded-for'] ?? null,
      realIp: req.headers['x-real-ip'] ?? null,
    });
  });

  app.get('/api/forms/:formId', (req, res) => {
    res.status(200).json({
      id: req.params.formId,
      title: 'Contact us',
      // Echo what the app believes — proves Host/proto survived the hop.
      seenHost: req.hostname,
      seenProtocol: req.protocol,
    });
  });

  app.post('/api/upload', (req, res) => {
    const size = Number(req.headers['content-length'] ?? 0);
    res.status(201).json({ receivedBytes: size });
  });

  // Unknown /api paths: JSON 404 (never an HTML stack trace).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
