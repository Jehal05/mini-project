import http from 'http';
import app, { monitoringMount } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './sockets/index.js';
import { startNoAnswerScheduler } from './services/notifications.js';
import { startAmbulanceSimulator } from './services/simulator.js';
import { attachMonitoring } from './monitoring/index.js';

async function start() {
  await connectDB();

  const httpServer = http.createServer(app);
  const io = initSocket(httpServer, { corsOrigin: env.clientUrl });

  const monitoring = await attachMonitoring({ app: monitoringMount, io });
  const stopScheduler = startNoAnswerScheduler();
  const stopSimulator = startAmbulanceSimulator();

  httpServer.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    stopScheduler();
    monitoring.stop();
    stopSimulator();
    io.close();
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Force exit if connections hang.
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
