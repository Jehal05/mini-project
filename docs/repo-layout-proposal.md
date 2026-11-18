# Proposal: one repo layout for all three of us

**Status:** proposal from Daksh for the team to agree on before anyone merges to `main`. Nothing on the `hospital-portal` branch has been changed.

## The problem

| Branch | Layout today |
|---|---|
| `hospital-portal` (Puneet) | A Vite + React app at the **repo root** (`package.json`, `index.html`, `src/` at the top). It runs its own vitals simulation in the browser (`src/sim/engine.js`) with its own thresholds (`src/utils/vitals.js`). |
| `Daksh` | `frontend/` (Vite + React), `backend/` (Express, Mongoose, Socket.IO), `shared/` (constants used by both). |

Merging both into `main` as they are would give us:
- two separate frontends, at `/` and `frontend/`
- an add/add conflict on the root `.gitignore`
- two different sets of vital thresholds
- two simulations that disagree. The plan says *one* server-side engine so "every portal sees the same readings at the same moment".

## Proposal

The plan's architecture section says *"the three portals are one React app"* talking to one Express API. So:

```
mini-project/
├── shared/                 constants & helpers used by backend AND frontend
│   ├── vitals.js           thresholds + status helpers (one source of truth)
│   └── emergency.js        case statuses, reasons, severity levels
├── backend/                Express + Mongoose + Socket.IO (Puneet sets up server.js)
│   └── src/
│       ├── server.js       Puneet: app, DB connection, Socket.IO, event names
│       ├── auth/           Jehal: JWT, roles, guards
│       ├── models/         Patient (Jehal), Hospital (Jehal), VitalReading & EmergencyCase (Daksh) ...
│       ├── simulation/     Daksh: monitoring engine (attachSimulation)
│       ├── detection/      Daksh: Phase 6
│       ├── hospitals/      Puneet: discovery, notification, ambulance
│       └── ...
├── frontend/               ONE React app, three portals as routes
│   └── src/
│       ├── design/         Daksh: design system (everyone imports from here)
│       ├── portals/
│       │   ├── patient/    Daksh lead   → /patient/*
│       │   ├── hospital/   Puneet lead  → /hospital/*
│       │   └── admin/      Jehal lead   → /admin/*
│       ├── features/       cross-portal pieces (monitoring, emergency, maps ...)
│       └── App.jsx         routes + role guards (Jehal)
└── docs/
```

**Routes:**

| Portal | Routes |
|---|---|
| Patient | `/patient/...` |
| Hospital | `/hospital/...` (crew view at `/hospital/crew`) |
| Central Admin | `/admin/...` |
| Shared | `/login` and the public QR page `/p/:token` |

## Moving `hospital-portal` into this layout

Puneet does this on his own branch. Nothing is lost; files only move.

| Now (`hospital-portal`) | Moves to | Notes |
|---|---|---|
| `package.json` (root) | merge into `frontend/package.json` | Add `leaflet`, `react-leaflet` (already same React 19, Vite 7, Tailwind 4, Recharts 3) |
| `index.html`, `vite.config.js` | already in `frontend/` | Delete the root copies |
| `src/main.jsx`, `src/App.jsx` | `frontend/src/portals/hospital/HospitalPortal.jsx` | Becomes the `/hospital/*` route |
| `src/views/*.jsx` (Dashboard, MapView, PatientsView, AmbulancesView) | `frontend/src/portals/hospital/views/` | |
| `src/components/*.jsx` (Sidebar, Header, StatCards, LiveMap, BedsPanel ...) | `frontend/src/portals/hospital/components/` | `Card.jsx` → use `design/` `Card` instead |
| `src/components/VitalsChart.jsx` | reuse `features/monitoring/HistoryChart` or keep as hospital view | |
| `src/utils/geo.js` | `shared/geo.js` | The backend needs Haversine too (feature 54) |
| `src/utils/vitals.js` | **delete** → `shared/vitals.js` | Its thresholds differ (e.g. HR normal 55–105 vs the plan's 60–100) |
| `src/sim/engine.js`, `src/sim/HospitalContext.jsx` | **replace** with the backend engine | Subscribe to `vitals:update`; keep the context as a thin client cache |
| `src/data/seed.js` | `backend/src/dev/seed.js` (hospitals part) | Jehal's hospital seed (feature 81) |
| `src/index.css` | `frontend/src/design/tokens.css` + a small `portals/hospital/hospital.css` for the Leaflet marker styles | |
| `.gitignore`, `README.md` | merge with the root ones | |

## Suggested order

1. Agree on this layout (or change it) in our next meeting.
2. Puneet creates `backend/src/server.js` and mounts `attachSimulation({ app, io })` (one line, see `docs/phase5-monitoring.md`).
3. Puneet moves `hospital-portal` into `frontend/src/portals/hospital/` as in the table above.
4. Jehal adds `auth/` and replaces the placeholder `Patient` model.
5. Merge to `main` one branch at a time, each through a pull request reviewed by a teammate (team rule 5).
