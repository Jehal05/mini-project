# HealthTwin AI — Client, Phase 2 (location and hospital finding)

React + Vite + Tailwind + react-leaflet (OpenStreetMap, no API key).
Features 51–56: patient GPS, manual map pin, nearby hospitals, distances, hospital map, hospital search.

All hospitals are fictional demo data.

## Folder tree

```
client/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── src/
    ├── main.jsx                     # entry, loads Leaflet CSS + styles
    ├── App.jsx
    ├── index.css                    # Tailwind, medical background, glass cards, dark popups
    ├── api/hospitals.js             # getNearby, searchHospitals, errorMessage
    ├── hooks/useGeolocation.js      # feature 51
    ├── hooks/useDebouncedValue.js   # 400 ms drag / 300 ms search debounce
    ├── lib/mapIcons.js              # Vite marker fix + patient/hospital icons
    ├── utils/distance.js            # haversineKm, formatKm (same formula as server)
    ├── components/LocationMap.jsx   # feature 55
    ├── components/HospitalList.jsx  # features 53–54 list
    ├── components/HospitalSearch.jsx# feature 56
    ├── components/LocationStatus.jsx# features 51–52 controls
    └── pages/FindHospitals.jsx      # puts it all together
```

## Run server + client together

Terminal 1 (server, from the repo root):

```bash
cd server
npm install          # first time only
npm run seed         # first time only (or after changing seed data)
npm run dev          # http://localhost:5000
```

Terminal 2 (client):

```bash
cd client
npm install          # first time only
cp .env.example .env # Windows: copy .env.example .env
npm run dev          # http://localhost:5173
```

Open **http://localhost:5173**.

## Manual test script

| # | Do this | Expect |
| --- | --- | --- |
| a | Click **Use my location**, allow | Red pin + accuracy circle, badge "GPS (±N m)", hospitals listed nearest-first. (Real GPS is outside Pune, so set radius to 30 km or use the demo location to see hospitals.) |
| b | Reload, click **Use my location**, block | Amber message, manual mode banner; click the map → pin appears, list re-sorts |
| c | Click **Use demo location (Rahul, Shivajinagar)** | Pin at Shivajinagar, badge "Demo location", map fits pin + hospitals |
| d | Drag the pin across Pune | Distances change while dragging; list re-ranks ~0.4 s after you stop |
| e | Radius 5 km → 30 km | Fewer hospitals at 5 km; all 5 at 30 km from Shivajinagar |
| f | Tick **Cardiac care only** | Eastside General (no cath lab, no cardiologist) disappears |
| g | Search "heart" | Lotus Heart Institute and Airport Road Heart Centre with distances; click one → map flies there and opens its popup |
| h | Stop the server, move the pin | Red error card with **Retry**; start the server, click Retry → list returns |

## API tests (curl)

```bash
# 1. Search with distance, nearest first
curl "http://localhost:5000/api/hospitals/search?q=heart&lat=18.5308&lng=73.8475"
# → { "q":"heart", "origin":{"lat":18.5308,"lng":73.8475}, "count":2,
#     "hospitals":[ { "name":"Lotus Heart Institute (Demo)", "distanceKm":4.94, ... }, ... ] }

# 2. Search without location (sorted by name, no distanceKm)
curl "http://localhost:5000/api/hospitals/search?q=pune"
# → { "q":"pune", "origin":null, "count":5, "hospitals":[ ... ] }

# 3. Cardiac-capable hospitals only
curl "http://localhost:5000/api/hospitals/near?lat=18.5308&lng=73.8475&radiusKm=30&cardiacOnly=true"
# → { "origin":{...}, "radiusKm":30, "cardiacOnly":true, "count":4, "hospitals":[ ...nearest first, each with distanceKm ] }

# Validation: 400
curl "http://localhost:5000/api/hospitals/search?q=heart&lat=18.53"
# → { "error":"InvalidQuery", "message":"lat and lng must be given together" }
```

## Done when

- [ ] Rahul's pin shows on the map (GPS, manual or demo)
- [ ] Nearby hospitals are listed nearest-first with distances
- [ ] Moving the pin re-ranks the list
- [ ] The hospital map shows capability colours and popups
- [ ] Hospital search works with distances
- [ ] GPS denied or timing out falls back to manual selection

## Common errors

| Problem | Cause | Fix |
| --- | --- | --- |
| Markers invisible or broken image icons | Vite renames Leaflet's marker images | Already fixed in `src/lib/mapIcons.js`. If you add a plain `<Marker>` elsewhere, make sure that file is imported first |
| Map is grey or tiles don't load | Leaflet CSS missing, map container has no height, or no internet | Keep `import 'leaflet/dist/leaflet.css'` in `main.jsx`; the map wrapper needs a fixed height (it has one); check internet. OSM tiles are for development only — heavy use breaks their tile policy |
| "Location needs https" on a phone | Browsers only allow GPS on https or localhost; `http://192.168.x.x:5173` is blocked | Use the demo location or manual pin on the phone, or run `npx vite --host` behind an https tunnel such as ngrok |
| "Cannot reach the HealthTwin server" | Server not running, or wrong `VITE_API_URL` | Start `server` (`npm run dev`), check `client/.env`, restart `npm run dev` in client after changing `.env` |
| CORS error in the console | Client is not on the origin in the server's `CLIENT_URL` | Use http://localhost:5173 or add your origin to `CLIENT_URL` in `server/.env` |
