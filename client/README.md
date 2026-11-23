# HealthTwin AI: Client (Phase 8 screens)

React + Vite + Tailwind. Map: Leaflet + OpenStreetMap (no API key needed).

```bash
cd client
npm install
npm run dev     # http://localhost:5173, /api is proxied to the server on port 5000
npm test
```

Start the server first (`cd server && npm run seed && npm run dev`).

Screens: location gate (GPS with allow/deny/timeout handling), manual pin and address search, filters,
ranked hospital list with score breakdown, live capability cards, and the map.
Every screen shows "Simulated data for demonstration. Not a medical device." and, in emergency mode, Call 112 and Call 108.

## Hospital Portal (Phase 9)

Tabs: **Find hospitals** (Phase 8), **Hospital Portal**, **Patient status**.
In the portal pick a hospital (temporary demo login), then press "Create demo emergency". The case appears live in the
queues of the top 3 hospitals, a critical case takes over the screen with an alarm, and Accept / Reject / doctor /
checklist / timer / timeline all call the server. Open the Patient status tab to see the patient-side message.

## Ambulance tracking (Phase 10)

- **Hospital Portal > Ambulance fleet:** register ambulances, live counts, maintenance toggle.
- **Case screen > Ambulance:** reserved ambulance, change it, **Dispatch**, live map with both route legs (current leg in red),
  moving marker, ETA, five-stage tracker, **Confirm arrival at ED**.
- **Crew view tab (mobile friendly):** pick an ambulance (temporary login), big **Patient picked up** / **Arrived at hospital** buttons, Call 112 / 108.
- **Patient status tab:** live ambulance ETA and map once the hospital dispatches.

## Prioritization and Admin (Phase 12)

- **Queue order (95):** the Hospital Portal queue is sorted by severity, then risk, waiting time and distance. A "Sorted by" toggle switches to newest first,
  hovering a case explains its order, and the list re-sorts every 30 seconds so waiting time keeps counting.
- **Admin tab (96, 99):** enter the admin token (`ADMIN_DEV_TOKEN` from `server/.env`, temporary login). Date range and hospital filter, key numbers, golden-hour targets,
  five Recharts charts, each with a "Show as table" alternative, and a Backups section (back up now, verify, restore with a dry-run summary and a typed `RESTORE`).
  Empty states say "No data yet". Run `npm run seed:demo-history` in `server/` for simulated history.
- Install the new dependency with `npm install` (adds `recharts`).

## Sign-in (Phase 14)

The app opens on a sign-in screen. Pick the tab (Patient, Doctor, Hospital staff, Ambulance crew, Admin), enter email and password. The account decides the screen and which hospital, doctor or ambulance you see, so the pickers are gone.

1. `cd server`, then `npm run seed` and `npm run seed:users`.
2. Sign in with `patient@`, `doctor@`, `staff@`, `crew@` or `admin@` `healthtwin.demo`. Password is `HealthTwin#2026` unless `DEMO_PASSWORD` is set.
3. Use **Sign out** (top bar) to switch accounts.

The access token lives in memory only. The browser keeps a refresh cookie (httpOnly) and gets a new token when the old one expires; after 30 minutes idle you sign in again.
Old demo mode: set `VITE_DEV_AUTH=true` in the client and `DEV_AUTH=true` on the server to bring back the Demo login switcher and pickers.
Code: `src/lib/session.js` (token, refresh), `src/lib/authHeaders.js` (pure helpers, tested), `src/ui/LoginScreen.jsx`.

## Design system and role screens (Phase 13)

One medical look, five different interfaces. In demo mode use **Demo login** (top bar) to switch role; add `?role=doctor` to the URL to start as a role.
In development, `?ui-kit` shows every component in light and dark.

| Role | Accent and corners | Default theme | Screens |
|---|---|---|---|
| Patient | teal, very round | follows device | My emergency (reassuring sentence, ETA, five-step progress, map, Call 112/108), Find hospitals |
| Doctor | cobalt, tight | dark | My cases: vitals first, heart-rate trend, golden-hour timer, preparation, audited record |
| Hospital staff | emerald, sharp | follows device | Emergency queue (severity edge, countdown rings, takeover alarm), Ambulances board |
| Ambulance crew | burnt orange, round | follows device | My trip: one large action, high contrast |
| Admin | plum | dark | Analytics (theme-aware charts + tables), Backups (typed `RESTORE`) |

The ECG trace in the top bar is the connection indicator: it draws a beat when live, dashes while reconnecting and goes flat offline, always with a text label.
The faint cardiograph-paper background is the class `paper-bg`; delete it from `AppShell.jsx` to remove it.

**Files added**
- `src/ui/theme.css` (colour variables, role accents, dark theme, focus ring, reduced motion), `tailwind.config.js` (tokens as Tailwind colours)
- `src/ui/`: `AppShell`, `Button`, `Surface` (Card, Panel, StatTile, Badge, SeverityBadge), `Form`, `Feedback` (Skeleton, EmptyState, ErrorState, Toast), `Overlay` (Modal, Tooltip), `Data` (Table, ProgressRing, Timeline, Tabs), `EcgTrace`, `Sparkline`, `icons`, `UiKit`
- Pure helpers with tests: `ui/tokens.js`, `ui/vitals.js`, `ui/theme.js`, `ui/roles.js`, `lib/patientStages.js`, `lib/vitalsTrend.js`, `lib/connection.js` (tests in `ui/tokens.test.js` and `lib/connection.test.js`)
- `src/patient/` (PatientStepper, FindHospitals), `src/doctor/` (DoctorApp, DoctorCaseView, useDoctorCases), `portal/CountdownRing.jsx`, `admin/useChartColors.js`, `lib/doctorApi.js`, `lib/useConnection.js`

**Accessibility:** severity is always a shape plus a word plus a colour; every interactive target is at least 44px; visible focus ring; skip link; `aria-live` on connection,
patient status and form messages; dialogs trap focus and close on Escape; animation stops under reduced motion; charts keep a "Show as table"; text pairs measured at 4.5:1 or better in both themes.

**Vitals highlight ranges are simulated** (`ui/vitals.js`) and shown with a note. They are not clinical advice.

**For Jehal:** the role switcher, doctor picker, hospital picker, ambulance picker and admin token box are all temporary demo logins. Real login should set the role
(and the doctor, hospital or ambulance id) and replace them. Server: `middleware/requireDoctor.js` is a dev stub like the others, and `GET /api/doctors/dev-options` is dev-only (404 in production).
