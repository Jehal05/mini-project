import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middleware/index.js';
import apiRouter from './routes/index.js';

/** `extraApi`: an Express router mounted at /api after the identity routes (monitoring, detection, emergency). */
export function createApp({ extraApi, staticDir = config.staticDir } = {}) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Map tiles are images from the tile server (feature 55). Add hosts with TILE_HOSTS (space separated) if you use another.
  const tileHosts = ['https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', ...(process.env.TILE_HOSTS ?? '').split(/\s+/).filter(Boolean)];
  const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
  app.use(helmet({ contentSecurityPolicy: { directives: { ...directives, 'img-src': ["'self'", 'data:', 'blob:', ...tileHosts] } } }));
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  // Backup check and restore take a whole database file, so that route reads its own larger body (routes/admin.routes.js).
  const smallJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.path.startsWith('/api/admin/backup/') ? next() : smallJson(req, res, next)));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);
  if (extraApi) app.use('/api', extraApi);

  // Single-origin deployment: serve the built frontend and fall back to index.html for client-side routes.
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: config.isProd ? '1h' : 0 }));
    app.get(/^\/(?!api(\/|$)|socket\.io(\/|$)).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
