# Phase 4: Digital Twin, trends and 3D heart (features 91, 92, 101)

Everything here is **simulated** and labelled so on screen (`SimulatedNotice`). It is not a medical device and
never uses diagnosis wording.

## What it shows (patient dashboard, below Detection)

- **Digital Twin card (91).** The six vitals, "your usual" (the patient's own simulation baseline) next to "now",
  with a plain sentence such as "Heart rate is 68% above your usual (78 BPM)". Differences smaller than the noise
  floor read "in line with your usual". SpO2 is described in points, temperature in degrees C, the rest in percent.
  It also repeats what detection currently sees (reuses the detection status).
- **Trends (92).** Last 24 hours and last 7 days per vital: rising / falling / steady, plus resting heart rate
  (10th percentile of each rolling day) and a **drift** flag when the daily values move away from the patient's own
  baseline, in one direction, by more than a tolerance. Missing data reads "not enough data yet", never zero.
- **3D heart (101).** Beats at the live heart rate, colour follows the worst vital status (design tokens). Drag or
  use the arrow keys to turn it. Lazy-loaded. Without WebGL a 2D heart is shown, with text. With
  `prefers-reduced-motion` (or the page's Pause motion) the heart does not beat; it can still be turned.

## How trends are computed (no ML)

`shared/trends.js`: least-squares slope per hour; a trend is "rising/falling" only if the change over the window is
at least `TREND_MIN_CHANGE` (hr 3, sys 5, dia 4, spo2 1, temp 0.3, rr 2). Needs at least 6 points covering at least
half of the window (or 3 usable days for drift), otherwise `not_enough_data`. Drift tolerances are in
`DRIFT_TOLERANCE`. Backend: `GET /api/sim/patients/:id/trends` (`backend/src/simulation/trends.js`), built from
the history buckets (5 min for 24 h, 30 min for 7 d) and `computeBaseline`.

## Dependency and cost

`three` ^0.187. First-load JS 286.4 KB (budget 300). The heart chunk is about 552 KB (140 KB gzip) and loads only
when the heart is shown; the 2D fallback needs none of it.

## Known limits

- Demo/backfill history is stationary (noise only), so 7-day trends read "steady". The visible movement in the
  demo comes from the live scenario (Cardiac event): the twin rows, the sentence and the heart colour change.
- The socket payload has no baseline; the twin takes it from the REST patient (`patient.live.baseline`).
- Ownership/auth on the trends route follows the same open-route gap as the other routes (see phase12-integration).

## Feature 93 (full risk score): built on `jehal-integration`

The score comes from detection (`detection/risk.js`) and now reads the real profile, including family history (feature 18). The twin shows the score and splits it into profile points and reading points. Profile edits reach the score at once (`patient:profile_changed`).

## Tests

`shared/trends.test.js`, `backend/test/trends.api.test.js` (real MongoDB), `frontend/src/features/twin/*.test.*`,
`e2e/journeys/i-twin.test.mjs` (included in `npm run flaky`), axe states in `e2e/a11y/audit.mjs`.

## Demo

`cd e2e && npm run demo`, open the patient page: the twin card is below Detection. Press Cardiac event in the
presenter panel: within a few seconds (one 2 s tick) the rows, sentence and heart turn red and speed up.
