import Countdown from './Countdown.jsx';
import SeverityBadge from './SeverityBadge.jsx';

// Feature 62: incoming emergency queue, most urgent first, with a response countdown on each pending case.
export default function CaseQueue({ cases, selectedId, onSelect, hospitalId }) {
  if (!cases.length) {
    return <p className="rounded bg-white p-4 text-sm text-slate-600 shadow">No emergencies right now. New ones appear here instantly.</p>;
  }
  return (
    <ul className="space-y-2">
      {cases.map((c) => {
        const mine = c.acceptedBy === hospitalId;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}
