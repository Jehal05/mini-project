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

## Hospital discovery note

`Hospital.location` is a GeoJSON Point with a 2dsphere index. Coordinates are `[longitude, latitude]`:

```js
Hospital.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } } });
```
