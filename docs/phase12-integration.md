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
| `guard` on every emergency route (`emergency/routes.js` TODO) | Routes are open. Anyone who knows a case id can read or cancel it (**known gap**, see S-notes below) | Pass the real `guard`; patient routes limited to that patient, family link for acknowledge | `emergency.api.test.js`; e2e `security.test.mjs` (**add** ownership tests: patient A cannot read or cancel patient B's case) |
| Presenter key (`simulation/access.js`, `PresenterPanel.jsx`, `monitoring/api.js`) | Interim `PRESENTER_KEY` header | Replace with `central_admin` role. Remove the key prompt from the page | `access.test.js`; F7; journey a (the presenter panel step in `npm run dry-run`) |
| Socket `vitals:subscribe` check (`simulation/index.js` TODO) | Interim `defaultAuthorizeSubscribe` | Real check: patient, family link or hospital staff on the case | `simulation.api.test.js`; journeys **a, f, g** (they rely on the subscribe) |
| Patient model (`models/Patient.js`) | Placeholder model; `allergies`/`medications` stay `undefined` unless known | Keep `[]` meaning "known none", missing meaning "unknown". The aspirin rule depends on it | `shared/firstaid.test.js`; F8 (missing record hides aspirin, `[]` shows it); `models.test.js` |
| Emergency contacts (`contactsFor`, `patientRecordFor` hooks) | Read from the placeholder Patient | Point both hooks at Jehal's records | `emergency.service.test.js` (group "47: contact alerts"); journeys **d, h** |
| Admin room `central-admin` for `emergency:unresolved` (`service.js` line ~299, `shared/emergency.js`) | Event emitted; no admin portal listening | Agree the room name; admin portal must show the unresolved alert | `emergency.service.test.js` (group "45", unresolved); journey **e** (a socket client in `central-admin` receives it) |
| Detection audit log (`detection/service.js` `audit` option) | Not forwarded | Forward config changes to Jehal's audit log (feature 106 area) | `detection.service.test.js` |
| Detection role checks (`detection/routes.js` TODO) | Interim presenter key | config -> central_admin, thresholds -> doctor, history -> patient or their doctor | `detection.api.test.js` |
| Real notifier (email, web push) (`notifier` option) | Dev notifier logs only. Only the WhatsApp link is real | Provide `{ email, push }` with real providers and env vars | `emergency.service.test.js` (group "47"), **new** test per provider |

## Detection + Patient portal: twin (Phase 4)

| Hook | Today | When it lands | Tests |
|---|---|---|---|
| Feature 93, full risk score on the twin (`TODO(Jehal)`, blocked on feature 18) | Not built. Twin shows detection status only | Jehal's risk model supplies the score; show it in `features/twin/TwinCard.jsx` | **new test needed** |
| Trends route ownership (`GET /api/sim/patients/:id/trends`) | Open like the other sim routes | Same `guard` as history: patient, family link, doctor | `trends.api.test.js` (**add** ownership tests) |

## What was run in Phase 12 (the ticked part)

- [x] `discovery.notify` contract: called with round and radius 10/20/30 km, once per round, also after a server restart (journeys a, d, e, g, h with a labelled FAKE).
- [x] Accept races cancel: exactly one final state (F6, FAKE accept).
- [x] Presenter key enforced when set (F7).
- [x] Missing allergy record hides aspirin; known-empty record shows it (F8).
- [x] Family link leaks nothing beyond name, status, location (S1), tokens are 128-bit and wrong ones are 404 (S3).
- [x] Injection and bad input are 4xx, never a 500 or a stack trace (S4, S5).
- [x] A cancelled case cannot be revived or re-searched by replay (S6).
- [ ] Ownership checks: **not testable until Jehal's auth lands.** Today any caller with a case id can read or cancel it.
- [ ] Everything in the two tables above that says "new test needed" or "when it lands".
