import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middleware/index.js';
import apiRouter from './routes/index.js';

/** `extraApi`: an Express router mounted at /api after the identity routes (monitoring, detection, emergency). */
export function createApp({ extraApi } = {}) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  // Backup check and restore take a whole database file, so that route reads its own larger body (routes/admin.routes.js).
  const smallJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.path.startsWith('/api/admin/backup/') ? next() : smallJson(req, res, next)));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);
  if (extraApi) app.use('/api', extraApi);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
