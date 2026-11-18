# HealthTwin AI

A software-only, multi-hospital cardiac emergency response platform (college project).
A patient's simulated vitals flag a potential cardiac emergency, the nearest suitable
hospitals are alerted in real time, one accepts, and an ambulance is dispatched.

All data is simulated and fictional. Not a medical device.

## Repository layout

| Folder | What it is | Docs |
| --- | --- | --- |
| `server/` | Node.js + Express + MongoDB + Socket.IO API | [server/README.md](server/README.md) |
| `client/` | React + Vite + Tailwind + Leaflet web app | [client/README.md](client/README.md) |

## Progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Backend foundation: server, schemas, seed data, Socket.IO | Built |
| 2 | Location and hospital finding (features 51–56) | Built |
| 3 | Choosing the right hospital (57–60) | Next |

## Quick start

```bash
# Terminal 1
cd server && npm install && cp .env.example .env && npm run seed && npm run dev

# Terminal 2
cd client && npm install && cp .env.example .env && npm run dev
```

Open http://localhost:5173 and click **Use demo location (Rahul, Shivajinagar)**.
