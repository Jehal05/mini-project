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
