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

## Ambulance tracking (Phase 10)

- **Hospital Portal > Ambulance fleet:** register ambulances, live counts, maintenance toggle.
- **Case screen > Ambulance:** reserved ambulance, change it, **Dispatch**, live map with both route legs (current leg in red),
  moving marker, ETA, five-stage tracker, **Confirm arrival at ED**.
- **Crew view tab (mobile friendly):** pick an ambulance (temporary login), big **Patient picked up** / **Arrived at hospital** buttons, Call 112 / 108.
- **Patient status tab:** live ambulance ETA and map once the hospital dispatches.

## Prioritization and Admin (Phase 12)

- **Queue order (95):** the Hospital Portal queue is sorted by severity, then risk, waiting time and distance. A "Sorted by" toggle switches to newest first,
  hovering a case explains its order, and the list re-sorts every 30 seconds so waiting time keeps counting.
- **Admin tab (96, 99):** enter the admin token (`ADMIN_DEV_TOKEN` from `server/.env`, temporary login). Date range and hospital filter, key numbers, golden-hour targets,
  five Recharts charts, each with a "Show as table" alternative, and a Backups section (back up now, verify, restore with a dry-run summary and a typed `RESTORE`).
  Empty states say "No data yet". Run `npm run seed:demo-history` in `server/` for simulated history.
- Install the new dependency with `npm install` (adds `recharts`).

## Sign-in (Phase 14)

The app opens on a sign-in screen. Pick the tab (Patient, Doctor, Hospital staff, Ambulance crew, Admin), enter email and password. The account decides the screen and which hospital, doctor or ambulance you see, so the pickers are gone.

1. `cd server`, then `npm run seed` and `npm run seed:users`.
2. Sign in with `patient@`, `doctor@`, `staff@`, `crew@` or `admin@` `healthtwin.demo`. Password is `HealthTwin#2026` unless `DEMO_PASSWORD` is set.
3. Use **Sign out** (top bar) to switch accounts.

The access token lives in memory only. The browser keeps a refresh cookie (httpOnly) and gets a new token when the old one expires; after 30 minutes idle you sign in again.
Old demo mode: set `VITE_DEV_AUTH=true` in the client and `DEV_AUTH=true` on the server to bring back the Demo login switcher and pickers.
Code: `src/lib/session.js` (token, refresh), `src/lib/authHeaders.js` (pure helpers, tested), `src/ui/LoginScreen.jsx`.

## Patient records (Phase 15)

Signed-in patients get two more tabs. **My profile** has About me (details, photo, alert settings), Contacts (up to 3, ordered, test alert), Medical (heart conditions, conditions, allergies, medicines, hospital stays, family history) and Documents (PDF, JPG, PNG up to 5 MB).
**QR passport** shows the QR code, a print button, a "make a new code" button, and exactly what a stranger sees.
Scanning the code opens `/p/<token>`: a public page with Call 112 / 108 first, the emergency details, and "Send my location for this person" (bystander report).
Hospital staff have a **Patient passport** tab: paste the scanned link to open the full record (logged on the server).
New patients can create an account from the sign-in screen (Patient tab).
Needs `npm install` (adds `qrcode.react`). Code: `src/patient/*`, `src/passport/*`, `src/portal/PassportLookup.jsx`, `src/lib/patientApi.js`, `passportApi.js`, `patientRecord.js` (pure, tested).
Not built: scanning with the camera (paste the link instead), PDF patient report.

## Design system and role screens (Phase 13)

One medical look, five different interfaces. In demo mode use **Demo login** (top bar) to switch role; add `?role=doctor` to the URL to start as a role.
In development, `?ui-kit` shows every component in light and dark.

| Role | Accent and corners | Default theme | Screens |
|---|---|---|---|
| Patient | teal, very round | follows device | My emergency (reassuring sentence, ETA, five-step progress, map, Call 112/108), Find hospitals |
| Doctor | cobalt, tight | dark | My cases: vitals first, heart-rate trend, golden-hour timer, preparation, audited record |
| Hospital staff | emerald, sharp | follows device | Emergency queue (severity edge, countdown rings, takeover alarm), Ambulances board |
| Ambulance crew | burnt orange, round | follows device | My trip: one large action, high contrast |
| Admin | plum | dark | Analytics (theme-aware charts + tables), Backups (typed `RESTORE`) |

The ECG trace in the top bar is the connection indicator: it draws a beat when live, dashes while reconnecting and goes flat offline, always with a text label.
The faint cardiograph-paper background is the class `paper-bg`; delete it from `AppShell.jsx` to remove it.

**Files added**
- `src/ui/theme.css` (colour variables, role accents, dark theme, focus ring, reduced motion), `tailwind.config.js` (tokens as Tailwind colours)
- `src/ui/`: `AppShell`, `Button`, `Surface` (Card, Panel, StatTile, Badge, SeverityBadge), `Form`, `Feedback` (Skeleton, EmptyState, ErrorState, Toast), `Overlay` (Modal, Tooltip), `Data` (Table, ProgressRing, Timeline, Tabs), `EcgTrace`, `Sparkline`, `icons`, `UiKit`
- Pure helpers with tests: `ui/tokens.js`, `ui/vitals.js`, `ui/theme.js`, `ui/roles.js`, `lib/patientStages.js`, `lib/vitalsTrend.js`, `lib/connection.js` (tests in `ui/tokens.test.js` and `lib/connection.test.js`)
- `src/patient/` (PatientStepper, FindHospitals), `src/doctor/` (DoctorApp, DoctorCaseView, useDoctorCases), `portal/CountdownRing.jsx`, `admin/useChartColors.js`, `lib/doctorApi.js`, `lib/useConnection.js`

**Accessibility:** severity is always a shape plus a word plus a colour; every interactive target is at least 44px; visible focus ring; skip link; `aria-live` on connection,
patient status and form messages; dialogs trap focus and close on Escape; animation stops under reduced motion; charts keep a "Show as table"; text pairs measured at 4.5:1 or better in both themes.

**Vitals highlight ranges are simulated** (`ui/vitals.js`) and shown with a note. They are not clinical advice.

**For Jehal:** the role switcher, doctor picker, hospital picker, ambulance picker and admin token box are all temporary demo logins. Real login should set the role
(and the doctor, hospital or ambulance id) and replace them. Server: `middleware/requireDoctor.js` is a dev stub like the others, and `GET /api/doctors/dev-options` is dev-only (404 in production).

## Visual redesign (Phase 16)

A layer on top of the Phase 13 design system: near-black glass in dark theme (a soft role-coloured glow behind the panels), a beating heart, a heart-rate gauge, an ECG line, a floating pill nav on phones, and a three-column clinician board. The five role accents and radii are unchanged. Every simulated thing is labelled "simulated", and the footer "Simulated data for demonstration. Not a medical device." is on every screen.

- **Heart** (`ui/HeartHero.jsx`): a flat SVG heart by default. A procedural three.js heart (`Heart3D.jsx`, loaded only when needed) is used on capable devices that allow motion. It is capped at 30 fps, pauses on a hidden tab or when scrolled away, and falls back to the flat heart on low-power devices, without WebGL, with reduced motion, or on any error. To use a finished model see `src/assets/models/README.md`.
- **Patient home**: heart, gauge (60 to 100), ECG line, R-R interval and signal quality (all simulated in the browser by `lib/vitalsSim.js` until server monitoring exists) and a mood check-in saved by the server as a plain note (`GET/POST /api/patients/me/mood`; never on the QR passport, never shown to hospitals).
- **Clinician board** (`ui/ClinicalBoard.jsx`, used by the doctor case and hospital case screens): real vitals on the left, a hologram heart with callouts for out-of-range readings (ranges are simulated, see `ui/vitals.js`), and the timeline, patient record and a "Simulated analysis" card on the right. The analysis only restates which readings are outside the demo ranges. It gives no score and no diagnosis.
- **Theme**: `ui/theme.css`. `ui/contrast.test.js` reads that file and checks 4.5:1 contrast for text, severity colours and accents in both themes, including text on glass.
- **New dependency**: `three` (not yet installed here; run `npm install`).

Run the helper tests: `lib/visual.test.js`, `ui/contrast.test.js`.

### Manual checklist (not yet done by anyone)

Open `/?ui-kit` and each role screen, in dark and light, at 360, 768 and 1440 px:

- [ ] Patient home: heart beats at the gauge's rate; the gauge marker moves smoothly; the mood check-in saves and shows "Saved".
- [ ] Phone (360 px): the pill nav floats above the footer, every item has a name for screen readers, targets are at least 44 px, Call 112/108 stays visible at the top.
- [ ] Doctor and hospital case: the three columns appear at 1280 px and wider, and stack below it. Callouts show only for out-of-range readings, with a word and a shape as well as a colour.
- [ ] Take-over screen is still full red; the crew screen is still high contrast with one main action.
- [ ] Reduced motion (OS setting): no heartbeat, no scrolling ECG, no entrance slide; the flat heart is shown.
- [ ] WebGL off (browser flag) or a low-power phone: the flat heart is shown and nothing errors.
- [ ] Hidden tab: CPU drops to near zero (the 3D heart stops drawing).
- [ ] Keyboard only: every control reachable, focus ring visible, no trap.
- [ ] Screen reader: the gauge reads "Heart rate 88 bpm, within the range of 60 to 100"; the heart is announced as an illustration; moods are a radio group.
- [ ] First screen is usable in under 3 seconds on a mid-range phone (the 3D chunk loads after it).

### Not run or seen in Phase 16

No screen has been rendered by me. Not run: the three.js heart, the CSS glass and animations, the new Supertest-free mood route against a real MongoDB, and `npm install` for `three`. Checked only by syntax, import resolution, and the unit tests above.

## Inpatient care screens (Phase 11)

Signed-in hospital staff and doctors get an **Inpatients** item. Patients tab: who is in the hospital, and (staff) admit a patient to a free bed under a doctor. Beds tab: every bed with a shape and a word for its state, counts by ward, add, reserve, clean or remove a free bed. Opening a patient shows notes and vitals, prescriptions (doctors; an allergy warning appears while typing the drug name and again as a confirm step) and the discharge summary (doctors; confirm step, then it is fixed). Demo mode (no account) shows a sign-in message.

Not run or seen: none of these screens have been rendered or used against MongoDB. Manual check: sign in as hospital staff, add a CCU bed, admit a patient to it, sign in as a doctor, add a note and vitals, prescribe a drug matching an allergy on the patient's profile (expect the warning), discharge, then look at the patient's profile history and see the bed turn to cleaning.

## Live vitals and monitoring (Phase 5+6)

- `lib/liveVitals.js`, `lib/monitorSocket.js` and `patient/useLiveVitals.js` stream server vitals into the heart dashboard. If the server stream is unavailable the dashboard falls back to the client simulation. R-R interval and signal quality are always client-simulated.
- The detection badge (Watch / Urgent / Critical) shows only when the data comes from the server.
- Admin sidebar has a **Monitoring** panel (`admin/ScenarioPanel.jsx`) to set a patient's scenario.

Manual checklist: sign in as admin, open Monitoring, set Rahul to Cardiac event; sign in as Rahul and watch the badge go Watch, Urgent, Critical; sign in as hospital and see the new case in the queue.

## SOS and Digital Twin (Phase 7 + 4)

Patient home, signed in (`emergency/EmergencyArea.jsx`, lazy):
- Level 2 and 3 banner with an optional sound (plays on a rise only, after the first tap, can be muted on this device).
- "Are you okay?" with the four warning signs and a 10 s countdown read from the server's deadline. The browser never sends help by itself. "I'm okay" only opens the cancel dialog, which needs a reason.
- Live case card: search round and radius, contacts alerted and who has seen it, timeline, 112 and 108 buttons, location sharing (GPS with a manual fallback), first aid, past incidents.
- A red **SOS** button that asks once, then sends.
- `/status/<token>` is the public page for an emergency contact (no sign-in).
- **Digital Twin** card (`twin/`) compares each live vital with the patient's own usual, plus 24 h and 7 day trends and drift. Shown only while the server stream is on.

`emergency/constants.js` and `twin/constants.js` copy values from the root `shared/` folder; their tests fail if they drift.

Manual checklist: sign in as admin, set Rahul to Cardiac event; as Rahul, wait for "Are you okay?"; try "Send help now", the countdown running out, and cancelling with a reason; check the hospital queue only gets the case after it is sent; open a contact's `/status/<token>` link (shown in the dev server log or the WhatsApp link) and tap "I have seen this".
