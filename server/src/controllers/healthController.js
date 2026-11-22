import { dbStatus } from '../config/db.js';

export function getHealth(req, res) {
  res.json({
    status: 'ok',
    service: 'healthtwin-server',
    uptimeSeconds: Math.round(process.uptime()),
    db: dbStatus(),
    time: new Date().toISOString(),
    notice: 'Simulated data for demonstration. Not a medical device.',
  });
}
