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
