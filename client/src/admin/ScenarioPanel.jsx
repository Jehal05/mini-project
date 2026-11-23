import { useCallback, useEffect, useState } from 'react';
import { fetchMonitored, fetchScenarios, setScenario } from '../lib/monitorApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';

// The presenter controls: pick a simulated patient and a scenario (stable, exercise, fever, low oxygen, cardiac event).
// The readings glide to the scenario's target over about a minute, and detection reacts. Every reading is simulated.
export default function ScenarioPanel() {
  const [patients, setPatients] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => Promise.all([fetchMonitored(), fetchScenarios()]).then(([p, s]) => { setPatients(p); setScenarios(s); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  async function pick(patientId, scenario) {
    setBusy(`${patientId}:${scenario}`); setError('');
    try { await setScenario(patientId, scenario); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  if (error && !patients) return <ErrorState onRetry={load}>{error}</ErrorState>;
  if (!patients) return <Skeleton className="h-40" />;
  if (!patients.length) return <EmptyState icon="heart-pulse" title="No patients to monitor">Register a patient first. Monitored patients appear here.</EmptyState>;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {error && <ErrorState title="That did not go through">{error}</ErrorState>}
      <p className="text-sm text-muted">Simulated patients only. Switching to “Cardiac event” makes detection climb to Critical and opens a real demo case that hospitals are asked to accept.</p>
      {patients.map((p) => (
        <Panel key={p.id} title={`${p.name} (${p.patientCode})`}>
          <p className="tnum text-sm">Now: <strong>{p.live?.scenario ?? 'not monitored'}</strong>{p.live?.vitals ? `, heart rate ${p.live.vitals.hr}, oxygen ${p.live.vitals.spo2}%` : ''}{p.live?.status ? `, ${p.live.status}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scenarios.map((s) => (
              <Button key={s.key} size="sm" variant={p.live?.scenario === s.key ? 'primary' : 'secondary'} busy={busy === `${p.id}:${s.key}`} disabled={Boolean(busy)} onClick={() => pick(p.id, s.key)} aria-pressed={p.live?.scenario === s.key}>{s.label ?? s.key}</Button>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
