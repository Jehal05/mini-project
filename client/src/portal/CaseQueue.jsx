import Countdown from './Countdown.jsx';
import SeverityBadge from './SeverityBadge.jsx';
import { explain } from '../lib/priority.js';

// Feature 62: incoming emergency queue, most urgent first, with a response countdown on each pending case.
export default function CaseQueue({ cases, selectedId, onSelect, hospitalId, sort = 'priority', onSort }) {
  const toggle = (
    <div className="mb-2 flex items-center gap-2 text-xs" role="group" aria-label="Sorted by">
      <span className="text-slate-600">Sorted by</span>
      {[['priority', 'Priority'], ['newest', 'Newest']].map(([key, label]) => (
        <button key={key} onClick={() => onSort?.(key)} aria-pressed={sort === key} className={`rounded px-2 py-1 ${sort === key ? 'bg-blue-600 text-white' : 'bg-white shadow'}`}>{label}</button>
      ))}
    </div>
  );
  if (!cases.length) {
    return <div>{toggle}<p className="rounded bg-white p-4 text-sm text-slate-600 shadow">No emergencies right now. New ones appear here instantly.</p></div>;
  }
  return (
    <div>
    {toggle}
    <ul className="space-y-2">
      {cases.map((c) => {
        const mine = c.acceptedBy === hospitalId;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              title={explain(c.priority)}
              className={`w-full rounded-lg bg-white p-3 text-left shadow ${selectedId === c.id ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <SeverityBadge severity={c.severity} riskScore={c.riskScore} />
                {c.status === 'pending' ? <Countdown respondBy={c.respondBy} /> : <span className="text-xs font-semibold text-green-700">{mine ? 'Accepted by you' : c.status}</span>}
              </div>
              <div className="mt-1 font-semibold">{c.patient?.fullName || 'Patient'}</div>
              <div className="text-xs text-slate-600">
                {c.latestVitals ? `HR ${c.latestVitals.heartRate ?? '–'} · SpO₂ ${c.latestVitals.spo2 ?? '–'}%` : 'No vitals yet'}
              </div>
              {c.priority && <div className="mt-1 text-xs text-slate-500">Priority {c.priority.priorityScore}{c.priority.distanceKm != null && ` · ${c.priority.distanceKm} km`}</div>}
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
