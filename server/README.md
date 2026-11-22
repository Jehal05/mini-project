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

## Hospital discovery note

`Hospital.location` is a GeoJSON Point with a 2dsphere index. Coordinates are `[longitude, latitude]`:

```js
Hospital.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } } });
```
