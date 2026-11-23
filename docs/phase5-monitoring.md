# Phase 5: Simulated health monitoring (Daksh, features 21–30)

Every reading here is **simulated**. The engine flags nothing; detection comes in Phase 6. *Simulated data for demonstration. Not a medical device.*

## Run it

```bash
cd backend  && npm install && npm run dev    # http://localhost:4000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

- **Requirement: MongoDB 5.0 or newer.** The 24 h / 7 d graphs use `$dateTrunc`. On an older server those two views return a clear `501 MONGODB_TOO_OLD` error, and the 1 h view still works.
- **Database.** The backend uses `MONGO_URI` if you set it. If you don't, it starts a local MongoDB that keeps its data in `backend/.data/mongo`, so data survives restarts. The first run downloads MongoDB.
- **Seed data.** The first start seeds 3 fictional patients and backfills 7 days of simulated history, so the 24 h and 7 d graphs aren't empty. Set `BACKFILL=0` to skip the backfill.
- **Pages:**
  - `/patient/HT-2026-0001`: Patient dashboard
  - `/presenter`: Presenter control panel
  - `/design`: design system showcase

## Demo patients (fictional)

| ID | Name | Profile | Stable baseline |
|---|---|---|---|
| HT-2026-0001 | Rahul Sharma | 45, B+, Pune, previous heart attack (2022) | HR 78, BP 124/75, SpO2 98 |
| HT-2026-0002 | Ananya Iyer | 25, O+, fit | HR 65, BP 112/72 |
| HT-2026-0003 | Vikram Desai | 61, A−, treated hypertension + diabetes | HR 75, BP 130/80 |

## How it works

```
SimulationEngine (server, every 2 s per patient)
  ├─ Ornstein–Uhlenbeck step: pull towards the scenario target + noise
  │     systolic & diastolic share noise, so they move together
  ├─ emit  vitals:update  → Socket.IO room  patient:<id>
  ├─ every 30 s → save a VitalReading (MongoDB)
  └─ worst status changes (held 3 ticks) → HealthEvent  status_change
Presenter → POST /scenario → target changes → vitals glide there in ~30–60 s
```

| Feature | Where |
|---|---|
| 21–25 Heart rate, BP, SpO2, temperature, breathing | `backend/src/simulation/engine.js` (`stepVitals`) |
| 26 Scenarios + presenter control | `scenarios.js`, `POST /patients/:id/scenario`, `frontend/src/pages/PresenterPanel.jsx` |
| 26 Synthetic ECG (P-QRS-T, ECGSYN idea) | `frontend/src/features/monitoring/ecg.js`, `EcgStrip.jsx` |
| 27 Per-patient baselines | `backend/src/simulation/baseline.js` |
| 28 Saved every 30 s; 1 h / 24 h / 7 d graphs | `engine.js`, `history.js`, `HistoryChart.jsx` |
| 29 Normal / warning / critical; patient takes the worst | `shared/vitals.js` (same thresholds everywhere), `VitalTile` |
| 30 Health timeline | `history.js` (`healthTimeline`), `HealthTimeline.jsx`, `HealthEvent` model |

**Scenarios.** Each scenario sets a target. The vitals don't jump to it; they glide there.

| Scenario | Target |
|---|---|
| Stable | The patient's baseline |
| Exercise | HR +22, SYS +20, RR +5 (light exercise; changed in Phase 6 so detection shows at most a Watch) |
| Fever | Temperature 39.3 °C, HR +22 |
| Hypoxia | SpO2 86.5 %, RR 27 |
| Cardiac event | HR 138, SpO2 86, BP 172/104, RR 28 (meets the plan's HR > 120 and SpO2 < 90 rule) |

The engine resumes from the last saved reading and the last scenario when the server restarts.

## For Puneet: attaching it to the main server

```js
import { attachSimulation } from './simulation/index.js'

const engine = await attachSimulation({
  app,                       // Express app; REST is mounted at /api/sim
  io,                        // Socket.IO server
  guard: requireAuth,        // optional: runs on every /api/sim route
  presenterGuard: requireRole('central_admin'),  // optional: scenario switching
})
engine.onUpdate((u) => { /* in-process listener; Phase 6 detection plugs in here */ })
```

- **Rooms:** the module handles `vitals:subscribe` / `vitals:unsubscribe` (`{ patientId }`) for dev. Your auth layer can instead join sockets to `patient:<id>` directly.
- **Payload of `vitals:update`:**
  `{ patientId, patientCode, at, vitals: { hr, sys, dia, spo2, temp, rr }, statuses, status, scenario, simulated: true, label: 'Simulated' }`

## REST endpoints (`/api/sim`)

| Method | Path | Notes |
|---|---|---|
| GET | `/scenarios` | List of scenarios |
| GET | `/patients` | Patients plus their live snapshot |
| GET | `/patients/:id` | `:id` = Mongo id or `HT-2026-0001` |
| GET | `/patients/:id/vitals/latest` | Live snapshot |
| GET | `/patients/:id/vitals/history?range=1h\|24h\|7d` | 1 h: raw 30 s readings. 24 h: 5-min averages. 7 d: 30-min averages. Each bucket keeps its worst status, so short spikes stay visible |
| GET | `/patients/:id/timeline?range=…` | Readings (status + HR + SpO2) and events |
| POST | `/patients/:id/scenario` | Body `{ "scenario": "cardiac_event" }` |

## For Jehal

**Placeholder Patient model.** `backend/src/models/Patient.js` holds only the fields the engine reads. The server logs a warning on every start while it is in use.

### Swapping in the real Patient model

1. Put your schema in `backend/src/models/Patient.js` (same path, so all imports keep working), or keep your own file and change the two imports in `simulation/index.js` and `simulation/routes.js`.
2. Make sure it has `patientCode` (`HT-YYYY-NNNN`), `name`, `dateOfBirth` (or `age`), `bloodGroup`, `city`.
3. For the baseline the engine reads either of these, as plain strings or as objects with a `type`, `name` or `condition` field:
   - `cardiacConditions` or `cardiacHistory`
   - `conditions` or `existingConditions`

   A test covers exactly these names.
4. Do **not** copy the `isHealthTwinPlaceholder` static. The startup warning then disappears.
5. Run `npm test` in `backend/`.

**Access control.** The current checks are interim; see `simulation/access.js`. Search for `TODO(Jehal)` to find each one:
- Pass `guard` (your JWT middleware) to `attachSimulation`.
- Pass `presenterGuard`: a `central_admin` role check.
- Pass `authorizeSubscribe(socket, patientId)`: the patient themself, a family link, or hospital staff on their case.
- The Patient dashboard should use the logged-in patient, not the code in the URL.

## Review fixes (after the Phase 5 code review)

| # | Problem | Fix |
|---|---|---|
| 1 | Commits were authored as "Claude" | Repo identity set to dakshsoni5244-design; earlier commits re-authored (force-push pending approval) |
| 2 | Folder layout clashes with `hospital-portal` | `docs/repo-layout-proposal.md` (for the team to agree) |
| 3 | Anyone could follow any patient's vitals and switch scenarios | **Interim** checks in `simulation/access.js`. `authorizeSubscribe` hook: allow-all in dev, deny in production unless a real check is passed. `PRESENTER_KEY` (`x-presenter-key` header) on `POST /scenario`: open when unset in dev, 503 when unset in production, 401 on a wrong key. The presenter page asks for the key once per tab |
| 4 | Slow MongoDB could make ticks overlap | `runTick()` skips a tick while the last one runs and logs it |
| 5 | Two subscribers could start one patient twice | `addPatient()` shares one in-flight start per patient |
| 6 | Chart could show another patient's live tick | `HistoryChart` filters by `patientId` and clears on patient/range change |
| 7 | DB tests skipped silently | They fail with `CI=true` or `REQUIRE_DB_TESTS=1`, and skip locally with a loud banner |
| 8 | MongoDB < 5.0 gave a bare 500 | 501 `MONGODB_TOO_OLD` with a clear message; requirement documented above |
| 9 | Raw colours in components; white-on-red text failed WCAG AA | Tokens only (`critical-solid`, `critical-fg`, `scrim`, `monitor`, `shadow`). Red buttons now 4.8:1. A test scans all sources and checks contrast |
| 10 | 775.6 KB single JS bundle | Lazy pages and chart; `charts`/`react`/`realtime` chunks. **First load 286.1 KB** (before gzip). `npm run check:bundle` enforces ≤ 300 KB |
| 11 | Readings never expired | TTL index `vitals_ttl` on `recordedAt`; `VITALS_RETENTION_DAYS` (default 30, minimum 8). To change the period on an existing database: `db.runCommand({ collMod: 'vitalreadings', index: { name: 'vitals_ttl', expireAfterSeconds: <seconds> } })` |
| 12 | Placeholder Patient model could silently win | Startup warning; swap steps above; test for Jehal's likely field names |

### Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `MONGO_URI` | backend | local MongoDB in `backend/.data` | Database |
| `PRESENTER_KEY` | backend | unset (open in dev) | Protects scenario switching; required when `NODE_ENV=production` |
| `VITALS_RETENTION_DAYS` | backend | 30 (min 8) | How long readings are kept |
| `REQUIRE_DB_TESTS` | backend tests | unset | `1` makes MongoDB tests fail instead of skip (CI does this automatically) |
| `VITE_API_URL` | frontend | `http://localhost:4000` | Backend address |

## Tests

| Folder | Count | What they cover |
|---|---|---|
| `backend` | 64 | Engine drift, coupling, scenarios, smoothness, 30 s saving, restart, tick overlap, concurrent starts; Supertest + Socket.IO against MongoDB; access control; TTL; old-MongoDB error; Phase 1 schemas |
| `frontend` | 58 | ECG shape and rate, chart and timeline helpers, chart patient isolation, dashboard, SOS dialog, presenter panel + key, lazy routes; design system, no-raw-colour scan, contrast |
| `shared` | 28 | Thresholds |

Counts above are as of Phase 5; Phase 6 adds more (see `phase6-detection.md`). Run any of them with `npm test` in that folder. `npm run check:bundle` in `frontend/` checks the first-load budget.

## Known limits

- The SOS button is a placeholder. It opens a dialog with working Call 112 / Call 108 links. The real flow (countdown, hospital alerts, contacts) is Phase 7.
- The Digital Twin page and 3D heart (Phase 4) will reuse `useLiveVitals` and the live heart rate from this phase.
