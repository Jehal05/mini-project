# Phase 12: integration checklist

Everything on the Daksh track that waits for Jehal's or Puneet's code, what stands in for it today, and the exact
tests to run when the real thing lands. A box is ticked **only if it was run** (Phase 12, on the Daksh branch).
Unticked boxes are the work that is still to do when the other piece arrives.

Commands used below (from the repo root):

```bash
# backend (real MongoDB; REQUIRE_DB_TESTS=1 makes a missing database a failure, not a skip)
cd backend && REQUIRE_DB_TESTS=1 npx vitest run
# browser journeys (rebuild the frontend first)
cd e2e && npm run build:frontend && npm test
```

## Puneet: hospital discovery, accept, ambulance, hospital portal

| Hook (where) | Today | When Puneet's code lands | Tests to re-run |
|---|---|---|---|
| `discovery.notify({ caseId, round, radiusKm, location, caseSnapshot })` (`emergency/index.js`, `service.js` `notifyDiscovery`) | **FAKE** in `e2e/harness/server.mjs` records calls; default in the backend does nothing | Pass the real discovery to `attachEmergency`. Confirm it is called once per round with 10, 20, 30 km | `emergency.service.test.js` (group "45: escalation 10 -> 20 -> 30 km"); journeys **a, d, e, g, h** |
| Hospital accept (`EmergencyCase.acceptIfPending`, needs status `searching` and a notified hospital) | **FAKE** `POST /__e2e/hospital-accept` flips `searching -> accepted` and emits `emergency:ack` | Replace with the real accept route. Check it also emits an event the patient page listens to (`emergency:*` in `shared/emergency.js`) | `accept.db.test.js`; journey **a** (step "hospital accepts"); F6 (accept vs cancel race) |
| Accepting a case that is `unresolved` (no hospital can accept it today) | Not possible: `acceptIfPending` needs `searching` | Decide with Puneet: allow accept from `unresolved`, or keep unresolved final. Then add a test | none yet: **new test needed** |
| Hospital and crew socket rooms (`shared/emergency.js` hospital rooms, `service.js` cancel notice, TODO(Puneet)) | Event is emitted to `hospital:<id>`; nobody listens | Confirm the room names; hospital portal must show "cancelled" and the crew must be released | `emergency.service.test.js` (group "49: cancellation"); **new** browser test in the hospital portal |
| Hospital portal screens | Not on this branch | Run the axe audit on them | `cd e2e && npm run a11y` (add the new states) |

## Jehal: auth, patient model, records, central admin

| Hook (where) | Today | When Jehal's code lands | Tests to re-run |
|---|---|---|---|
| `guard` on every emergency route (`emergency/routes.js` TODO) | **Done** (`jehal-integration`). Was: routes are open. Anyone who knows a case id can read or cancel it (**known gap**, see S-notes below) | Pass the real `guard`; patient routes limited to that patient, family link for acknowledge | `emergency.api.test.js`; e2e `security.test.mjs` (**add** ownership tests: patient A cannot read or cancel patient B's case) |
| Presenter key (`simulation/access.js`, `PresenterPanel.jsx`, `monitoring/api.js`) | **Done** (`jehal-integration`). Backend: `central_admin` role. The stand-alone `npm run dev` server still uses the key; the frontend must log in before it can use the integrated server. Was: interim `PRESENTER_KEY` header | Replace with `central_admin` role. Remove the key prompt from the page | `access.test.js`; F7; journey a (the presenter panel step in `npm run dry-run`) |
| Socket `vitals:subscribe` check (`simulation/index.js` TODO) | **Done** (`jehal-integration`). Handshake takes the access token. Was: interim `defaultAuthorizeSubscribe` | Real check: patient, family link or hospital staff on the case | `simulation.api.test.js`; journeys **a, f, g** (they rely on the subscribe) |
| Patient model (`models/Patient.js`) | **Done** (`jehal-integration`). Real model. `Patient.listsConfirmed` is what makes `[]` mean "known none". Was: placeholder model; `allergies`/`medications` stay `undefined` unless known | Keep `[]` meaning "known none", missing meaning "unknown". The aspirin rule depends on it | `shared/firstaid.test.js`; F8 (missing record hides aspirin, `[]` shows it); `models.test.js` |
| Emergency contacts (`contactsFor`, `patientRecordFor` hooks) | **Done** (`jehal-integration`). Read the patient's own contacts by priority through `toTwinRecord`. Was: placeholder Patient | Point both hooks at Jehal's records | `emergency.service.test.js` (group "47: contact alerts"); journeys **d, h** |
| Admin room `central-admin` for `emergency:unresolved` (`service.js` line ~299, `shared/emergency.js`) | **Done** (`jehal-integration`). Sockets for `central_admin` join the room at connect; the admin portal shows the alert live and loads the list from `GET /api/emergency/unresolved` (central admin only). Was: event emitted, no admin portal listening | Agree the room name; admin portal must show the unresolved alert | `emergency.service.test.js` (group "45", unresolved); journey **e** (a socket client in `central-admin` receives it) |
| Detection audit log (`detection/service.js` `audit` option) | **Done** (`jehal-integration`). Entries are `threshold.update`. Was: not forwarded | Forward config changes to Jehal's audit log (feature 106 area) | `detection.service.test.js` |
| Detection role checks (`detection/routes.js` TODO) | **Done** (`jehal-integration`). Was: interim presenter key | config -> central_admin, thresholds -> doctor, history -> patient or their doctor | `detection.api.test.js` |
| Real notifier (email, web push) (`notifier` option) | Dev notifier logs only. Only the WhatsApp link is real | Provide `{ email, push }` with real providers and env vars | `emergency.service.test.js` (group "47"), **new** test per provider |

## Detection + Patient portal: twin (Phase 4)

| Hook | Today | When it lands | Tests |
|---|---|---|---|
| Feature 93, full risk score on the twin | **Done** (`jehal-integration`). Backend scores the real profile live; `TwinCard` shows the score with profile and readings parts. Was: not built. Twin shows detection status only | Jehal's risk model supplies the score; show it in `features/twin/TwinCard.jsx` | **new test needed** |
| Trends route ownership (`GET /api/sim/patients/:id/trends`) | **Done** (`jehal-integration`). Was: open like the other sim routes | Same `guard` as history: patient, family link, doctor | `trends.api.test.js` (**add** ownership tests) |

## What was run in Phase 12 (the ticked part)

- [x] `discovery.notify` contract: called with round and radius 10/20/30 km, once per round, also after a server restart (journeys a, d, e, g, h with a labelled FAKE).
- [x] Accept races cancel: exactly one final state (F6, FAKE accept).
- [x] Presenter key enforced when set (F7).
- [x] Missing allergy record hides aspirin; known-empty record shows it (F8).
- [x] Family link leaks nothing beyond name, status, location (S1), tokens are 128-bit and wrong ones are 404 (S3).
- [x] Injection and bad input are 4xx, never a 500 or a stack trace (S4, S5).
- [x] A cancelled case cannot be revived or re-searched by replay (S6).
- [x] Ownership checks (on `jehal-integration`, `backend/test/identity/monitoring.test.js`): patient B cannot read, cancel, confirm or change patient A's case; strangers get the same 404 as unknown ids.
- [ ] Everything in the two tables above that says "new test needed" or "when it lands".

## Jehal integration (branch `jehal-integration`)

- Run the full server with `cd backend && npm run seed && npm run dev:api` (port 5000). Daksh's stand-alone `npm run dev` is unchanged.
- Rules live in `backend/src/access/monitoringAccess.js`: patient = own data (id from the token); hospital staff = a patient their hospital accepted or admitted (each view is a `record.view` audit entry, at most one per five minutes); `central_admin` = detection settings and presenter controls; `doctor` = one patient's thresholds.
- Sockets: connect with `io(url, { auth: { token } })`. Rooms are joined for you: `patient:<id>` (own), `hospital:<id>`, `central-admin`.
- **Frontend merged:** `frontend/` now holds the login, profile, hospital and admin portals as well as Daksh's screens. The access token goes on every monitoring/detection/emergency request (renewed once on `TOKEN_EXPIRED`) and in the socket `auth`. Vite proxies `/api` and `/socket.io` to port 5000. A patient reaches the live dashboard at `/patient/monitor`; `/presenter` needs the `central_admin` role (the presenter key box is no longer used). My plain CSS is scoped under `.ht-legacy` so it cannot restyle the Tailwind pages.
- Puneet: pass your hospital search as `discovery` to `createMonitoring({ io, discovery })`, and write `HospitalCase` rows (`recordHospitalCase`) when a hospital is told about a case, so accepted hospitals get access.

- **Socket sessions:** a connected socket is re-checked every 60 s (`SOCKET_RECHECK_MS`); after logout, password reset or deactivation it receives `auth:ended` and is closed.

## Hospital response and ambulance (features 51-80, 95, 103, 105, 107): built

Code: `backend/src/response/` (discovery, ranking, response service, ambulance service and simulator, routes), `shared/response.js`
(events, trip stages, golden-hour clocks, prioritisation), `frontend/src/features/response/` (screens).

- **Wiring:** `createMonitoring` builds the discovery itself unless one is passed in. A case that is sent notifies the top 3 hospitals
  by score (distance 40 + capability 40 + load 20, breakdown returned). A wider round notifies the next 3. A rejection notifies the next one.
- **Accept:** the first hospital to call `POST /api/response/cases/:id/accept` wins through `EmergencyCase.acceptIfPending`. The others get
  `Accepted by another hospital`. Accepting writes the `HospitalCase` row that opens live vitals to that hospital, and dispatches the
  nearest available ambulance (ALS first).
- **Ambulance:** moves every 2 s along a straight line (times a road factor) and says so (`simulated: true`). `AMBULANCE_SPEED_KMH` changes the speed.
  There is no routing service in the demo; `routeFor` is the one place to plug a Directions API in.
- **Screens:** hospital portal tabs Incoming (queue, countdown, red takeover with alarm), Ambulances, Crew view; case page with
  handover, doctor, preparation and golden-hour clocks. Patient: `/patient/emergency` (tracker) and `/patient/hospitals` (finder).
- **Not built:** web push to closed tabs (the notifier is still a console stub), a real Directions API, admission opening itself on
  arrival (staff use Admissions), prioritised admin queue and analytics (see the next section when they land).
