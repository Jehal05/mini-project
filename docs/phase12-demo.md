# Phase 12: demo kit and presenter script

Everything here is **simulated** (fictional patients, simulated vitals, labelled on every screen). The demo needs
no internet: no CDN, no fonts, no map tiles. The hospital side is a labelled **FAKE** console, because Puneet's
hospital portal is not on this branch yet (see `docs/phase12-integration.md`).

## Reset and start (one command)

```bash
cd e2e
npm ci                      # first time only
npm run build:frontend      # first time, and after any frontend change
npm run demo                # fresh database + 3 fictional patients + 7 days of history, about 3 s
```

It prints three links. Open each in its own browser window:

| Window | Link | Who uses it |
|---|---|---|
| Patient portal | `http://localhost:4000/patient/HT-2026-0001` | Rahul (the cardiac patient). Keep this one on the projector |
| Presenter panel | `http://localhost:4000/presenter` | You, to switch Rahul to "Cardiac event" on cue |
| FAKE hospital console | `http://localhost:4000/__e2e/hospital` | You, to play the hospital that accepts |

**Reset between rehearsals:** Ctrl+C, then `npm run demo` again. Every start is an empty database, so no old case can
be left over. If the database binary is missing, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod`. If port 4000 is taken,
use `PORT=4100 npm run demo`.

Before you go on stage: click once anywhere on the patient window (browsers only allow the alert sound after a tap),
and check the sound toggle reads "Alert sound: On".

## Presenter script

Times are from the dry runs at the bottom of this page (real clock, not sped up).

| # | You do | You say | What the audience sees | Takes |
|---|---|---|---|---|
| 1 | Show the patient portal | "This is Rahul, 45, who had a heart attack in 2022. His vitals are simulated and labelled as such." | Live vitals, "Simulated" notice, risk gauge | 0 s |
| 2 | In the presenter panel press **Cardiac event** for Rahul | "I will now make his simulated readings turn into a cardiac event." | Button turns red | 0 s |
| 3 | Wait on the patient window | "Detection compares him with his own baseline, not a textbook number." | Level 2 alert appears with the reason ("Heart rate is 53% above..."), sound plays | about +15 to +17 s |
| 4 | Wait | "Level 3: it asks if he is okay. If he does not answer in 10 seconds, help is sent anyway." | "Are you okay?", the four warning signs, a 10-second countdown | about +23 s |
| 5 | Tap **Send help now** | "He confirms. A cancel needs a reason on purpose: feeling fine is not the same as being fine." | "Emergency in progress", "Looking for a hospital within 10 km", contacts alerted, first aid steps | about 0.3 s after your tap |
| 6 | In the FAKE hospital console press **Accept this emergency** | "A hospital accepts. This console is a stand-in for the hospital portal, which another teammate is building." | Patient screen changes to accepted without a reload | under 1 s after your press |
| 7 | Open the WhatsApp link for Meera, or the status link, in a new tab; press **I have seen this** | "His wife gets a link, no login. She taps Seen." | Family page; on the patient screen "Seen" appears next to Meera | about 1.5 s after your tap |
| 8 | (Optional) Press **Cancel emergency...**, pick a reason | "Cancelling always asks why, and tells the hospital." | Cancel dialog, then "Emergency cancelled" | about 10 s |

Optional extras if there is time: press **SOS** for Ananya to show the manual flow, or leave a case unanswered
(set `EMERGENCY_ROUND_SECONDS=8 npm run demo`) to show the search widen 10, 20, 30 km and then "No hospital has
accepted yet: call 112".

## If it goes wrong

| What you see | Why | Do this |
|---|---|---|
| No alert 20 s after pressing Cardiac event | Detection needs a few readings of the new scenario (normally 4 to 15 s) | Check the presenter panel shows "Cardiac event" pressed. Wait 10 s more. Fallback: on the patient window press **SOS**, then **Send SOS**: the same flow starts at step 5 |
| The countdown ran out before you pressed the button | You were slow. This is the safety feature | Say so: "Nobody answered, so help went out by itself." Continue at step 6 |
| Status says "No hospital has accepted yet: call 112" | Nobody accepted in 3 rounds, the case is unresolved. The fake console cannot accept it (known limit, see integration checklist) | Say it is the designed "call 112" screen. Then reset |
| FAKE hospital console says "No case is waiting for a hospital" | The case is not in `searching` (still counting down, already accepted, or cancelled) | Look at the patient window. If it is accepted already, move on to step 7 |
| "Cannot reach the backend" or the page is blank | The demo process stopped | Ctrl+C, `npm run demo`, reload the three windows (about 5 s). The patient page recovers by itself when the server returns |
| No sound | Browser blocks sound until a tap | Tap the page once, or the "Alert sound" button. The visual alert is always there |
| Wrong data from a previous rehearsal | Old case | Reset (Ctrl+C, `npm run demo`) |
| Presenter panel asks for a key | `PRESENTER_KEY` is set in your shell | `unset PRESENTER_KEY` and reset, or type the key |
| Layout looks cramped | Window narrower than 1366 px | Zoom out one step (Ctrl and minus). Phone width (390 px) is supported too |
| `npm run demo` says it cannot start MongoDB | No downloaded binary on this machine | `MONGOMS_SYSTEM_BINARY=$(which mongod) npm run demo` |

## Dry runs

Three runs of the whole script in a real browser (Chromium), each on a fresh reset, nothing sped up (the simulation ticks every 2 s, as in the demo). Seconds are counted from pressing **Cardiac event**, except the first two columns.

| Run | Reset + seed | Page ready | Level 2 alert | "Are you okay?" | Tap to "searching" | FAKE hospital accepts, patient sees it | Family "Seen" visible | Whole script | Console errors |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2.1 s | 1.1 s | +16.5 s | +22.9 s | +0.3 s | +0.5 s | +1.5 s | 26.8 s | 0 |
| 2 | 2.1 s | 0.6 s | +14.5 s | +22.9 s | +0.3 s | +0.6 s | +1.4 s | 26.8 s | 0 |
| 3 | 2.1 s | 0.7 s | +14.9 s | +22.8 s | +0.3 s | +0.5 s | +0.9 s | 25.9 s | 0 |

**Plan for about 17 seconds of talking between pressing Cardiac event and the first alert**, and about 23 seconds before "Are you okay?". The detection needs several readings of the new scenario before it is sure; this is a quiet gap, not a fault. The countdown itself is 10 real seconds. Raw numbers: `e2e/results/dry-run.json`. Re-run with `npm run dry-run`.

