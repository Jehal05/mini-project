# HealthTwin AI · Hospital Portal

The hospital-side portal of **HealthTwin AI**, a simulated emergency response system. Staff watch live patient vitals, get emergency alerts (heart attack, stroke, diabetic emergency, asthma attack), dispatch the nearest ambulance, follow it on a live map, and admit the patient to a bed.

> **DEMO:** every patient, vital sign, ambulance and hospital in this app is simulated in the browser. Nothing is real medical data.

## Features

- **Dashboard:** stat cards, incoming alerts, a live map, the patient table, the ambulance fleet, bed availability and an activity feed
- **Emergency alerts:** priority badges, patient details, a progress bar (dispatched → on scene → transporting → admitted), and buttons to accept & dispatch or dismiss as a false alarm
- **Live vitals:** heart rate, SpO₂, blood pressure, glucose, respiratory rate and temperature for 5 patients, colour-coded normal / warning / critical
- **Patient page:** vital tiles and a live HR + SpO₂ chart (Recharts), plus demo controls to trigger an SOS or discharge a patient
- **Live map** (Leaflet + OpenStreetMap): the hospital, patients coloured by condition, ambulances moving along their routes with ETA
- **Ambulance dispatch:** the nearest free ambulance is picked automatically
- **Beds:** ICU, emergency and general wards update when patients are admitted or discharged
- Alert sound, pause/resume and reset

## Demo script

1. Run the app. All 5 patients start normal.
2. About **15 s** in, **Rohan Deshmukh (Viman Nagar)** has a heart attack. His vitals turn red and an alert pops up, with a beep.
3. Click **Accept & dispatch nearest ambulance** and watch the ambulance drive to him, stop at the scene, then bring him to the hospital.
4. He is admitted to the ICU, the ICU bed count updates, and his vitals slowly recover.
5. On **Patients**, you can discharge him, or pick anyone else and use **Simulate emergency SOS** to start another scenario.
6. **Reset demo** starts everything over.

Ambulance travel is sped up (about 18 s per leg). The ETA shown is the realistic one, calculated at 40 km/h.

## Tech stack

React 19 · Vite · Tailwind CSS v4 · Leaflet / react-leaflet · Recharts

## Run it

Needs Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). The map tiles need an internet connection.

To make a production build: `npm run build`, then `npm run preview`.

## Project structure

```
src/
  data/seed.js            hospital, patients, ambulances, conditions, scripted heart attack
  sim/engine.js           simulation reducer: vitals, alerts, dispatch, beds
  sim/HospitalContext.jsx React context + 1-second ticker
  utils/                  vital ranges, distance/ETA, shared UI styles
  components/             cards, alerts, patient table, chart, map, fleet, beds, activity feed
  views/                  Dashboard, Patients, Live map, Ambulances
```

To change the demo, edit `src/data/seed.js`. For example, `SCRIPTED_EVENT` controls who has the heart attack and when.
