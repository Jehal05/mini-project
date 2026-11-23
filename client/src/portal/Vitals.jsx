import { StatTile } from '../ui/Surface.jsx';
import Sparkline from '../ui/Sparkline.jsx';
import { classifyVital, VITAL_TONE, VITAL_WORD, RANGE_NOTE } from '../ui/vitals.js';
import { seriesOf } from '../lib/vitalsTrend.js';

// Latest vitals. Out-of-range values show a word as well as a colour. Ranges are simulated (see ui/vitals.js).
// `history` (optional) adds a trend line for heart rate.
export default function Vitals({ vitals, history = [], showNote = true }) {
  if (!vitals) return <p className="text-sm text-muted">No vitals recorded yet.</p>;
  const tile = (key, label, value, unit) => {
    const c = classifyVital(key, value);
    return <StatTile label={label} value={value} unit={unit} tone={VITAL_TONE[c]} note={VITAL_WORD[c]} />;
  };
  const bp = vitals.systolic != null && vitals.diastolic != null ? `${vitals.systolic}/${vitals.diastolic}` : null;
  const bpClass = classifyVital('systolic', vitals.systolic);
  const hr = seriesOf(history, 'heartRate');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile('heartRate', 'Heart rate', vitals.heartRate, 'bpm')}
        <StatTile label="Blood pressure" value={bp} unit="mmHg" tone={VITAL_TONE[bpClass]} note={VITAL_WORD[bpClass]} />
        {tile('spo2', 'SpO₂', vitals.spo2, '%')}
        {tile('respiratoryRate', 'Breathing', vitals.respiratoryRate, '/min')}
      </div>
      {hr.length > 1 && (
        <div className="flex items-center gap-3 text-xs text-muted"><span>Heart rate, last {hr.length} readings</span><Sparkline values={hr} /></div>
      )}
      {showNote && <p className="text-xs text-muted">{RANGE_NOTE}</p>}
    </div>
  );
}
