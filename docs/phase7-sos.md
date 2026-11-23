# Phase 7: SOS and emergency management (Daksh, features 41–50, 104, plus the 42 alerts)

Takes the case that Phase 6 opens and carries it from "Are you okay?" to a hospital search, contact alerts, location, cancellation and history. Everything is simulated and labelled **not a medical device**. Call 112 and Call 108 stay visible during an emergency.

## Run it

```bash
cd backend && npm run dev                     # REST under /api/emergency, with sim + detection
cd frontend && npm run dev
EMERGENCY_ROUND_SECONDS=15 npm run dev        # (backend) shortens the 60 s search round, to show escalation on stage
```

Presenter panel: switch Rahul to **Cardiac event**. At Level 3 the dashboard shows "Are you okay?" with a 10 s countdown. Do nothing and the server sends it; then watch the search widen 10 → 20 → 30 km and end at "Call 112 now". Or press **SOS** (asks once, then sends).

## Case state machine

```
                         patient "Send help now" / SOS during the countdown
awaiting_confirmation ──┬──────────────────────────────────────────────────┐
   (10 s, server timer) └── deadline passes with no answer (auto-send) ─────┤
        │                                                                   ▼
        │                      searching ──(hospital accepts, Puneet)──▶ accepted ▶ ambulance_assigned ▶ patient_on_board ▶ arrived ▶ admitted ▶ closed
        │                         │ 60 s, nobody accepts: round 1 (10 km) → 2 (20 km) → 3 (30 km)
        │                         └── after round 3 ▶ unresolved  (central admin alerted, patient told to call 112)
        └── cancel with a reason, from awaiting_confirmation up to patient_on_board (also unresolved) ▶ cancelled
```

A manual SOS with no open case starts directly in `searching` (round 1): the patient has already decided.

**Every transition is one atomic conditional update**, filtered on the status it expects (the same pattern as `EmergencyCase.acceptIfPending`). It is never "read, decide, write". So when two things race, the first to commit wins and the other matches nothing and is ignored:

| Race | Outcome |
|---|---|
| Deadline and "Send help now" | One moves `awaiting_confirmation → searching`. Exactly one `emergency:sent`, one discovery call. |
| Deadline and cancel | Cancel first: nobody is ever notified. Send first: the cancel proceeds as a normal cancel. |
| Hospital accepts and cancel | Accept first: cancel is recorded with `afterAcceptance: true`, the hospital room hears `emergency:cancelled`. Cancel first: `acceptIfPending` returns `null`. |
| Round timer and accept | The timer's update needs `status: searching` **and** the round it was armed for, so an accepted, cancelled or already-widened case is not widened. |
| Two SOS presses, or SOS during a Level 3 | One live case per patient (partial unique index, Phase 6). SOS joins it. |
| Late "sent" after "cancelled" | `Detection.outcome` only moves forward, so it never goes back. |

**The server owns the clocks.** The 10 s deadline is stored on the case (`escalation.confirmDeadline`) and the round start in `escalation.roundStartedAt`. The browser only displays the time left, corrected by the `serverNow` the API sends. On start-up `EmergencyService.start()` re-arms every case still in `awaiting_confirmation` or `searching`, so a restart mid-countdown still sends on time. A past-due deadline sends straight away.

## Features

| # | What | Where |
|---|---|---|
| 41 Manual SOS | Button asks once, then `POST /sos`. Joins the live case or opens a `manual_sos` case. | `service.sos`, `SosDialog.jsx` |
| 42 Automatic alerts | Level 2 and 3 show a banner. The sound plays only when the level **rises**, only after the person's first tap on the page (browser rule), and can be muted (kept on this device). Opening the page already at Level 2 shows the banner without a beep. | `LevelAlert.jsx`, `alertSound.js` |
| 43 Confirmation | "Are you okay?" with the four AHA warning signs. Ticks are saved at once, so they survive an automatic send. "I'm okay" only opens the cancel dialog. | `ConfirmationScreen.jsx`, `service.confirm`, `recordSymptoms` |
| 44 Countdown | 10 s, server-authoritative; auto-send marks `symptoms.noResponse` (unless the patient ticked something). | `service.autoSend`, `arm`, `clock.js` |
| 45 Escalation | 60 s per round, 10 → 20 → 30 km, discovery hook called every round, then `unresolved` + admin alert + patient told to call 112. | `service.escalate`, `CaseStatus.jsx` |
| 46 Location | GPS (throttled to one update per 10 s) with a manual fallback. Source, accuracy and address are stored. | `LocationShare.jsx`, `service.updateLocation` |
| 47 Contact alerts | Once per case, when it is sent: an email via the notifier, and a pre-filled `wa.me` link the patient taps. Each contact gets a private status link. | `service.alertContacts`, `notifier.js` |
| 48 Acknowledgements | `POST /:id/ack`, once per recipient. Family tap "I have seen this" on their link (no login). | `service.acknowledge`, `FamilyStatus.jsx` |
| 49 Cancellation | Reason from `CANCEL_REASONS`; after acceptance it also informs the hospital and names the ambulance. | `service.cancel`, `CancelDialog.jsx` |
| 50 Incident history | The patient's cases, newest first, each with its timeline. | `GET /mine`, `EmergencyHistory.jsx` |
| 104 First aid | One-tap 112/108, steps from MedlinePlus (credited on screen), "follow the dispatcher first". Aspirin only if the record clearly allows it. | `shared/firstaid.js`, `FirstAid.jsx` |

**Aspirin rule** (`aspirinAdvice`): shown only if the record says **explicitly** that there is no aspirin or NSAID allergy and no blood thinner (and no bleeding disorder or ulcer in `conditions`). A missing field, or no record, means **not shown**: unknown is never treated as "none". The step itself still says to ask the dispatcher, and never gives a dose. In the demo only Ananya has a clear record (`allergies: []`, `medications: []`).

## Detection outcome (feature 40)

`sent` when the case is sent, `cancelled` or `false_alarm` when it is cancelled. The update is conditional, so the outcome only moves forward (`case_created → sent → cancelled`).

## Events (Socket.IO, room `patient:<id>`)

Every payload carries `caseId, patientId, patientCode, status, simulated: true, serverNow`.

| Event | When | Extra fields |
|---|---|---|
| `emergency:created` | A case opened (Phase 6, or SOS) | |
| `emergency:confirmed` | The patient sent it (button or SOS) | `how` |
| `emergency:sent` | Moved to `searching` (manual or auto) | `how: manual \| sos \| auto`, `round`, `radiusKm` |
| `emergency:escalated` | A wider round began | `round`, `radiusKm` |
| `emergency:unresolved` | Three rounds, no accept | `message`, `numbers`. Also sent to room `central-admin`. |
| `emergency:cancelled` | Cancelled | `reason`, `afterAcceptance`, `hospitalId?`, `ambulanceId?`. Also to room `hospital:<id>` when a hospital had accepted. |
| `emergency:location` | Location changed | `location` |
| `emergency:contacts` | Contacts alerted | `count` |
| `emergency:ack` | Someone tapped "Seen" | `recipientType`, `recipientId`, `name` |

Constants: `EMERGENCY_EVENTS`, `ADMIN_ROOM`, `hospitalRoom()` in `shared/emergency.js`.

## REST (`/api/emergency`)

| Method and path | Purpose |
|---|---|
| `POST /sos` `{ patient, location? }` | 201 new case, 200 joined an open one |
| `GET /active?patient=` | The live case (restores the screen after a reload) + `serverNow` |
| `GET /mine?patient=&page=&limit=` | Incident history (limit 1–50) |
| `GET /first-aid?patient=` | Steps for this patient (aspirin rule applied) |
| `GET /:caseId` | One case with its timeline |
| `PUT /:caseId/symptoms` `{ symptoms }` | Save ticks during the countdown |
| `POST /:caseId/confirm` `{ symptoms? }` | Send now. 200 `{ changed }` (idempotent), 409 if cancelled/closed |
| `POST /:caseId/cancel` `{ reason, note? }` | 409 once the patient has arrived or it is already cancelled |
| `PUT /:caseId/location` `{ lat, lng, accuracyM?, source?, address? }` | Live cases only |
| `POST /:caseId/ack` | Record "Seen" |
| `GET /status/:token`, `POST /status/:token/seen` | Family link. **No login**: the 128-bit token is the credential. |

`patient` is the Mongo `_id` or the code (`HT-2026-0001`). Bad input returns 400 with the reason.

## For Puneet

```js
const emergency = await attachEmergency({ app, io, detection, discovery })
// discovery.notify({ caseId, round, radiusKm, location, caseSnapshot })  -> your hospital search
```

- **Start discovery from `emergency:sent` / the first `discovery.notify` call, not from `emergency:created`.** `notify` is called again with a wider `radiusKm` at each round. A failure in your hook is logged and does not stop escalation.
- `acceptIfPending` needs `status: searching`. After round 3 the case is `unresolved` and cannot be accepted. If a late accept should still work, say so and I will allow it.
- On cancel after acceptance, `emergency:cancelled` goes to room `hospital:<hospitalId>` and carries `ambulanceId`. Release the ambulance and tell the crew from there. TODO(Puneet): confirm the room names and add the crew room.
- Cancel does not touch `hospitalResponses`; the case status is the source of truth.

## For Jehal

- Every `/api/emergency` route takes the `guard` you pass to `attachEmergency`; only the family-link routes are open. TODO(Jehal): patient routes should check "that patient only"; cancel also for hospital staff on the case; ack also for family links. Today anyone who knows a case id can confirm or cancel it.
- `emergency:unresolved` is sent to room `central-admin`. TODO(Jehal): your admin portal listens there, and the room join needs the `central_admin` role.
- The placeholder `Patient` gained `allergies`, `medications` (undefined unless known) and `emergencyContacts` (`name, relation, phone, email`). Your model should provide them under the same names, or pass `patientRecordFor` and `contactsFor` to `attachEmergency`. Phone numbers need the country code for `wa.me`.

## Configuration

| Name | Purpose |
|---|---|
| `PUBLIC_APP_URL` | Base of the family status links (default `http://localhost:5173`) |
| `EMERGENCY_ROUND_SECONDS` | Dev server only. Shortens the 60 s round for demos |
| `notifier` option | `{ email?(msg), push?(msg) }`. The default only logs ("nothing sent") |

**No real email or web push is wired.** Provider keys (an email API key, VAPID keys) would be read by a real notifier that someone writes and passes in; none exists yet, so no such variables are defined.

## What changed in earlier phases

- `models/EmergencyCase.js`: `whatsappLink` on contact alerts and a sparse index on `contactAlerts.statusLinkToken`.
- `models/Patient.js` (placeholder), `dev/seed.js`: the fields above, with fictional contacts for Rahul and Ananya.
- `shared/emergency.js`: events, rooms, status groups, ack types, emergency numbers. New `shared/firstaid.js`.
- `PatientDashboard.jsx`: the SOS placeholder dialog is replaced by the real flow (lazy-loaded); `App.jsx` has the `/status/:token` route.

## Tests

| Folder | Count | What they cover |
|---|---|---|
| `backend` | 223 (59 new) | Every race above on a real MongoDB (20-way deadline vs send, cancel vs accept, round timer vs accept, 10 simultaneous SOS), restart resume, outcome ordering, contacts, "Seen" once, history, validation, the HTTP + socket flow from a cardiac event to cancel |
| `frontend` | 156 (60 new) | Countdown from the server clock, nothing auto-sent by the browser, symptom saving, cancel needs a reason, alerts and sound rules, GPS throttling and manual fallback, first aid, SOS dialog, history, family page |
| `shared` | 42 (9 new) | The aspirin rule and first-aid content |

Each behaviour was checked against a deliberately naive version (send ignoring status, escalation ignoring the round, cancel only before acceptance, outcome overwrite, duplicate "Seen", no restart resume, browser auto-send at zero, beeping on every update, hard-coded aspirin, no GPS throttle, cancel without a reason, ...) and the tests failed on every one.

## Known limits

- **First-aid wording** is a short summary of MedlinePlus (checked against Mayo Clinic). A clinician on the team must review it before any real use.
- **Email and push**: see Configuration. Web push also needs subscription storage, which does not exist.
- **Accuracy circle**: the location card shows the accuracy in metres. Drawing it on a map belongs with the GPS and map features (51, 52). Manual entry needs coordinates; there is no address search.
- **Contact alerts** go out once, when the case is sent. Level 2 does not alert contacts (only the patient).
- The patient's own screen contains the `wa.me` link, which includes the contact's status link, so the patient could open it. That is inherent to a link the patient sends, and harmless (it only allows "Seen").
- The 10 s and 60 s timers live in one process, like detection. Two server instances would each arm timers (the atomic updates still prevent double sends or double widening, but the alerts and discovery calls could repeat).
- No ownership checks on routes until Jehal's auth (see above).
