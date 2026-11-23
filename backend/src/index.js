import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { config } from './config/env.js';
import { createMonitoring } from './monitoring.js';
import { startScheduledBackups } from './services/backup.js';

await connectDb();

// One HTTP server for the REST API and Socket.IO. Puneet's hospital search plugs in as `discovery`.
const monitoringIo = { cors: { origin: config.clientOrigin, credentials: true } };
const httpServer = http.createServer();
const io = new Server(httpServer, monitoringIo);
const monitoring = await createMonitoring({ io, autoStart: process.env.MONITORING !== 'off' });
const app = createApp({ extraApi: monitoring.extraApi });
httpServer.on('request', app);

httpServer.listen(config.port, () => console.log(`HealthTwin API listening on :${config.port} (${config.env})`));

// Feature 99: a dump every day when BACKUP_DIR is set; the newest 7 are kept.
const backups = startScheduledBackups({ dir: process.env.BACKUP_DIR });

const shutdown = () => { backups.stop(); monitoring.stop(); io.close(); httpServer.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
