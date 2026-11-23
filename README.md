# HealthTwin AI

Software-only, multi-hospital cardiac emergency response platform (fictional data only).

## Structure

- `backend/`: Express + MongoDB + Socket.IO API.
  - Identity, profiles, QR passport, hospitals, reports (Jehal): `src/controllers`, `src/routes`, `src/models`, `src/middleware`. See [docs/identity-server.md](docs/identity-server.md).
  - Monitoring, detection and emergency (Daksh): `src/simulation`, `src/detection`, `src/emergency`.
  - `src/access/`: the access rules that connect the two (JWT roles, patient ownership, socket handshake).
  - `src/monitoring.js`: mounts the monitoring modules into the server with those rules. `src/dev/server.js` is Daksh's stand-alone demo server (presenter key, no login).
- `frontend/`: React app with the patient twin and monitoring screens (Daksh).
- `shared/`: constants and helpers used by both sides.
- `docs/`: phase notes and the integration checklist.

## Run the backend

```
cd backend && npm install
npm run seed     # five fictional hospitals, demo accounts (password is printed), three monitored patients
npm run dev:api  # the full server: identity + monitoring with real access control (port 5000)
npm test         # monitoring/detection/emergency tests, then identity/hospital tests (needs MongoDB, see docs)
```
