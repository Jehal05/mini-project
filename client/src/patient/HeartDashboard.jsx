import { useEffect, useState } from 'react';
import HeartHero from '../ui/HeartHero.jsx';
import GaugeArc from '../ui/GaugeArc.jsx';
import EcgLine from '../ui/EcgLine.jsx';
import VitalTile from '../ui/VitalTile.jsx';
import MoodChips, { MOODS } from '../ui/MoodChips.jsx';
import Button from '../ui/Button.jsx';
import { Card } from '../ui/Surface.jsx';
import { rangeState } from '../lib/gauge.js';
import { fetchMoods, saveMood } from '../lib/patientApi.js';
import useSimulatedVitals from './useSimulatedVitals.js';

const status = (bpm) => (rangeState(bpm, 60, 100) === 'in' ? 'normal' : 'warning');
const moodLabel = (id) => MOODS.find((m) => m[0] === id)?.[1] ?? id;

// The patient's home: a big beating heart, a live-looking rate, a gauge and two small readings. All readings are SIMULATED
// (labelled on screen). The mood check-in is the patient's own note, saved on the server; it is not a diagnosis.
export default function HeartDashboard({ mode = 'calm', signedIn = false }) {
  const v = useSimulatedVitals(mode);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-4">
        <div className="mx-auto h-56 w-56 sm:h-64 sm:w-64"><HeartHero bpm={v.bpm} /></div>
        <div className="mt-2 flex flex-col items-center gap-3">
          <GaugeArc value={v.bpm} />
          <EcgLine bpm={v.bpm} />
          <p className="text-xs text-muted">Simulated readings for demonstration</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <VitalTile label="R-R interval" value={v.rr} unit="ms" status="normal" values={v.history.map((b) => Math.round(60000 / b))} simulated />
        <VitalTile label="Signal quality" value={v.quality} unit="%" status={v.quality >= 90 ? 'normal' : 'warning'} simulated />
      </div>
      {signedIn && <MoodCheckIn />}
    </div>
  );
}

function MoodCheckIn() {
  const [mood, setMood] = useState('');
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { fetchMoods().then(setRecent).catch(() => {}); }, []);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const saved = await saveMood(mood);
      setRecent((r) => [saved, ...r].slice(0, 14)); setMood(''); setMessage('Saved');
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-title text-lg font-semibold">How do you feel today?</h2>
      <MoodChips value={mood} onChange={setMood} />
      <div className="flex items-center gap-3">
        <Button onClick={save} busy={busy} disabled={!mood}>Save check-in</Button>
        <span role="status" aria-live="polite" className="text-sm text-muted">{message}</span>
      </div>
      {recent.length > 0 && <p className="text-xs text-muted">Last check-in: {moodLabel(recent[0].mood)}, {new Date(recent[0].at).toLocaleDateString()}. This is your own note, not a medical result.</p>}
    </Card>
  );
}
