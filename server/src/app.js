// Builds the Express app: CORS, JSON parsing, routes, the Socket.IO test page and error handling.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedOrigins } from './config/cors.js';
import healthRoutes from './routes/health.routes.js';
import hospitalRoutes from './routes/hospital.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Only the configured frontend origin(s) may call the API from a browser.
  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Development only: serves public/socket-test.html at http://localhost:5000/socket-test.html
  // (same origin as the API, so CORS does not block it).
  if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, '..', 'public')));
  }

  app.use('/api/health', healthRoutes);
  app.use('/api/hospitals', hospitalRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
