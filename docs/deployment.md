# Deployment

One container serves the API, Socket.IO and the built frontend on a single origin, so there is no CORS and the
refresh cookie is first-party.

```
docker build -t healthtwin .
docker run -p 5000:5000 --env-file .env.production healthtwin
```

## Environment (production)

| Variable | Notes |
| --- | --- |
| `NODE_ENV=production` | Turns on secure cookies and refuses to start without real secrets. |
| `MONGO_URI` | MongoDB Atlas connection string (a replica set, so transactions work). |
| `JWT_ACCESS_SECRET` | 32+ random characters. Generate with `openssl rand -hex 32`. |
| `CLIENT_ORIGIN` | The public URL, for example `https://healthtwin.example`. |
| `TRUST_PROXY=true` | Set when behind a load balancer or platform proxy (Render, Fly, Railway, nginx). |
| `STATIC_DIR` | Already `/app/web` in the image. |
| `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` | Real email for password resets and contact alerts. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push for contact alerts. |
| `BACKUP_DIR` | Mount a volume here for the daily database dump (feature 99). |
| `UPLOAD_DIR` | Mount a volume for patient documents. |
| `AMBULANCE_SPEED_KMH` | Leave at 60 for the demo ambulance simulator. |

Never commit these. Seed demo data once with `node src/seed/seed.js` (fictional data only; do not seed a real deployment).

## Checks before going live

1. `GET /api/health` returns `{"status":"ok"}`.
2. Sign in, open `/patient/monitor`, and confirm the live vitals update (this proves WebSockets pass through the proxy).
3. Run the real-browser demo against a staging copy: `cd e2e && npm run build:frontend && node --test journeys/rahul-demo.test.mjs`.
