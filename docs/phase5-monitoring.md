# Phase 5: Simulated health monitoring (Daksh, features 21–30)

Every reading here is **simulated**. The engine flags nothing; detection comes in Phase 6. *Simulated data for demonstration. Not a medical device.*

## Run it

```bash
cd backend  && npm install && npm run dev    # http://localhost:4000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

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
| Exercise | HR +52, SYS +28, RR +10 |
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

- **Placeholder Patient model.** `backend/src/models/Patient.js` holds only the fields the engine reads (`patientCode`, `name`, `dateOfBirth`, `bloodGroup`, `city`, `cardiacConditions[]`, `conditions[]`). Replace it with your schema. `computeBaseline()` reads `cardiacConditions`/`cardiacHistory` and `conditions`/`existingConditions`, so small naming differences are fine.
- **Access control.** `/presenter` and `POST /scenario` should be limited to `central_admin` once your guards exist. The Patient dashboard route should use the logged-in patient instead of the code in the URL.

## Tests

| Folder | Count | What they cover |
|---|---|---|
| `backend` | 43 | Engine drift, coupling, scenarios, smoothness, 30 s saving, restart; Supertest + Socket.IO against MongoDB; Phase 1 schemas |
| `frontend` | 23 | ECG shape and rate, chart and timeline helpers, dashboard, SOS dialog, presenter panel; design system |
| `shared` | 28 | Thresholds |

Run any of them with `npm test` in that folder.

## Known limits

- The SOS button is a placeholder. It opens a dialog with working Call 112 / Call 108 links. The real flow (countdown, hospital alerts, contacts) is Phase 7.
- The Digital Twin page and 3D heart (Phase 4) will reuse `useLiveVitals` and the live heart rate from this phase.
