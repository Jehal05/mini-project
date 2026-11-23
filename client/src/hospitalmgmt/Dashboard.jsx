import { useCallback, useEffect, useState } from 'react';
import { fetchDashboard } from '../lib/hospitalApi.js';
import { StatTile } from '../ui/Surface.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { formatSeconds } from './labels.js';

// Feature 82: what the hospital needs to know at a glance. Loaded when opened and on request, not live.
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => fetchDashboard().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState onRetry={load}>{error}</ErrorState>;
  if (!data) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  const k = data.kpis;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Incoming emergencies" value={k.incomingEmergencies} tone={k.incomingEmergencies ? 'critical' : 'neutral'} note={k.incomingEmergencies ? 'Waiting for your answer' : undefined} />
        <StatTile label="Being handled" value={k.handlingEmergencies} />
        <StatTile label="Free beds" value={k.freeBeds} note={Object.entries(k.freeBedsByWard).map(([w, n]) => `${w} ${n}`).join(' · ') || 'No beds added'} />
        <StatTile label="Ambulances available" value={k.ambulancesAvailable} />
        <StatTile label="Doctors on duty" value={k.doctorsOnDuty} />
        <StatTile label="Cardiologist on duty" value={k.cardiologistOnDuty ? 'Yes' : 'No'} tone={k.cardiologistOnDuty ? 'low' : 'moderate'} />
        <StatTile label="Average response" value={formatSeconds(k.avgResponseSeconds)} note={k.respondedCases ? `Over ${k.respondedCases} accepted case${k.respondedCases === 1 ? '' : 's'}` : 'No accepted cases yet'} />
        <StatTile label="Admitted patients" value={k.activeAdmissions} />
      </div>
      <button type="button" onClick={load} className="text-sm text-accent underline">Refresh</button>
      <p className="text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
    </div>
  );
}
