import express from 'express';
import type { FormCache } from './form-cache.js';
import type { FormStore } from './db.js';
import type { MetricsSink } from './metrics.js';

/** Bounded key space BEFORE input becomes part of a cache key (ch 02, s.2). */
const SLUG_RE = /^[a-z0-9-]{1,64}$/;

export interface AppOptions {
  formCache: FormCache;
  store: FormStore;
  metrics: MetricsSink;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/v1/forms/:slug', async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ error: 'invalid_slug' });
      return;
    }
    try {
      const result = await opts.formCache.getBySlug(slug);
      const xCache =
        result.kind === 'not_found'
          ? result.source === 'hit'
            ? 'NEG'
            : 'MISS'
          : result.source === 'hit'
            ? 'HIT'
            : result.source === 'stale'
              ? 'STALE'
              : 'MISS';
      res.setHeader('X-Cache', xCache);
      if (result.kind === 'not_found') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      // Public, revalidating client cache (Scenario A of the chapter).
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
      res.json(result.form);
    } catch (err) {
      // Only the DB can still fail here (cache errors are absorbed).
      opts.metrics.inc('http_errors_total', { route: 'get_form' });
      opts.metrics.inc('db_errors_total', { route: 'get_form' });
      res.status(503).json({ error: 'upstream_unavailable' });
    }
  });

  app.patch('/v1/forms/:slug', async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ error: 'invalid_slug' });
      return;
    }
    const title = (req.body as { title?: unknown } | undefined)?.title;
    if (typeof title !== 'string' || title.length < 1 || title.length > 200) {
      res.status(400).json({ error: 'invalid_title' });
      return;
    }
    // Production: authenticate + authorize against workspace_id here
    // (omitted in this minimal example — see chapter 02, section 5).
    try {
      const updated = await opts.store.updateTitle(slug, title);
      if (!updated) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      // Cache-aside write path: DB first, then delete-on-write.
      await opts.formCache.invalidate(slug);
      res.json({ ok: true, slug, title });
    } catch (err) {
      opts.metrics.inc('http_errors_total', { route: 'patch_form' });
      res.status(503).json({ error: 'upstream_unavailable' });
    }
  });

  return app;
}
