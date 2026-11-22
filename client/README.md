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
