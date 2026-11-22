# HealthTwin AI server

Phase 1 (Jehal): identity and access. Express + Mongoose + JWT.

## Run

```bash
cd server
cp .env.example .env        # set JWT_ACCESS_SECRET for production
npm install
npm run seed                # fictional demo accounts + Rahul Sharma (HT-2026-0001)
npm run dev                 # http://localhost:5000
npm test                    # needs MongoDB: set MONGO_URI_TEST (database name must contain "test"; the suite wipes it),
                            # or it starts an in-memory one
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

Sessions: access token 15 min, refresh token 7 days (httpOnly cookie, rotated on every use, replaying an old one
revokes the whole login), idle sessions end after 30 minutes.

- **Ending a session ends its access tokens.** `authenticate` checks that the login still has a live refresh token and
  that the account is active, so logout, logout-all, password reset and deactivation take effect at once. When you
  deactivate an account, call `revokeUserSessions(userId)` from `src/utils/session.js`.
  A revoked token answers `401 SESSION_REVOKED`; an expired one `401 TOKEN_EXPIRED`. The client refreshes once on either.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes. Attempts are counted atomically before the password is
  checked, per account (email and phone share one counter), and made-up identifiers are counted the same way, so the
  lock does not reveal which accounts exist.
- **Audit labels:** failed logins record the email or phone typed, or `[unrecognised identifier]` for anything else
  (people paste passwords into the email box and the log cannot be edited).
- **Passwords:** 8+ characters with a letter and a number from any language; at most 72 bytes (bcrypt's limit).
- **Two tabs refreshing at once:** the loser gets `401 REFRESH_RACE` and keeps its cookie; the client retries once.
- **`hospitalScope`** rejects a request if ANY hospital id (route, body or query) differs from the token's hospital.
  Still prefer `req.hospitalId` over anything from the request.
- **Reset email:** the reply goes out first and the email is sent afterwards, so timing does not reveal whether the
  address has an account. `MAIL_PROVIDER=console` (default) prints the link to the server log; `resend` uses the Email API.
- **Rate limits** (per IP, 15 minutes): login 30, register 20, forgot/reset 10. Set `RATE_LIMIT=off` to disable locally,
  and `TRUST_PROXY=true` behind a proxy so every user does not share one address.

## Phase 2: medical profile and QR passport (Jehal)

### Routes
Patient (token decides whose record; nothing in the URL or body can pick another patient), all under `/api/patients/me`:
`GET /`, `PATCH /personal`, `PUT /preferences`, `PUT|GET|DELETE /photo`, `POST|PATCH /:id|DELETE /:id` for each of
`cardiacConditions medicalConditions allergies medications hospitalizations familyHistory`, `POST|PATCH|DELETE /contacts`,
`PUT /contacts/order`, `POST /contacts/:id/test-alert`, `GET|POST /documents`, `GET|DELETE /documents/:id[/file]`,
`GET /qr`, `POST /qr/regenerate`.

Public passport, under `/api/passport/:token` (rate-limited per IP; malformed, unknown and revoked tokens give the same 404 `PASSPORT_NOT_FOUND`):
`GET /` emergency tier only, `GET /photo`, `POST /report` (bystander), and for `doctor`, `hospital_staff`, `hospital_admin` only:
`GET /full` and `GET /full/documents/:docId/file` (each view is written to the audit log before anything is returned).

### For teammates
- `import { getEmergencySummary } from './services/patientSummary.js'` takes a Patient document, `_id` or `HT-YYYY-NNNN` and returns
  `{ patientId, bloodGroup, hasPhoto, severeAllergies[{allergen,reaction}], cardiacHistory[{type,year}], emergencyContact{name,relation,phone} }` (or `null`).
- **Daksh (SOS):** a bystander tap emits `emergency:bystander_report` on `appEvents` (`src/events.js`) with
  `{ reportId, patient, patientId, location{latitude,longitude,accuracyMeters?}, reportedAt }`. The report is saved as a `BystanderReport` with status `pending`;
  turning it into an EmergencyCase (and setting status `handed_off`) is the SOS flow's job. Nothing here creates a case.
- **Phase 3 / hospital flow:** a hospitalization with `dischargeSummaryId` is read-only for the patient. Hospital logins read a patient through `/api/passport/:token/full`.
- Client: `import { SevereAllergyBanner } from 'features/profile'` shows the red banner anywhere a patient record is displayed.

### Rules enforced (and tested)
Contact limit (3), unique priorities, section size (50), document count (50), test alerts (3 per contact per hour), bystander reports (per IP and per patient)
are all enforced in a single database operation, so parallel requests cannot go past them. Audit entries hold the patient ID, section and operation only, never health text or the QR token.
Uploaded files get a random name, live in `UPLOAD_DIR` (default `server/uploads/`, git-ignored, not served statically), and are returned only through authenticated routes.
Photos have metadata (EXIF) removed before storing.

## Phase 3: hospital management (Jehal)

### Routes
Central admin, `/api/admin` (central admins only): `GET|POST /hospitals`, `GET|PATCH /hospitals/:id`. Creating a hospital also creates its hospital-admin account with a random
password nobody sees; the admin gets a one-time link to choose their own. Closing a hospital (`isActive: false`) switches off all its staff accounts.

Hospital portal, `/api/hospital` (doctor, hospital_staff, hospital_admin; always the caller's own hospital, taken from the token):
`GET /me`, `PATCH /me` (admin), `GET /dashboard`, `GET|POST /doctors`, `PATCH /doctors/:id` (admin), `GET|POST /beds`, `POST /beds/bulk`, `PATCH|DELETE /beds/:id`,
`GET /ed`, `POST /ed/bays`, `PATCH|DELETE /ed/bays/:id`, `GET /history`, `GET|POST /admissions`, `GET /admissions/:id[/record|/summary]`,
`GET|POST /admissions/:id/records` (+ `/records/file`, `/records/:recordId/file`), `GET|POST /admissions/:id/prescriptions` (+ `/check?drug=`), `GET|POST /admissions/:id/discharge`.
Patients read their own summaries at `GET /api/patients/me/discharge-summaries/:id`.

### For teammates (Puneet: connection and response)
- **Cases.** `services/hospitalCases.js`: call `recordHospitalCase({ hospitalId, emergencyCaseId, patientId, summary, severity })` when a hospital is notified and
  `updateHospitalCase({ hospitalId, emergencyCaseId }, { status: 'accepted' | 'rejected' | 'arrived' | 'closed', etaMinutes, rejectionReason, outcome })` when it answers.
  The dashboard (82), ED "arriving now" list (86) and emergency history (90) read these rows. Nothing there depends on Daksh's EmergencyCase model.
- **Beds.** `getBedAvailability(hospitalId)` (`services/beds.js`) returns counts by type and status for the capability card (58). The `hospital:beds_changed` event
  `{ hospitalId, availability }` fires after every change, for the Socket.IO push.
- **Doctors.** `isCardiologistOnDuty(hospitalId)` and `getDoctorsOnDuty(hospitalId)` (`services/doctors.js`) feed ranking (59) and assignment (68). `hospital:doctor_duty_changed`
  `{ hospitalId, cardiologistOnDuty, doctorsOnDuty }` fires when the roster changes.
- **Handover summary (63, feature 94).** `buildHealthSummary(patientDoc, { latest, baseline })` (`services/healthSummary.js`) returns `{ text, lines, vitals }` from a fixed template.
  Pass Daksh's latest and baseline vitals as `{ heartRate, systolic, diastolic, spo2, temperatureC }`. The QR full-record response includes it as `summary`.
- **Admission** links to a case through `caseId` and moves the case to `admitted`; discharge closes it.

### Rules enforced (and tested)
One bed per admission and one open admission per patient (conditional update plus a partial unique index), one discharge per admission, bed limit (300) and bay limit (40) via atomic counters.
Every read of patient health data by a hospital writes `record.view` before anything is returned; audit entries hold ids and the kind of view, never health text.
A prescription whose drug matches a recorded allergy (including drug families such as penicillin / amoxicillin) is refused with `ALLERGY_WARNING` until the doctor confirms; the override is stored.
Seed: 5 fictional Pune hospitals with beds, ED bays and doctors; the demo hospital also has sample cases.
