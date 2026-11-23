import { Suspense, lazy, useEffect, useState } from 'react';
import HeartHero from '../ui/HeartHero.jsx';
import GaugeArc from '../ui/GaugeArc.jsx';
import EcgLine from '../ui/EcgLine.jsx';
import VitalTile from '../ui/VitalTile.jsx';
import MoodChips, { MOODS } from '../ui/MoodChips.jsx';
import Button from '../ui/Button.jsx';
import { Card } from '../ui/Surface.jsx';
import { rangeState } from '../lib/gauge.js';
import { fetchMoods, saveMood } from '../lib/patientApi.js';
import useLiveVitals from './useLiveVitals.js';
import { LEVEL_WORD, levelOf, sourceNote, uiStatus } from '../lib/liveVitals.js';
import { rrInterval, signalQuality } from '../lib/vitalsSim.js';
import Icon from '../ui/icons.jsx';

const TwinSection = lazy(() => import('../twin/TwinSection.jsx'));
const EmergencyArea = lazy(() => import('../emergency/EmergencyArea.jsx'));

const status = (bpm) => (rangeState(bpm, 60, 100) === 'in' ? 'normal' : 'warning');
const moodLabel = (id) => MOODS.find((m) => m[0] === id)?.[1] ?? id;

// The patient's home: a big beating heart, a live-looking rate, a gauge and two small readings. All readings are SIMULATED
// (labelled on screen). The mood check-in is the patient's own note, saved on the server; it is not a diagnosis.
export default function HeartDashboard({ mode = 'calm', signedIn = false, patientId = '' }) {
  const v = useLiveVitals({ patientId, mode });
  const rr = rrInterval(v.bpm);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-4">
        <div className="mx-auto h-56 w-56 sm:h-64 sm:w-64"><HeartHero bpm={v.bpm} /></div>
        <div className="mt-2 flex flex-col items-center gap-3">
          <GaugeArc value={v.bpm} />
          <EcgLine bpm={v.bpm} />
          <p className="text-xs text-muted">{sourceNote(v.source)}</p>
          {v.source === 'server' && <DetectionBadge detection={v.detection} />}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        {v.vitals && (
          <>
            <VitalTile label="Oxygen" value={v.vitals.spo2} unit="%" status={uiStatus(v.statuses.spo2)} />
            <VitalTile label="Blood pressure" value={v.vitals.sys != null && v.vitals.dia != null ? `${v.vitals.sys}/${v.vitals.dia}` : null} unit="mmHg" status={uiStatus(v.statuses.sys)} />
            <VitalTile label="Temperature" value={v.vitals.temp} unit="°C" status={uiStatus(v.statuses.temp)} />
            <VitalTile label="Breathing" value={v.vitals.rr} unit="/min" status={uiStatus(v.statuses.rr)} />
          </>
        )}
        <VitalTile label="R-R interval" value={rr} unit="ms" status="normal" values={v.history.map((b) => rrInterval(b))} simulated />
        <VitalTile label="Signal quality" value={signalQuality(v.bpm, () => 0.5)} unit="%" status="normal" simulated />
      </div>
      {signedIn && patientId && v.source === 'server' && v.vitals && <Suspense fallback={null}><TwinSection patientId={patientId} vitals={v.vitals} detection={v.detection} /></Suspense>}
      {signedIn && patientId && <Suspense fallback={null}><EmergencyArea patientId={patientId} detection={v.source === 'server' ? v.detection : null} /></Suspense>}
      {signedIn && <MoodCheckIn />}
    </div>
  );
}

// The detection engine's current level, as a shape and a word. It is a simulated rule check, never a diagnosis.
function DetectionBadge({ detection }) {
  const level = levelOf(detection);
  const look = [['circle', 'text-low'], ['diamond', 'text-moderate'], ['triangle-alert', 'text-moderate'], ['octagon-alert', 'text-critical']][level];
  return (
    <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-semibold ${look[1]}`}>
      <Icon name={look[0]} size={18} />{LEVEL_WORD[level]}{level > 0 && detection?.rules?.[0]?.message ? `: ${detection.rules[0].message}` : ''}
      <span className="font-normal text-muted">(simulated check, not a diagnosis)</span>
    </p>
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
