# HealthTwin AI server

Phase 1 (Jehal): identity and access. Express + Mongoose + JWT.

## Run

```bash
cd server
cp .env.example .env        # set JWT_ACCESS_SECRET for production
npm install
npm run seed                # fictional demo accounts + Rahul Sharma (HT-2026-0001)
npm run dev                 # http://localhost:5000
npm test                    # needs MongoDB: set MONGO_URI_TEST, or it starts an in-memory one
```

Seeded accounts (development only, password `Demo@12345`, override with `SEED_PASSWORD`):

| Role | Login |
| --- | --- |
| patient (Rahul Sharma) | rahul.sharma@example.com |
| central_admin | admin@healthtwin.example |
| doctor | doctor@healthtwin.example |
| hospital_staff | staff@healthtwin.example |
| hospital_admin | hospitaladmin@healthtwin.example |

## Contracts for Daksh and Puneet

**Mount the routes once:** `import apiRouter from './routes/index.js'; app.use('/api', apiRouter);`
`src/app.js` is a minimal server so this phase runs on its own. Puneet's server setup can replace it as long as it
keeps `express.json()`, `cookie-parser`, `cors({ origin: CLIENT_ORIGIN, credentials: true })` and the `errorHandler`.

**Models** (`src/models/index.js`): `User`, `Patient`, `Hospital`, `AuditLog`, plus `ROLES` and `HOSPITAL_ROLES`.
`Patient` already has every Phase 2 field, so its shape will not change. `Hospital.location` has the `2dsphere`
index for `$near`.

**Protecting a route** (`src/middleware/index.js`):

```js
import { protect, audit } from '../middleware/index.js';

// roles only
router.get('/vitals/:id', protect({ roles: ['patient', 'doctor'] }), handler);

// hospital staff only see their own hospital; req.hospitalId is forced to the token's hospital
router.get('/hospitals/:hospitalId/cases',
  protect({ roles: ['doctor', 'hospital_staff', 'hospital_admin', 'central_admin'], hospitalScoped: true }),
  (req, res) => Case.find({ hospitalId: req.hospitalId }));

// log a record view or edit once the response succeeds
router.get('/patients/:id', protect({ roles: ['doctor'] }),
  audit('record.view', { resourceType: 'patient', resourceId: (req) => req.params.id }), handler);
```

`req.user` is `{ id, role, hospitalId, patientId, sid }`. For writes that need an explicit entry use
`writeAudit({ req, action, resourceType, resourceId, meta })` from `src/utils/audit.js`.

**Socket.IO:** verify the same access token with `verifyAccessToken` from `src/utils/crypto.js`.

## Auth API

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/register` | Patient sign-up (consent required), returns access token |
| `POST /api/auth/login/{patient,doctor,staff,admin}` | One login per portal |
| `POST /api/auth/refresh` | New access token from the httpOnly cookie (needs `X-Requested-With: healthtwin`) |
| `POST /api/auth/logout`, `/logout-all` | Revoke this login, or all of the user's logins |
| `GET /api/auth/me` | Current user |
| `POST /api/auth/forgot-password`, `/reset-password` | Single-use link, valid 15 minutes |
| `GET /api/audit-logs` | Central admin only; filters: actor, role, action, outcome, resourceType, resourceId, hospitalId, from, to, page, limit |

Sessions: access token 15 min, refresh token 7 days (httpOnly cookie, rotated on every use, reuse revokes the whole
login), idle sessions end after 30 minutes. Five wrong passwords lock an account for 15 minutes.
Password reset prints the link to the server console unless `MAIL_PROVIDER=resend`.
