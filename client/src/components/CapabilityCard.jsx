import { useEffect, useState } from 'react';
import { fetchCapability } from '../lib/api.js';
import { LEVEL_COLORS, LEVEL_LABELS } from '../lib/geo.js';

const REFRESH_MS = 15000;

// Feature 58. Live card: refetched from the server every 15 seconds while it is open.
export default function CapabilityCard({ hospital }) {
  const [cap, setCap] = useState(hospital.capability);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchCapability(hospital.id)
        .then((c) => { if (alive) { setCap(c); setError(''); } })
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [hospital.id]);

  const row = (label, value, good) => (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={good === undefined ? '' : good ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{value}</span>
    </div>
  );

  return (
    <div className="mt-2 rounded border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: LEVEL_COLORS[cap.level] }} />
        {LEVEL_LABELS[cap.level]}
      </div>
      {row('Cath lab available', cap.cathLab ? 'Yes' : 'No', cap.cathLab)}
      {row('Cardiologists on duty', cap.cardiologistsOnDuty, cap.cardiologistsOnDuty > 0)}
      {row('ICU beds free', `${cap.icuFree} of ${cap.icuTotal}`, cap.icuFree > 0)}
      {row('CCU beds free', `${cap.ccuFree} of ${cap.ccuTotal}`, cap.ccuFree > 0)}
      {row('ALS ambulances free', cap.alsAmbulancesFree, cap.alsAmbulancesFree > 0)}
      {row('Active emergency cases', cap.activeCases)}
      {error && <p className="mt-1 text-xs text-red-700">Could not refresh: {error}</p>}
    </div>
  );
}
