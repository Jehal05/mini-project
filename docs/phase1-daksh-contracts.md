# Phase 1 contracts (Daksh)

The feature plan says Daksh delivers three shared contracts in Phase 1, before feature work starts:

1. The design system (feature 102)
2. The `VitalReading` schema
3. The `EmergencyCase` schema

This branch also adds `shared/`, a small folder of constants and helpers that the backend and all three portals import. It means that a status like `"searching"` or a threshold like "heart rate above 120 is critical" is written in one place only.

## Folder layout

```
shared/                     plain JS, no dependencies; imported by backend and frontend
  vitals.js                 demo thresholds, vitalStatus(), worstStatus(), formatVital()
  emergency.js              case statuses, severity levels, cancel/reject reasons, symptoms, escalation radii
backend/
  src/models/VitalReading.js
  src/models/EmergencyCase.js
  test/                     Vitest; accept.db.test.js runs against an in-memory MongoDB
frontend/
  src/design/               the design system: tokens.css + components; import from src/design/index.js
  src/App.jsx               showcase page for every component (npm run dev)
```

Puneet's Express/Socket.IO server can `import { VitalReading, EmergencyCase } from './models/index.js'`.

## Running it

```bash
cd shared   && npm install && npm test
cd backend  && npm install && npm test     # downloads a MongoDB binary the first time
cd frontend && npm install && npm run dev  # opens the showcase at http://localhost:5173
```

## Thresholds (`shared/vitals.js`)

These are the plan's demo thresholds. They are not clinical criteria.

| Vital | Normal | Critical | Everything in between |
|---|---|---|---|
| Heart rate (BPM) | 60–100 | < 50 or > 120 | Warning |
| SpO2 (%) | 95–100 | < 90 | Warning |
| Systolic BP (mmHg) | 90–139 | < 90 or ≥ 180 | Warning |
| Diastolic BP (mmHg) | 60–89 | < 50 or ≥ 120 | Warning *(proposed: not in the plan's table)* |
| Temperature (°C) | 36.1–37.5 | < 35 or ≥ 39 | Warning |
| Respiratory rate (/min) | 12–20 | < 10 or > 24 | Warning |

**Changes from the plan, for the team to confirm:**
- In the plan's table, temperature 35.0–36.0 °C and respiratory rate 10–11/min fit no band. Here, anything outside Normal but not Critical counts as Warning, so every value gets exactly one status.
- The table has no diastolic row, but feature 32 checks diastolic pressure, so I added demo values for it.

Admin-edited thresholds (feature 36) can be passed to every helper: `vitalStatus('hr', 125, mergeThresholds(overrides))`.

## VitalReading

One saved simulated reading. The engine ticks every 2 s and emits `vitals:update`. It saves one reading every 30 s (feature 28).

| Field | Type | Notes |
|---|---|---|
| `patient` | ObjectId → Patient | required |
| `recordedAt` | Date | default now; indexed with patient |
| `hr`, `sys`, `dia`, `spo2`, `temp`, `rr` | Number | `hr` required; sanity ranges enforced |
| `scenario` | `stable` \| `exercise` \| `fever` \| `hypoxia` \| `cardiac_event` | |
| `statuses.{vital}` | `normal` \| `warning` \| `critical` | filled automatically if the engine doesn't set them |
| `status` | worst of the above | feature 29 |
| `simulated` | always `true` | cannot be set to false; JSON output also carries `label: "Simulated"` |

Helpers: `VitalReading.latestFor(patientId)`, `VitalReading.rangeFor(patientId, from, to)` (oldest first, ready for Recharts).

## EmergencyCase

One emergency, from detection or SOS to admission. Everyone writes to this one document, so every portal shows the same case.

**Lifecycle** (`shared/emergency.js` → `CASE_STATUS`):

```
awaiting_confirmation ─► searching ─► accepted ─► ambulance_assigned ─► patient_on_board ─► arrived ─► admitted ─► closed
        │                    │
        │                    └─► unresolved   (3 search rounds failed; central admin alerted)
        └──────────── cancelled (any active state; needs a reason)
```

| Field | Owner | Feature |
|---|---|---|
| `patient`, `patientCode`, `source` (`auto_detection` / `manual_sos` / `bystander_qr`), `severity` | Daksh | 39, 41, 106 |
| `detection` (rules fired, readings snapshot, risk score + breakdown) | Daksh | 34, 39, 40, 93 |
| `symptoms` (the 4 AHA warning signs, `noResponse`) | Daksh | 43, 44 |
| `location` (GeoJSON point `[lng, lat]`, accuracy, source) | Daksh + Puneet | 46, 51, 52 |
| `escalation` (confirm deadline, round, radius 10/20/30 km) | Daksh | 44, 45 |
| `hospitalResponses[]` (hospital, round, rank, score, notified/accepted/rejected/timed_out/superseded, reject reason) | Puneet | 59–61, 65, 66 |
| `acceptedHospital`, `acceptedAt`, `acceptedBy`, `assignedDoctor`, `ambulance`, `preparation` checklist | Puneet | 65, 68, 69, 73 |
| `admission` | Jehal | 84 |
| `contactAlerts[]`, `acknowledgements[]` ("Seen") | Daksh | 47, 48 |
| `cancellation` (reason required) | Daksh | 49 |
| `timeline[]` (type, time, actor, data) | everyone | 70 |

**First hospital to accept wins (feature 65):** call `EmergencyCase.acceptIfPending(caseId, hospitalId, userId)`. It is a single atomic update. It succeeds only while the case is `searching` and that hospital still holds a live notification. Every other notified hospital is marked `superseded`. It returns `null` if someone else already accepted or the patient cancelled. A test in `backend/test/accept.db.test.js` fires two accepts at once and checks that only one wins.

Other helpers: `caseDoc.addEvent(type, {...})`, `caseDoc.acknowledge({ recipientType, recipientId, name })` (records each recipient once), and the virtual `caseDoc.isActive`.

## Design system (feature 102)

Import the CSS once (`import './design/tokens.css'`) and wrap the app in `<ThemeProvider>`. Then:

```jsx
import { Button, SosButton, Card, Badge, SimulatedBadge, Modal, Table,
         MedicalBackground, EcgLine, VitalTile, SimulatedNotice, useTheme } from '../design'
```

- **Tailwind token classes:** `bg-primary`, `text-link`, `bg-accent`, `text-normal` / `text-warning` / `text-critical`, `bg-surface`, `border-line`, `text-fg`, `text-fg-muted`, `font-mono`. Use these, not raw hex values, so dark and light themes both work.
- **Red (`critical`, `variant="danger"`)** is only for critical status, SOS, Call 112/108 and the emergency takeover.
- **`<MedicalBackground portal="patient|hospital|admin" alert>`** gives the layered backgrounds. The hospital variant shows a red vignette when `alert` is set.
- **`<Modal tone="critical" dismissible={false}>`** is for the countdown and takeover style. Escape and backdrop clicks are ignored.
- **`<VitalTile vital="hr" value={134} />`** colours itself from `shared/vitals.js` and always shows the Simulated label.
- **Accessibility:** focus rings, focus trap in modals, status shown by dot + text and not by colour alone. Motion respects `prefers-reduced-motion`, and `useTheme().toggleMotion()` pauses long loops.
- **Fonts:** Inter for the UI, JetBrains Mono for vitals, timers and IDs. They are bundled with `@fontsource-variable`, so no external requests.

## Notes for teammates

- **Puneet:** please use `shared/emergency.js` names in your Socket.IO payloads. The plan's event list has nothing for cancellation; I suggest adding `emergency:cancelled` (feature 49 must release the hospital and ambulance).
- **Jehal:** `EmergencyCase.caseNumber` (`EC-2026-0001`) can reuse the same `counters` collection as the patient ID (feature 10).
- **hospital-portal branch:** `src/utils/vitals.js` there uses different thresholds (e.g. HR 55–105). Switching it to `shared/vitals.js` keeps both portals' colours identical.
