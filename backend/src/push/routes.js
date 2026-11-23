// Web Push endpoints. Mounted by monitoring.js under /api/push.
//   GET    /push/public-key           anyone      { enabled, publicKey }
//   POST   /push/subscribe            hospital    { subscription }   a staff device
//   POST   /push/contact/:token       the token   { subscription }   a contact's device, from the status link
//   POST   /push/unsubscribe          anyone      { endpoint }
import express from 'express';
import { authenticate } from '../middleware/authenticate.js';

export function createPushRouter({ pusher }) {
  const router = express.Router();
  router.use(express.json());
  router.get('/push/public-key', (_req, res) => res.json({ enabled: pusher.enabled, publicKey: pusher.enabled ? pusher.publicKey : null }));
  router.post('/push/subscribe', authenticate, async (req, res) => res.json(await pusher.subscribeStaff(req.user, req.body?.subscription)));
  router.post('/push/contact/:token', async (req, res) => res.json(await pusher.subscribeContact(req.params.token, req.body?.subscription)));
  router.post('/push/unsubscribe', async (req, res) => res.json(await pusher.unsubscribe(req.body?.endpoint)));
  router.use((err, _req, res, next) => {
    if (err?.status && err.status < 500) return res.status(err.status).json({ error: { message: err.message } });
    return next(err);
  });
  return router;
}
