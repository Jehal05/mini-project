# HealthTwin AI — Backend, Phase 1 (foundation)

Express + MongoDB (Mongoose) + Socket.IO. This phase sets up the server, the three core
schemas (Hospital, Ambulance, EmergencyCase), fictional Pune seed data and a Socket.IO
connectivity test. Later phases (hospital discovery, alerts, ambulance) build on it.

All data is fictional. No real hospitals or patients.

## Folder tree

```
healthtwin-server/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── public/
│   └── socket-test.html          # Socket.IO test client (served in development)
└── src/
    ├── server.js                 # Entry: .env, MongoDB, HTTP + Socket.IO
    ├── app.js                    # Express app: CORS, JSON, routes, errors
    ├── config/
    │   ├── db.js                 # MongoDB connect / status / disconnect
    │   └── cors.js               # Allowed origins from CLIENT_URL
    ├── models/
    │   ├── geo.js                # GeoJSON Point sub-schema [lng, lat]
    │   ├── Hospital.js           # 2dsphere location + cardiac capabilities
    │   ├── Ambulance.js          # BLS/ALS, crew, status, location
    │   ├── EmergencyCase.js      # Case with timeline, auto ID EC-YYYY-NNNN
    │   └── Counter.js            # Atomic counters for sequential IDs
    ├── routes/
    │   ├── health.routes.js      # GET /api/health
    │   └── hospital.routes.js    # GET /api/hospitals, /api/hospitals/near
    ├── middleware/
    │   └── errorHandler.js       # 404 + JSON { error, message }
    ├── utils/
    │   └── http.js               # HttpError + asyncHandler
    ├── socket/
    │   └── index.js              # Rooms: hospital:<id>, patient:<id>, admin
    └── seed/
        ├── data.js               # 5 fictional hospitals, 8 ambulances
        └── seed.js               # npm run seed
```

## Setup and run

Requires Node.js 18+ and MongoDB 4.2+ (local or Atlas).

```bash
cd healthtwin-server
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env`:

- **Local MongoDB:** keep `MONGO_URI=mongodb://127.0.0.1:27017/healthtwin` and make sure MongoDB is running.
- **MongoDB Atlas:** create a free cluster → Database Access: add a user → Network Access: add your IP
  → Connect → Drivers → paste the URI into `MONGO_URI` (add `/healthtwin` before the `?`).

Then:

```bash
npm run seed     # loads 5 hospitals + 8 ambulances (safe to run again)
npm run dev      # starts the server with auto-reload on http://localhost:5000
```

## Test it

```bash
# 1. Health
curl http://localhost:5000/api/health
# → {"status":"ok","db":"connected","time":"..."}

# 2. All hospitals
curl http://localhost:5000/api/hospitals

# 3. Nearest hospitals to Shivajinagar, within 10 km
curl "http://localhost:5000/api/hospitals/near?lat=18.5308&lng=73.8475&radiusKm=10"
# → hospitals sorted nearest-first, each with distanceKm

# 4. Validation (should return 400)
curl "http://localhost:5000/api/hospitals/near?lat=abc&lng=73.84"
```

Socket.IO: open **http://localhost:5000/socket-test.html**. It connects, joins `admin`
and sends `ping:test` automatically. You should see `Received pong:test` with a server time.

## API

| Method | Route | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ status, db, time }` |
| GET | `/api/hospitals` | `{ count, hospitals }` (active only) |
| GET | `/api/hospitals/near?lat=&lng=&radiusKm=` | `{ origin, radiusKm, count, hospitals[] }` nearest-first, each with `distanceKm`. `radiusKm` defaults to 10, max 100 |

The near route uses `$geoNear`, the aggregation form of `$near`: same nearest-first
order on the 2dsphere index, and it also returns each hospital's distance.

## Socket.IO events

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `join` | `{ role, hospitalId?, patientId? }` + optional ack callback |
| server → client | ack / `joined` | `{ ok: true, rooms: [...] }` |
| server → client | `join:error` | `{ ok: false, error }` (when no ack callback) |
| client → server | `ping:test` | any |
| server → client | `pong:test` | `{ message: "pong", echo, serverTime }` |

Roles: `patient`, `doctor`, `hospital_staff`, `hospital_admin`, `crew`, `admin`.
Rooms: `admin`, `hospital:<id>`, `patient:<id>`.
From Phase 2, room membership should come from the verified JWT, not from the client.

Later phases emit with:

```js
import { getIO } from './socket/index.js';
getIO().to(`hospital:${hospitalId}`).emit('hospital:alert', caseData);
```

## Done when

- [ ] Server starts on port 5000 with no errors
- [ ] `/api/health` shows `"db": "connected"`
- [ ] `npm run seed` loads 5 hospitals and 8 ambulances
- [ ] `/api/hospitals/near` returns hospitals nearest-first with distances
- [ ] The test page receives `pong:test`

## Common errors

| Error | Cause | Fix |
| --- | --- | --- |
| `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running, or the URI is wrong | Start MongoDB (`mongod`, or the MongoDB service on Windows). For Atlas: check the URI, the password (URL-encode special characters) and that your IP is in Network Access |
| Browser: `blocked by CORS policy` | The frontend's origin is not in `CLIENT_URL` | Set `CLIENT_URL` to the exact origin, e.g. `http://localhost:5173` (no trailing slash). Comma-separate several. Restart the server |
| `unable to find index for $geoNear query` / `$near requires a 2dsphere index` | The 2dsphere index was not built yet | Run `npm run seed` (it calls `syncIndexes()`), or restart the server so Mongoose builds the indexes. Check that `location` is `{ type: "Point", coordinates: [lng, lat] }` — longitude first |
