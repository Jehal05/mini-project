// Entry point: loads .env, connects to MongoDB, starts Express + Socket.IO on one HTTP server.
import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './socket/index.js';

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    await connectDB(process.env.MONGO_URI);
  } catch (err) {
    console.error('[server] Could not connect to MongoDB:', err.message);
    console.error('[server] Check MONGO_URI in .env and that MongoDB is running.');
    process.exit(1);
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`[server] HealthTwin API on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[server] Socket test page: http://localhost:${PORT}/socket-test.html`);
    }
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
