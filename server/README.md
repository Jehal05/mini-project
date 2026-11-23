# HealthTwin AI: Backend (Phase 1 foundation)

Express + MongoDB (Mongoose) + Socket.IO. All data is simulated. Not a medical device.

## Setup

```bash
cd server
npm install
cp .env.example .env      # then edit MONGO_URI / JWT_SECRET if needed
npm run seed              # simulated hospitals, beds, doctors, ambulances (safe to re-run)
npm run dev               # http://localhost:5000, check GET /api/health
npm test                  # Vitest + Supertest, no database needed
```

You need MongoDB running locally, or an Atlas URI in `MONGO_URI`.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with nodemon |
| `npm run seed` | Idempotent seed of simulated data |
| `npm test` | Run all tests once |

## Structure

```
server/
  src/
    app.js            Express app (exported, no port). Used by tests.
    server.js         Starts DB, HTTP and Socket.IO; graceful shutdown.
    config/           env.js, db.js
    models/           One file per collection + index.js
    routes/           index.js mounts every feature router
    controllers/      Request handlers
    middleware/       errorHandler.js (add auth here)
    sockets/          events.js (event names), index.js (rooms + emit helpers)
    seed/             data.js, seed.js
    utils/            Shared helpers
  tests/              *.test.js
```

## Real-time events

Always import from `src/sockets/events.js`. Never type event strings by hand.

`vitals:update`, `detection:new`, `emergency:created`, `hospital:alert`, `emergency:accepted`,
`emergency:rejected`, `ambulance:position`, `ambulance:status`, `emergency:arrived`, `emergency:closed`

**Rooms:** `hospital:<id>`, `case:<id>`, `patient:<id>`. Clients join with:

```js
socket.emit('room:join', { type: 'hospital', id: hospitalId }, (res) => console.log(res));
```

**Emitting from server code** (never use raw `io`):

```js
import { emitToHospital, emitToCase, emitToPatient } from '../sockets/index.js';
import { EVENTS } from '../sockets/events.js';

emitToHospital(hospitalId, EVENTS.HOSPITAL_ALERT, { caseId });
```

Room joins are open for now. The auth owner should add JWT checks in `io.use(...)` so staff can join only their own hospital room.

## Ownership and how to extend

| Area | Owner |
|---|---|
| Server, DB, Socket.IO, event names, seed | Puneet |
| `User`, `Patient`, `Hospital` models, auth middleware | Jehal |
| `VitalReading`, `Detection`, `EmergencyCase` models | Daksh |

- **Add or extend a model:** edit its file in `src/models/` (the `// OWNER:` comment shows who owns it). Keep existing field names. Other modules already use them.
- **Add a route:** create `src/routes/<feature>.js` and `src/controllers/<feature>Controller.js`, then add one `router.use(...)` line in `src/routes/index.js`.
- **Add an event:** add it to `EVENTS` in `sockets/events.js` first. The emit helpers reject unknown names.
- **Add seed data:** extend `src/seed/data.js` and use an upsert by a natural key to stay idempotent.
- **Tests:** put `*.test.js` files in `tests/`. Import `app` from `src/app.js` for Supertest.

## Hospital discovery API (Phase 8, features 51-60)

All endpoints are `GET`, return JSON, and read live data from MongoDB (hospitals, beds, doctors, ambulances, cases).
Invalid input returns `400`. Run `npm run seed` first so there are hospitals to find.

| Endpoint | What it does |
|---|---|
| `/api/hospitals/nearby?lat&lng&radiusKm=10` | Hospitals nearest first (`$near` on the 2dsphere index). Radius default 10 km, capped at 50. Each result has Haversine `distanceKm` and live `capability`. Add `eta=true` for road distance and drive time on the first 5. |
| `/api/hospitals?q=&area=&cathLab=&cardiologist=&minCcuBeds=` | Search by name or area (case-insensitive) with filters. Add `lat&lng` to include distance and sort by it. |
| `/api/hospitals/:id/capability` | Live card: cath lab, cardiologists on duty, ICU/CCU beds free, ALS ambulances free, active cases, `level` (full, partial, limited). |
| `/api/hospitals/rank?lat&lng&radiusKm` | Ranked list with `score`, a full `breakdown` (distance, capability, load) and `notifyFirst: true` on the top 3. Accepts the same filters and `eta=true`. |

Shared filter params: `cardiacOnly=true` keeps hospitals with a cath lab, a cardiologist on duty or a free CCU bed. `emergency=true` turns `cardiacOnly` on by default (an explicit `cardiacOnly=false` still wins).

**Ranking:** score = 50% distance + 30% capability + 20% load (all 0-100). Weights and points live in `RANKING_CONFIG` in `src/services/ranking.js`. ETA does not change the rank.

**Road ETA:** `src/services/routing.js` uses `ROUTING_PROVIDER` (`osrm` default and free, `mapbox`, `google`). Mapbox and Google need `MAPS_API_KEY`. If the provider fails or has no key, the response uses a straight-line estimate with `etaSource: "estimate"`.

### What Phase 9 (notification) must call

From `src/services/alternatives.js`, in this order for each case:

```js
await prepareCandidates(caseId);              // ranks hospitals for the case, saves the order
const { next } = await nextHospital(caseId);  // who to notify next (null when none left)
await markNotified(caseId, hospitalId);       // right after emitting hospital:alert
await markRejected(caseId, hospitalId);       // when a hospital rejects
```

`nextHospital` also returns `unresponsive` (notified but silent past `NO_ANSWER_TIMEOUT_SECONDS`), `pending` and `exhausted`. Notify the first `notifyFirst` hospitals (top 3), then call `nextHospital` on each rejection or timeout. `EmergencyCase` gained `candidateHospitals`, `notifiedHospitals` and `rejectedHospitals` for this.

### Environment variables

`ROUTING_PROVIDER`, `MAPS_API_KEY`, `OSRM_URL`, `NO_ANSWER_TIMEOUT_SECONDS`: see `.env.example`.

## Hospital notification API (Phase 9, features 61-70, 103, 105)

**Login stub:** hospital staff endpoints need an `x-hospital-id: <hospital _id>` header for now
(`src/middleware/requireHospitalStaff.js`, marked `OWNER: Jehal`). Jehal replaces that one file with real JWT
auth that sets `req.staff = { hospitalId, userId }`. In production the stub answers 503.

| Endpoint | Feature |
|---|---|
| `GET /api/hospitals/:id/cases` | 62: queue (pending + own active), ordered by severity, risk score, waiting time. Each case has `respondBy`, severity, risk score, latest vitals |
| `GET /api/cases/:caseId` | Case detail for an involved hospital |
| `GET /api/cases/:caseId/patient` | 63: patient record. Only a notified hospital, only while open (after one accepts, only that hospital). Every read is written to `AuditLog`. Parts not built yet are marked `{ available: false, note }` |
| `POST /api/cases/:caseId/accept` | 65, 67: first accept wins (atomic update). Second gets `409` |
| `POST /api/cases/:caseId/reject` | 66: body `{ reason }` = `no_beds`, `no_cardiologist`, `cath_lab_busy`, `other`. Notifies the next hospital |
| `POST /api/cases/:caseId/doctor` | 68: body `{ doctorId }`, an on-duty cardiologist or ED doctor of that hospital |
| `PATCH /api/cases/:caseId/preparation` | 69: body `{ item, done }`, item = `edBayReady`, `cathLabTeamAlerted`, `ccuBedReserved`, `ecgReady` |
| `POST /api/cases/:caseId/milestones` | 105: body `{ name }` = `firstMedicalContact` or `treatmentStarted` |
| `GET /api/cases/:caseId/timeline` | 70: every step in order, plus golden-hour stages |
| `GET /api/hospitals/:id/doctors` | On-duty cardiologists and ED doctors for the doctor picker |
| `POST /api/hospitals/:id/push-subscription`, `GET /api/push/public-key` | 61: web push registration |
| `POST /api/demo/emergency` | Dev only: body `{ lat, lng }` creates a simulated critical case and notifies hospitals |

**Events (rooms):** `hospital:alert` to `hospital:<id>` (new case, also doctor assignment to `doctor:<id>`);
`emergency:accepted` to the case, patient and every notified hospital (others get `acceptedByAnotherHospital: true`);
`emergency:rejected` to case, patient and the rejecting hospital (`allHospitalsBusy: true` when nobody is left);
`preparation:update` and `case:update` (full refreshed case) to the case and hospital rooms. New in Phase 9: `preparation:update`,
`case:update`, and the `doctor:<id>` room.

**No-answer handling:** every `NO_ANSWER_SWEEP_SECONDS` (default 5) the server finds notified hospitals silent for
`NO_ANSWER_TIMEOUT_SECONDS`, records each once (`timedOutHospitals`), and notifies the next hospital. Running it twice never repeats work.

**Golden-hour targets (feature 105):** alert to cath lab team 30 min (from the first hospital alert), ambulance scene time
10 min (`ambulanceAtPatientAt` to `patientOnBoardAt`, set by Phase 10), first medical contact to treatment 90 min.
Each stage returns `elapsedMin` and `overdue`.

**Env:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (web push, optional), `NO_ANSWER_SWEEP_SECONDS`. See `.env.example`.

### What the other owners must connect

- **Daksh (case creation):** after creating an `EmergencyCase`, call `await notifyHospitals(caseId)` from `src/services/notifications.js`.
  The case needs `patient`, `severity`, `riskScore` and `location` (GeoJSON `[lng, lat]`). Set `closedAt` and `status: 'closed'` when a case ends.
- **Jehal (auth, patient profile):** swap `requireHospitalStaff`; add `cardiacHistory`, `allergies`, `medicines` to `Patient`
  (the patient-info endpoint shows them automatically once they exist); Daksh adds `symptomAnswers` and `twinSnapshot`.
- **Phase 10 (ambulance):** set `ambulanceAtPatientAt` and `patientOnBoardAt` on the case.

### Try it

```bash
npm run seed && npm run dev
curl -X POST localhost:5000/api/demo/emergency -H 'Content-Type: application/json' -d '{"lat":18.5679,"lng":73.9143}'
```
Or use the Hospital Portal tab in the client and press "Create demo emergency".

## Hospital discovery note

`Hospital.location` is a GeoJSON Point with a 2dsphere index. Coordinates are `[longitude, latitude]`:

```js
Hospital.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } } });
```

## Phase 10: ambulance fleet, assignment and simulation (features 71-80, 107)

**Fleet (71, 72)** `POST/GET /api/ambulances`, `PATCH /api/ambulances/:id/status` (available <-> maintenance only, and not while
reserved), `GET /api/hospitals/:id/ambulances/summary` (counts per status and type). Staff see and register only their own hospital.

**Assignment (73)** When a hospital accepts, `autoAssign` reserves its nearest free ambulance: every free ALS first (nearest first),
BLS only if no ALS is free. Reserving sets `Ambulance.currentCase` with one atomic update, so two cases can never get the same
vehicle. `GET /api/cases/:id/ambulance-options` and `POST /api/cases/:id/ambulance {ambulanceId}` let staff override.
If nothing is free the case timeline records `no_ambulance_available`; the accepted case is never undone.

**Dispatch (74)** `POST /api/cases/:id/dispatch` builds both route legs (ambulance to patient, patient to hospital) and creates the `Trip`.

**Routes and ETA (75-77)** Geometry comes from `ROUTING_PROVIDER` (osrm | mapbox | google). If it fails, a straight-line path is used
and the leg is marked `etaSource: "estimate"`. The simulator ticks every `AMBULANCE_TICK_SECONDS`, moves each trip at
`AMBULANCE_SPEED_KMH` using real elapsed time, and emits `ambulance:position` (with `etaMinutes`) to the case room, the patient room
and the accepting hospital room. ETA = remaining metres / speed. A tick applies only if nobody else ticked first.

**Stages (78-80)** `en_route -> at_patient -> patient_on_board -> en_route_to_hospital -> at_hospital`, one step at a time (409 otherwise).
The simulator moves the ambulance to `at_patient` (sets `ambulanceAtPatientAt`, which starts the 10-minute scene clock).
`POST /api/trips/:caseId/pickup` (crew) sets `patientOnBoardAt`; the simulator then drives the hospital leg.
`POST /api/trips/:caseId/arrive` (crew or the receiving hospital) opens an `Admission`, sets the case to `arrived`,
frees the ambulance at its home hospital and emits `emergency:arrived`.
`GET /api/trips/:caseId/public` is the patient and family view (no crew names). `GET /api/trips/crew/current` is the crew view.

**Events** `ambulance:position`, `ambulance:status` (stage change), `emergency:arrived`.
**Env** `AMBULANCE_SPEED_KMH` (default 60), `AMBULANCE_TICK_SECONDS` (default 2).

### What the other owners must connect

- **Jehal (auth):** replace `requireAmbulanceCrew` / `requireCrewOrHospitalStaff` (dev headers `x-ambulance-id`, `x-hospital-id`) and
  protect `/api/trips/:caseId/public` with the patient login. `GET /api/ambulances/crew-options` is a dev-only helper (404 in production).
- **Jehal (admission management, 84):** `confirmArrival` creates a minimal `Admission` (`emergencyCase`, `patient`, `hospital`, `admittedAt`).
  Build ward, bed and doctor handling on top of it.
- **Daksh (case closing):** after arrival the case status is `arrived`. Close it by setting `status: 'closed'` and `closedAt`.

### Full demo

```bash
npm run seed && npm run dev          # seed creates ambulances at each hospital
```
1. Hospital Portal tab: pick a hospital, press "Create demo emergency".
2. Accept the takeover alert. The nearest ALS ambulance is reserved automatically (override in the Ambulance section).
3. Press "Dispatch ambulance". Watch the map, ETA and stage tracker. Open the Patient status tab to see what the patient sees.
4. Crew view tab: choose that ambulance. When it shows "At patient" press "Patient picked up".
5. When the stage is "En route to hospital" press "Arrived at hospital" (or "Confirm arrival at ED" in the portal).
Tip: `AMBULANCE_SPEED_KMH=300` makes the demo quick.

## Phase 12: prioritization, admin analytics, backup (features 95, 96, 99)

### 95 Emergency prioritization
`src/services/priority.js` is the only place that orders cases (the client mirrors it in `client/src/lib/priority.js`; both are tested against `shared/priority-fixtures.json`).
- Severity is a hard tier: critical > high > moderate > low. A lower tier never outranks a higher one.
- Inside a tier: `score = risk*wRisk + wait*wWait + distance*wDistance`, each factor 0 to 100.
  risk = `riskScore`; wait = minutes since `detectedAt` as a share of the cap; distance = hospital to patient, nearer is higher, 0 beyond the cap.
- Missing data scores 0 (no crash, no random order). Ties: earlier `detectedAt`, then id.
- `GET /api/hospitals/:id/cases?sort=priority|newest` (default `priority`). Each case carries `priority: { priorityScore, tier, factors, waitMinutes, distanceKm, config }`.
- Env: `PRIORITY_WEIGHTS=0.5,0.3,0.2` (risk,wait,distance, normalised), `PRIORITY_WAIT_CAP_MIN=30`, `PRIORITY_DISTANCE_CAP_KM=20`.

### 96 Admin analytics
`GET /api/admin/analytics/summary?from=&to=&hospitalId=&tzOffsetMinutes=` (default last 30 days, at most 366, `from` before `to`; a date-only `to` includes that whole day).
Returns cases per day by severity, median and 90th percentile minutes from detection to accept, dispatch, pickup and arrival, golden-hour compliance,
rejection and no-answer reasons, per-hospital acceptance and response time, ambulance utilisation, and counts of "no ambulance" and "all hospitals busy".
- Aggregates only. The database read selects no patient reference, name, phone, address, location or vitals.
- Groups of 1 or 2 (reasons, hospitals, ambulances, timing stats, the two counts) come back as `masked: true, label: "fewer than 3"`. The per-day series is not masked.
- Golden-hour "first contact within 60 min" = share of cases whose `firstMedicalContactAt` is within 60 minutes of detection. The stage targets are the Phase 9 ones (30, 10, 90 min).
- "Not on a trip" is shown instead of "available", because maintenance history is not recorded.
- Demo data: `npm run seed:demo-history` (after `npm run seed`) writes about 60 simulated closed cases over 30 days, marked `simulatedHistory`. Re-running replaces them, it never touches real cases.

### 99 Backup, export, restore
Node only (no mongodump). One file per backup in `BACKUP_DIR` (default `server/backups`, git-ignored): a JSON manifest line (schema version, app version, time, per-collection counts, SHA-256) then gzip of Extended JSON, optionally AES-256-GCM encrypted.
- Every backup is verified right after writing (decrypt, checksum, counts). A backup that fails is deleted and reported.
- Retention: newest `BACKUP_KEEP` (default 14) regular backups, deleted only after a new one verified. Labelled backups (the pre-restore safety copies) are never auto-deleted.
- In production a backup without `BACKUP_ENCRYPTION_KEY` is refused. `node scripts/backup.js keygen` makes a key. Keep a copy elsewhere: without it encrypted backups cannot be read.
- Restore: dry run by default. A real restore needs the phrase `RESTORE` (`--confirm RESTORE` on the CLI, `{"confirm":"RESTORE"}` in the API). It refuses a failed checksum, a newer schema version, and production unless `ALLOW_PRODUCTION_RESTORE=true`.
  It takes a safety backup first (and stops if that fails), stages every collection under a temporary name, swaps them in, then rebuilds indexes (including `2dsphere`).
  A failure while staging leaves live data untouched. Collections that are not in the backup are left alone.
- Export (reference data only): `GET /api/admin/export/:collection?format=json|csv` for `hospitals`, `beds`, `ambulances`, `doctors`. Patient, vitals, case and account data are not exportable. CSV cells that start with `=`, `+`, `-` or `@` are prefixed with `'`.
- Every backup, verify, dry run, restore and export writes an `AuditLog` entry (`admin_*`).
- API (admin only): `POST/GET /api/admin/backups`, `POST /api/admin/backups/:name/verify`, `POST /api/admin/backups/:name/restore`. Names must match `healthtwin-YYYYMMDD-HHMMSS[-label].htbak`.
- CLI: `npm run backup -- backup | list | verify <file> | restore <file> [--confirm RESTORE] | keygen`.
- Env: `ADMIN_DEV_TOKEN`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_ENCRYPTION_KEY`, `ALLOW_PRODUCTION_RESTORE`.

### Restore drill
1. `npm run backup -- backup` then `npm run backup -- verify <file>`.
2. Change something (for example make a bed busy).
3. `npm run backup -- restore <file>` (dry run), check the counts, then `... --confirm RESTORE`.
4. Confirm the change is gone and that hospital search still works (the `2dsphere` index was rebuilt).
Pause traffic during a real restore: requests that arrive mid-swap can see a mix of old and new collections.

### What Jehal must connect
- Real admin auth to replace `middleware/requireAdmin.js` (it sets `req.admin = { userId }`, which is then recorded as the audit actor).
- Where backups live off the server (object storage with its own access rules), and a schedule (cron or the host's job runner) that runs `npm run backup -- backup`.
- Who may hold `BACKUP_ENCRYPTION_KEY`, and where its copy is kept.

## Phase 14: real sign-in (replaces the dev login stubs)

Mirrors the design of Jehal's `jehal` branch (access JWT + rotating refresh cookie, roles, lockout) with no new dependencies (Node crypto: HS256 JWT, scrypt).

- Roles: `patient`, `doctor`, `hospital_staff`, `hospital_admin`, `ambulance_crew`, `central_admin`. Accounts link to a hospital, doctor, ambulance or patient.
- `POST /api/auth/login/:portal` (`patient|doctor|staff|crew|admin`), `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `GET /api/auth/me`, `POST /api/auth/change-password`. Refresh and logout need the header `X-Requested-With: healthtwin` and the `ht_refresh` cookie.
- Access token 15 min, refresh 7 days rotating, replay of a used refresh token revokes the whole family, 30 min idle limit, lock for 15 min after 5 wrong passwords, one generic error for wrong email or password.
- Guards: `requireHospitalStaff`, `requireDoctor`, `requireAmbulanceCrew`, `requireCrewOrHospitalStaff`, `requireAdmin` now read the signed-in account. With a token, header-supplied ids are ignored, so staff cannot reach another hospital.
- `DEV_AUTH=true` (never in production) or `NODE_ENV=test` also accepts the old dev headers. In production a default or short `JWT_SECRET` makes login return 503.
- Demo accounts: `npm run seed:users` (refuses to run in production).

**For Jehal:** to swap in the full `jehal` auth, re-point the four `require*` exports in `src/middleware/`; the routes read `req.staff`, `req.doctor`, `req.crew`, `req.admin` and do not change. Not ported: register, forgot-password, invites, his patient/hospital/admin portals. Socket.IO rooms are still unauthenticated.

## Phase 15: patient records (features 1, 8-20, 106; ported from Jehal's `jehal` branch)

Same features and rules as Jehal's phase 2 and 3, rewritten for this server (Express 4, Mongoose 8) with no new packages. Code: `src/patients/` (`service.js` rules, `validate.js` input checks, `patientRepo.js` database), routes `src/routes/patients.js` and `passport.js`.

| Endpoint | Who | What |
|---|---|---|
| `POST /api/auth/register` | anyone | Patient sign-up (needs consent). Issues `HT-YYYY-NNNN` and a QR token |
| `GET /api/patients/me`, `PATCH /personal`, `PUT /preferences` | patient | Own record, personal details, alert and location settings |
| `POST/PATCH/DELETE /api/patients/me/<section>[/:id]` | patient | `cardiacConditions`, `medicalConditions`, `allergies`, `medications`, `hospitalizations`, `familyHistory` (max 50 each) |
| `POST/PATCH/DELETE /api/patients/me/contacts`, `PUT /contacts/order`, `POST /contacts/:id/test-alert` | patient | Up to 3 contacts in priority order. Test alert returns a WhatsApp link (no email service connected) |
| `PUT/GET/DELETE /api/patients/me/photo`, `GET/POST /documents`, `GET /documents/:id/file` | patient | Files are sent as JSON `{ type, name, data: base64 }` (no multer). Type is decided from the real bytes, image metadata is removed, 2 MB photo, 5 MB document, 50 documents |
| `GET /api/patients/me/qr`, `POST /qr/regenerate` | patient | QR link. A new code kills the old link at once |
| `GET /api/passport/:token`, `/photo` | public | Emergency tier only: patient id, blood group, severe allergies, heart history, first contact |
| `POST /api/passport/:token/report` | public | Bystander report (feature 106): 5 per device per hour, 3 per patient per hour |
| `GET /api/passport/:token/full`, `/full/documents/:id/file` | doctor, hospital staff | Full record. Written to the audit log first |

Notes
- Validation failures answer `400` with `{ code: 'VALIDATION_ERROR', fields: { name: 'message' } }`.
- Records use an "only if unchanged" save: two edits at once give the second one `409 CHANGED`.
- The SOS phase subscribes to `patientEvents` (`src/patients/events.js`, event `emergency:bystander_report`). The report stays `pending` until it does.
- Files are kept on disk in `UPLOADS_DIR` (default `server/uploads/`, git-ignored). Back this folder up with the database.
- Not ported: forgot-password email, the discharge-summary download for patients, PDF reports.
- `npm run seed:users` now also gives the first demo patient an HT id, a QR token and a sample profile.

## Inpatient care (Phase 11, features 84, 85, 87, 88, 89)

Ported from Jehal's branch onto our server (no new dependencies). Everything is under `/api/inpatient` for hospital staff, hospital admins and doctors, and only touches the caller's own hospital (the id comes from the token).

- Beds (85): `GET/POST /beds`, `PATCH/DELETE /beds/:id`. States are free, occupied, reserved, cleaning. An occupied bed changes only by discharging its patient. `GET /doctors` lists the hospital's doctors.
- Admissions (84): `GET/POST /admissions`, `GET /admissions/:id`. The bed is taken with one conditional update, and a partial unique index allows one open stay per patient. If an ambulance arrival already made a stay without a bed, admitting completes it instead of duplicating it.
- Notes and vitals (87): `GET/POST /admissions/:id/records` (doctors and staff). File uploads for ECG or lab reports are not ported yet.
- Prescriptions (88, doctors only): `GET/POST /admissions/:id/prescriptions`, `GET .../prescriptions/check?drug=`. A drug that matches a recorded allergy returns 409 `ALLERGY_WARNING` until the doctor confirms (`acknowledgeAllergy: true`); the override is saved and audited.
- Discharge (89, doctors only): `GET/POST /admissions/:id/discharge`. The summary is a draft from the prescriptions until finalized, then fixed. Finalizing closes the stay, sets the bed to cleaning and adds the stay to the patient's own hospital history.
- Viewing records writes an audit entry. Tests: `tests/inpatient.test.js` (16 pass on the stand-in runner, with an in-memory repo).

Not ported yet: hospital profile, doctor management, dashboard (81 to 83), the ED board (86), history (90), visit file uploads.

## Live monitoring and detection (Phase 5+6, ported from Daksh's modules)

`attachMonitoring({ app, io, logger })` (in `src/monitoring/index.js`) starts the vitals simulator and the detection engine. Routes are mounted through `monitoringMount` in `app.js` so they sit before the 404 handler.

- Simulator ticks every 2 s for every patient (Ornstein-Uhlenbeck vitals). Scenarios: normal, cardiac event, and others in `src/simulation/scenarios.js`.
- Detection: rule table (levels 1-3), persistence of 3 ticks, risk score. Level 3 opens one emergency case (source `auto_detection`, status `pending`) on our case collection.
- Live vitals travel in the private socket room `vitals:<patientId>`. A client sends `vitals:subscribe` after connecting with its JWT in the handshake `auth.token`.
- History endpoints use `$dateTrunc`, so MongoDB 5.0 or newer is required.
- Env vars: `SIM_CASE_LAT`, `SIM_CASE_LNG` (location given to simulated cases, default Pune), `VITALS_RETENTION_DAYS`.
- Output is simulated and never a diagnosis. Not a medical device.

Known gaps: the `patient:<id>` room join (emergency status) is still unauthenticated; no unique index prevents duplicate live cases across several server processes; hospital scoping of clinicians is role-level only; countdown and confirmation arrive with the SOS phase.

## SOS and emergency flow (Phase 7, ported from Daksh's emergency module)

`attachEmergency` (`src/emergency/`) is started by `attachMonitoring`. REST under `/api/emergency`:

| Method and path | Purpose |
|---|---|
| `POST /sos` `{ patient, location? }` | 201 new case, 200 joined the open one |
| `GET /active?patient=` | The live case (restores the screen after a reload), with `serverNow` |
| `GET /mine?patient=&page=&limit=` | Incident history (limit 1-50) |
| `GET /first-aid?patient=` | First-aid steps and 112/108 |
| `GET /:caseId` | One case with its timeline |
| `PUT /:caseId/symptoms`, `POST /:caseId/confirm` | Symptom ticks, "Send help now" (idempotent) |
| `POST /:caseId/cancel` `{ reason, note? }` | Reason from `CANCEL_REASONS`; 409 once the patient has arrived |
| `PUT /:caseId/location` | Live cases only |
| `POST /:caseId/ack` | Record "Seen" |
| `GET /status/:token`, `POST /status/:token/seen` | Family link, no sign-in: the 128-bit token is the credential |

Access: a patient reaches only their own patient and cases; doctors, hospital staff and the central admin reach any (same rule as monitoring). Dev mode (`DEV_AUTH`) allows no-token calls.

**Flow.** A Level 3 detection opens a case in `awaiting_confirmation` with a 10 s server-side deadline. "Send now" or the deadline moves it to `pending` (round 1, 10 km) and calls hospital discovery. If nobody accepts in 60 s the search widens to 20 km, then 30 km (`widenSearch` alerts up to 3 hospitals not yet tried). After round 3 the case becomes `unresolved`, the central admin room is told and the patient sees "Call 112 now". Cancel works from `awaiting_confirmation` up to `en_route`. A cancel after acceptance tells the hospital room, ends the trip and frees the ambulance. Every transition is one atomic conditional update, so the deadline racing "send now", cancel racing accept, and the round timer racing accept each have one winner. On start-up every case still in `awaiting_confirmation` or `pending` gets its timer re-armed.

**Status mapping.** Daksh's `searching` is our `pending`; his `patient_on_board` is our `en_route`. The shared constants are unchanged.

**Events** (room `patient:<id>`): `emergency:created|confirmed|sent|escalated|unresolved|cancelled|location|contacts|ack`. `emergency:unresolved` also goes to room `central-admin`, joined with the socket event `admin:subscribe` (central admin token in the handshake). A cancel after acceptance also goes to `hospital:<id>` with `ambulanceId`.

**Contacts.** Once per case, when it is sent: an email through the notifier and a pre-filled `wa.me` link the patient taps. The default notifier only logs ("nothing sent"); no real email or push provider is wired. Contacts follow the patient's email and WhatsApp choices.

**First aid and aspirin.** The aspirin step appears only when the record explicitly says no aspirin allergy and no blood thinner. Our Patient stores allergies and medications as arrays that default to empty, so "none" cannot be told apart from "never asked": the record is passed as unknown and aspirin is never shown. A "medical history reviewed" flag on the Patient would switch it on.

**Config.** `PUBLIC_APP_URL` (base of family links, default `http://localhost:5173`), `EMERGENCY_ROUND_SECONDS` is NOT wired yet (the round is 60 s).

**Database.** A partial unique index (`one_live_case_per_patient`) allows one live automatic or SOS case per patient; demo cases (`source: 'demo'`) are excluded. It uses `$in` in a partial filter, which needs **MongoDB 6.0 or newer**. If the index cannot be built the app still starts and the single-process atomic upsert still holds.

**Known gaps.** Two server processes would each arm timers (updates stay atomic, but alerts could repeat). Ambulance release after a cancel is best effort. `emergency:unresolved` has no admin screen yet. Joining `patient:<id>` is still unauthenticated.
