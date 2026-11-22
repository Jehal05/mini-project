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
