# Phase 6: Emergency detection engine (Daksh, features 31–40)

Turns the simulated readings from Phase 5 into classified emergencies. It watches every reading, applies a table of rules, shows a severity level and a risk gauge, keeps a history, and at Level 3 opens exactly one `EmergencyCase`. Everything is simulated and labelled **not a medical device**.

## Run it

```bash
cd backend && npm run dev        # detection starts with the simulation (REST under /api/detection)
cd frontend && npm run dev       # the dashboard and presenter page show it
```

In the presenter panel, switch Rahul to **Cardiac event**. After about 25 seconds the dashboard goes Watch → Urgent → **Critical**, an emergency case opens, and the history table fills in.

## How it works

```
SimulationEngine (every 2 s)  ──onUpdate──▶  DetectionService.handleUpdate(reading)
  1. persistence   each vital abnormal 3 ticks in a row (31–33); same for "far from baseline" (35)
  2. evaluate      rule table → level 0–3 + the reasons (34, 38)
  3. transition    a higher level shows at once; a lower one must hold 3 ticks (no flapping)
  4. effects       on a rise: save a Detection (40) + timeline event; at Level 3 open the case (39)
                   back to 0: close the episode, log "Detection cleared"
```

Steps 1–3 run synchronously inside the engine's emit, so state never interleaves. Database work is queued per patient and runs in order, and a failed write is logged without stopping later detection.

| Feature | Where |
|---|---|
| 31–33 Abnormal HR / BP / SpO2 (3 ticks in a row) | `detection/persistence.js`, `rules.js` (`critical:*`, `warning:*`) |
| 34 Multi-parameter rules outrank single ones | `rules.js` (`MULTI_RULES`), `evaluate.js` (precedence) |
| 35 Baseline comparison | `rules.js` (`baseline:*`), `evaluate.js` (`baselineDeviation`), limits in `shared/detection.js` |
| 36 Configurable thresholds | `detection/config.js` (validation), `service.js` (`updateConfig`, `setPatientThresholds`), `routes.js` |
| 37 Cardiac risk gauge | `risk.js`, `frontend/src/features/detection/RiskGauge.jsx` |
| 38 Severity levels | `evaluate.js`, labels from `shared/emergency.js` |
| 39 Automatic emergency case | `service.js` (`openCase`), `store.js` (`createCaseIfNone`), unique index in `models/EmergencyCase.js` |
| 40 Detection history | `models/Detection.js`, `GET /patients/:id/detections`, `DetectionHistory.jsx` |

All thresholds come from `shared/vitals.js`; the new constants (3 ticks, baseline limits, risk weights, risk bands, outcomes, event names) live in `shared/detection.js`. No number is repeated in the detection code.

## The rules

A condition is "met" when the vital's **confirmed** status (3 ticks in a row, weakest of the three) is at least the stated level, in the stated direction.

**Level 3 Critical cardiac** (every condition must hold, feature 34):

| Rule id | Conditions |
|---|---|
| `multi:tachycardia-hypoxia` | HR Critical high **and** SpO2 Critical low (the plan's HR > 120 and SpO2 < 90) |
| `multi:shock-pattern` | HR Warning+ high, systolic Critical low **and** SpO2 Warning+ low |
| `multi:bradycardia-hypotension` | HR Critical low **and** systolic Critical low |
| `multi:tachycardia-hypertension-breathless` | HR Critical high, systolic Warning+ high **and** RR Warning+ high |

**Level 2 Urgent:** `critical:<vital>` (any one vital Critical) or `baseline:<vital>` (a large change from the patient's own baseline).
**Level 1 Watch:** `warning:<vital>` (one vital in Warning). A Critical vital does not also list its own Warning rule.

`<vital>` is one of `hr`, `sys`, `dia`, `spo2`, `temp`, `rr`. `GET /api/detection/rules` returns the live table.

**Precedence.** Rules that fire are sorted by level (highest first), then by number of conditions (more specific first), then by table order. The first is the **primary rule** and goes on the case; all of them are listed as reasons.

**Persistence.** The confirmed level is the *weakest* in the last 3 readings: Critical, Warning, Critical only confirms Warning. One normal reading breaks the run. A single noisy spike never fires.

**Stepping down.** A higher level shows at once. A lower one shows only after the readings have been clearly below the held level for 3 ticks (judged on the raw readings, so a brief dip never drops it). When the level reaches 0 the episode closes and its open detections become `resolved`.

### Baseline comparison (feature 35)

Compared with `computeBaseline(patient)`, so the same reading means different things for Ananya (resting HR about 66) and Rahul (about 78). The plan says "24-hour baseline"; this uses the patient's computed stable baseline, which does not drift. A rolling 24 h average can replace it later by changing what `engineState.baseline` holds.

| Vital | Default limit | Meaning |
|---|---|---|
| HR | `pct: 40` | up or down 40 % (the plan's example) |
| Systolic / diastolic | `pct: 25` | up or down 25 % |
| SpO2 | `drop: 6` | falls by 6 points |
| Temperature | `abs: 1.2` | moves by 1.2 °C |
| Respiratory rate | `pct: 60` | up or down 60 % |

### Risk score (features 37 and 93)

0–100, always with a breakdown. Fixed points from the profile (age over 30, previous cardiac condition, hypertension, diabetes, cardiac family history if the profile has a `familyHistory` list) plus points for each vital currently Warning or Critical, each vital far from baseline, and the current severity level. Bands: **Low** 0–34, **Moderate** 35–64, **High** 65+. A Level 3 is always High and a Level 2 at least Moderate. Weights are in `DEFAULT_RISK_WEIGHTS` and editable through the config API. Family history is read when Jehal's feature 18 provides it, and is skipped until then.

## For Puneet: starting hospital discovery

```js
const engine = await attachSimulation({ app, io })
const detection = await attachDetection({ app, io, engine })   // same guards as attachSimulation
detection.onCaseCreated((c) => startHospitalDiscovery(c.caseId))
```

`onCaseCreated` fires once per new case, in process. It also goes out as the Socket.IO event `emergency:created`.

**The case created at Level 3** (`EmergencyCase`):

| Field | Value |
|---|---|
| `source` | `auto_detection` (`CASE_SOURCE.AUTO_DETECTION`) |
| `severity` / `status` | `3` / `awaiting_confirmation` |
| `detection` | `rulesFired[]`, `snapshot` (the six vitals), `statuses`, `scenario`, `riskScore`, `riskBreakdown` |
| `detectionRef` | the `Detection` history entry |
| `escalation` | `confirmDeadline` = now + 10 s, `round: 0`, `radiusKm: 10` |
| `timeline[0]` | `{ type: 'detection', actorRole: 'system' }` |

Not set here: `location` (features 46, 51), `symptoms`, `contactAlerts` (Phase 7), and `caseNumber` (needs the counters collection). The case waits in `awaiting_confirmation`; the confirmation screen and countdown (43, 44) are Phase 7, which moves it to `searching`. Hospital discovery should start from that point, not from `emergency:created`.

**One live case per patient.** `createCaseIfNone` upserts against "this patient, status in `ACTIVE_STATUSES`", and a partial unique index (`one_active_case_per_patient`) makes the database enforce it, so two processes or two simultaneous detections cannot both open one. A manual SOS (feature 41) should join the live case rather than create another; creating one directly will fail with a duplicate-key error (code 11000). The index needs **MongoDB 6.0+** (a partial index with `$in`). On 5.x it is skipped with a warning, and detection still prevents duplicates inside one process.

**Run detection in one process.** Its per-patient state (the 3-tick counters, the current level) is in memory. Two server instances would each detect, though the database guard still stops a second case.

### Socket.IO events

Sent to the room `patient:<id>`, which clients join through the existing `vitals:subscribe` (so the interim `authorizeSubscribe` check covers them).

| Event | When | Payload |
|---|---|---|
| `detection:update` | the level, the reasons, the risk score or the case changed | `{ patientId, level, severity, primary, rules[], risk, confirmed, case, scenario, simulated }` |
| `detection:cleared` | back to Level 0 | `{ patientId, episode, at }` |
| `emergency:created` | Level 3 opened a new case | `{ caseId, patientId, patientCode, severity, status, confirmDeadline, rules, riskScore }` |

## REST endpoints (`/api/detection`)

| Method and path | Purpose | Access (interim) |
|---|---|---|
| `GET /rules` | the rule table and the three levels | `guard` |
| `GET /status` | detection state of every monitored patient | `guard` |
| `GET /patients/:id/status` | one patient: level, reasons, risk gauge, case | `guard` |
| `GET /patients/:id/detections` | history, newest first | `guard` |
| `GET /config` | defaults, overrides, effective values, last 20 changes | `guard` |
| `PUT /config` | change global settings | presenter key |
| `PUT /patients/:id/thresholds` | per-patient threshold overrides | presenter key |

`:id` is the Mongo `_id` or the code (`HT-2026-0001`).

**History query** (feature 40): `?page=1&limit=20` (limit 1–100), `?severity=1|2|3`, `?outcome=pending|resolved|case_created|sent|cancelled|false_alarm`, `?from=` and `?to=` (ISO dates). Bad values return `400` with the reason. The response is `{ page, limit, total, pages, simulated, items[] }`; each item has `id, at, severity, severityLabel, primaryRule, rules[], snapshot, statuses, scenario, riskScore, riskLevel, riskBreakdown, outcome, case, episode`. Phase 7 moves `outcome` on from `case_created` to `sent`, `cancelled` or `false_alarm`.

### For Jehal: the admin threshold page (feature 36)

`GET /api/detection/config` gives everything the page needs:

```json
{
  "defaults":  { "thresholds": { "hr": { "label": "Heart rate", "unit": "BPM", "normal": [60, 100], "critical": { "below": 50, "above": 120 } } }, "baselineLimits": {}, "riskWeights": {} },
  "overrides": { "thresholds": {}, "baselineLimits": {}, "riskWeights": {}, "patientThresholds": {} },
  "effective": { "thresholds": {}, "baselineLimits": {}, "riskWeights": {} },
  "persistenceTicks": 3,
  "changes": [{ "at": "…", "actorRole": "central_admin", "actorId": "…", "scope": "global", "summary": "Changed thresholds" }]
}
```

`PUT /api/detection/config` takes any of `thresholds`, `baselineLimits`, `riskWeights`. Each section you send **replaces** that section's overrides (send `{}` to reset it); a section you leave out is unchanged.

```json
{ "thresholds": { "hr": { "normal": [55, 100], "critical": { "below": 45, "above": 125 } } } }
```

Rules the server checks, returning `400 { error, errors[] }` with every problem:

- only the six vitals; per vital only `normal` and `critical` can change
- `normal` is `[low, high]` with low < high; `critical` uses `below`, `above` and/or `atOrAbove`
- `critical.below` ≤ normal low, `critical.above` ≥ normal high, `critical.atOrAbove` > normal high
- `baselineLimits`: exactly one of `pct`, `drop`, `abs` per vital, above 0
- `riskWeights`: known names only, 0 or more

Changes apply to the next reading without a restart, and the dashboard colours update with them because the engine receives the same thresholds. They are saved in MongoDB (`detectionconfigs`) and survive a restart. A doctor's per-patient override uses `PUT /patients/:id/thresholds` with `{ "thresholds": { … } }`; `{}` removes it.

**Audit log.** Each change is stored with who, when, the scope, and before/after in the config document (newest 50), and passed to the optional `audit` callback of `attachDetection`. TODO(Jehal): forward it to the audit log (feature 98) and show who may change what.

## Interim access control

The write routes use the same `PRESENTER_KEY` header guard as scenario switching, and the live events ride the already-guarded `patient:<id>` rooms. TODO(Jehal): config → `central_admin`; patient thresholds → `doctor`; history and status → the patient, their doctors and hospital staff on the case.

## What changed in Phase 5 (and why)

- **Exercise is now light exercise** (HR +22, SYS +20, DIA +4, RR +5; it was HR +52, SYS +28, RR +10). The old target put heart rate above the Critical bound, so detection would have called a workout an emergency. Now exercise tops out at a Watch.
- **Quieter noise and slightly wider margins** (HR σ 0.8 → 0.6, SYS 1.0 → 0.8, DIA 0.7 → 0.6, RR 0.35 → 0.3; fit-patient HR −2 → −1; baseline RR 14 → 15). Stable patients used to touch a Warning edge for a few ticks in rare runs, which detection correctly flags. They now stay alert-free over 1,000 ticks across many seeds.
- The engine keeps each patient's profile and supports `setThresholds` / `setPatientThresholds`, so detection and the dashboard colours always agree.

## Tests

| Folder | Count | What they cover |
|---|---|---|
| `backend` | 164 (100 new) | Persistence; every rule; precedence; direction; baseline; severity; risk; step-down; case creation, duplicates and restarts; history API; config API and guard; live events; atomic 20-way case creation on MongoDB |
| `frontend` | 96 (38 new) | Gauge, panel, history table, live-event hook, presenter summary, lazy loading |
| `shared` | 33 (5 new) | Thresholds and detection constants |

Scenario tests run the real engine on a fake clock: **Stable** never alerts (1,000 ticks × 3 patients × 6 seeds), **Cardiac event** reaches Level 3 within 40 ticks (80 s; in practice about 13), **Exercise** raises at most a Watch (1,000 ticks), **Fever** and **Hypoxia** reach Urgent but never Critical.

Each rule test pins one rule with hand-made readings, so a naive version (fire on the first abnormal tick, ignore direction, create a case on every tick, skip precedence) fails it.

## Known limits

- Baseline is the computed stable baseline, not a rolling 24 h average.
- Per-patient overrides need a doctor role to be safe; until Jehal's auth lands the presenter key stands in.
- The risk score is the simple weighted version of feature 93; the trend projection (feature 92) is not part of this phase.
- Detection state is in memory (see "Run detection in one process").
- Nothing here contacts anyone: patient and contact alerts (42, 47), the confirmation screen and countdown (43, 44) are Phase 7.
