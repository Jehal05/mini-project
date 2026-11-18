# Phase 3 — Choosing the right hospital (features 57–60)

Given the patient's location, the server picks the hospitals that can handle a cardiac
emergency, ranks them with a transparent 0–100 score, and keeps alternatives ready for
when a hospital rejects. All capacity is simulated seed data until the bed and doctor
modules exist.

## What was added

```
server/
  ~ package.json                 + vitest, "npm test"
  ~ src/models/Hospital.js       + capabilities.updatedAt
  ~ src/routes/hospital.routes.js+ /rank, /:id, PATCH /:id/capabilities (+ socket emit)
  + src/config/ranking.js        weights, caps, TOP_N, radius steps
  + src/services/ranking.js      assessSuitability, scoreHospital, rankHospitals, nextRadius (pure)
  + tests/ranking.test.js        16 Vitest tests
client/
  ~ package.json                 + socket.io-client
  ~ src/api/hospitals.js         + rankHospitals, getHospital, updateCapabilities
  + src/lib/socket.js            one shared Socket.IO connection
  + src/hooks/useSocketEvent.js
  + src/utils/time.js            "2 min ago"
  + src/components/ScoreBar.jsx
  + src/components/CapabilityCard.jsx      feature 58
  + src/components/RankedHospitals.jsx     feature 59
  + src/components/AlternativeHospitals.jsx feature 60
  + src/components/CapabilityEditor.jsx    feature 58 demo controls
  ~ src/components/LocationMap.jsx rank numbers on markers, not-suitable at 40% opacity
  ~ src/lib/mapIcons.js, src/index.css
  ~ src/pages/FindHospitals.jsx  tabs: "Best for cardiac emergency" / "All nearby"
```

## How the score works

Weights live in `server/src/config/ranking.js` and must add up to 100.

| Factor | Max points | Rule |
| --- | --- | --- |
| Distance | 40 | 40 × (1 − distance ÷ radius), never below 0 |
| Cath lab | 20 | all or nothing |
| Cardiologist on duty | 15 | all or nothing |
| CCU beds free | 10 | 10 × min(free, 3) ÷ 3 |
| ICU beds free | 5 | 5 × min(free, 5) ÷ 5 |
| ALS ambulances | 10 | 10 × min(count, 2) ÷ 2 |

**Suitability (feature 57):** a hospital is *not suitable* if it has neither a cath lab nor
a cardiologist on duty, or if it has 0 CCU and 0 ICU beds free. A cardiologist without a cath
lab is suitable but warned "No cath lab — may need transfer". Ties break on shorter distance.

## Worked example — demo location 18.5308, 73.8475, radius 10 km

Distances are Haversine; MongoDB's `$geoNear` may differ by about 0.01 km.

| Rank | Hospital | Distance | Distance pts | Cath lab | Cardiologist | CCU | ICU | ALS | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Riverside Multispeciality (Demo) | 0 km | 40 | 20 | 15 | 0 (0 free) | 2 (2 free) | 5 (1) | **82.0** |
| 2 | Lotus Heart Institute (Demo) | 4.94 km | 20.2 | 20 | 15 | 10 (4 free) | 5 (6 free) | 5 (1) | **75.2** |
| 3 | Airport Road Heart Centre (Demo) | 8.16 km | 7.4 | 20 | 15 | 10 (3 free) | 5 (5 free) | 10 (2) | **67.4** |
| — | Eastside General (Demo) | 8.63 km | not suitable: no cath lab and no cardiologist | | | | | | — |
| — | TechPark Care (Demo) | 13.28 km | outside 10 km | | | | | | — |

Riverside is rank 1 although its CCU is full (warning "CCU full — ICU bed only"). That makes
a good demo: simulate Riverside rejecting ("no CCU bed") and Lotus moves up.

At 20 km TechPark joins: 40 × (1 − 13.28/20) = 13.4 + 0 + 15 + 6.7 + 4 + 0 = **39.1**,
with the warning "No cath lab — may need transfer".

## Run the tests

```bash
cd server
npm install
npm test
```

Expected:

```
 ✓ tests/ranking.test.js (16 tests)
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

## curl tests

Get hospital ids first: `curl http://localhost:5000/api/hospitals` (use `_id`).

```bash
# a) Ranking for the demo location
curl "http://localhost:5000/api/hospitals/rank?lat=18.5308&lng=73.8475&radiusKm=10"
# → { origin, radiusKm: 10, weights: {...}, suitableCount: 3,
#     top: [ { rank:1, hospital:{ name:"Riverside...", distanceKm:0, ... },
#              score:{ total:82, breakdown:[ {factor:"distance",points:40,max:40,detail:"0.0 km of 10 km"}, ... ] },
#              warnings:["CCU full — ICU bed only"] }, {rank:2 Lotus 75.2}, {rank:3 Airport 67.4} ],
#     alternatives: [], notSuitable: [ { hospital:{ name:"Eastside..." }, reasons:[...] } ],
#     excluded: [], suggestedRadiusKm: null }

# b) Riverside rejected → Lotus becomes rank 1
curl "http://localhost:5000/api/hospitals/rank?lat=18.5308&lng=73.8475&radiusKm=10&exclude=<RIVERSIDE_ID>"
# → top: [ Lotus 75.2, Airport 67.4 ], suitableCount: 2, suggestedRadiusKm: 20,
#   excluded: [ { _id:"<RIVERSIDE_ID>", name:"Riverside Multispeciality Hospital (Demo)" } ]

# c) Riverside runs out of critical-care beds → moves to notSuitable
curl -X PATCH "http://localhost:5000/api/hospitals/<RIVERSIDE_ID>/capabilities" \
  -H "Content-Type: application/json" -d '{"ccuBedsFree":0,"icuBedsFree":0}'
# → { hospital: { ..., capabilities: { ccuBedsFree:0, icuBedsFree:0, updatedAt:"..." } } }
curl "http://localhost:5000/api/hospitals/rank?lat=18.5308&lng=73.8475&radiusKm=10"
# → Riverside now in notSuitable with reason "No critical-care beds free"
# Reset it afterwards:
curl -X PATCH "http://localhost:5000/api/hospitals/<RIVERSIDE_ID>/capabilities" \
  -H "Content-Type: application/json" -d '{"icuBedsFree":2}'

# d) Small radius → wider search suggested
curl "http://localhost:5000/api/hospitals/rank?lat=18.5308&lng=73.8475&radiusKm=5"
# → top: [ Riverside 82, Lotus 55.5 ], suitableCount: 2, suggestedRadiusKm: 10

# Validation (400)
curl "http://localhost:5000/api/hospitals/rank?lat=18.53&lng=73.84&exclude=abc"
# → { error:"InvalidQuery", message:"exclude has invalid hospital ids: abc" }
curl -X PATCH "http://localhost:5000/api/hospitals/<ID>/capabilities" \
  -H "Content-Type: application/json" -d '{"ccuBedsFree":-1}'
# → { error:"InvalidBody", message:"ccuBedsFree must be a whole number from 0 to 999" }
```

## Manual UI test

| # | Do this | Expect |
| --- | --- | --- |
| a | Click **Use demo location** | "Best for cardiac emergency" tab: Riverside 82, Lotus 75.2, Airport 67.4; markers 1/2/3 on the map; Eastside faded |
| b | Click **Why this rank?** on any card | Six rows; points add up exactly to the total |
| c | **Simulate rejection** on Riverside | Lotus becomes rank 1 with "Moved up"; chip "Excluded: Riverside… (rejected)"; banner "Only 2 suitable hospitals within 10 km — Search 20 km"; **Undo** restores Riverside |
| d | Open the app in a second tab. In tab 1, **Demo controls** → Lotus → CCU 0, ICU 0 → **Save capacity** | Lotus drops to "Not suitable" with "No critical-care beds free" in **both tabs** without reloading |
| e | Radius 5 km | "Only 2 suitable hospitals within 5 km — Search 10 km" |
| f | **All nearby** tab | Phase 2 list, search and "Cardiac care only" still work |

## Done when

- [ ] The top 3 suitable hospitals come out ranked, with the score breakdown visible
- [ ] Not-suitable hospitals are listed with reasons
- [ ] Rejecting a hospital promotes the next alternative
- [ ] Capability changes re-rank live over Socket.IO
- [ ] All Vitest tests pass

## Common errors

| Problem | Cause | Fix |
| --- | --- | --- |
| `/api/hospitals/rank` returns `Invalid hospital id` | A `/:id` route is declared above `/rank`, so Express treats "rank" as an id | Keep fixed paths (`/near`, `/search`, `/rank`) **above** `/:id` in `hospital.routes.js` (they are) |
| 400 `exclude has invalid hospital ids` or a CastError | The exclude list holds names, or a trailing comma / space | Send Mongo `_id` values, comma-separated; the server trims blanks and rejects anything that is not an ObjectId |
| Capacity saved but other tabs don't re-rank | Socket not connected (CORS, wrong `VITE_API_URL`), or two connections created in React StrictMode | `CLIENT_URL` in `server/.env` must match the client origin; restart both after editing `.env`. The client uses one shared socket from `src/lib/socket.js` — don't call `io()` inside components |
| Lists show old capacity after reseeding | The page kept old results | Reload the page after `npm run seed` |
