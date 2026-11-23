import CountdownRing from './CountdownRing.jsx';
import SeverityBadge from './SeverityBadge.jsx';
import { explain } from '../lib/priority.js';
import { severityMeta, toneClasses } from '../ui/tokens.js';
import { Card } from '../ui/Surface.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import { classifyVital, VITAL_TONE } from '../ui/vitals.js';

// Feature 62: incoming emergency queue, most urgent first, with a response countdown on each pending case.
// The coloured edge shows severity, and the badge repeats it with a shape and a word.
export default function CaseQueue({ cases, selectedId, onSelect, hospitalId, sort = 'priority', onSort }) {
  const toggle = (
    <div className="mb-2 flex items-center gap-2 text-xs" role="group" aria-label="Sort the queue">
      <span className="text-muted">Sorted by</span>
      {[['priority', 'Priority'], ['newest', 'Newest']].map(([key, label]) => (
        <button type="button" key={key} onClick={() => onSort?.(key)} aria-pressed={sort === key}
          className={`min-h-touch rounded-ui px-3 text-xs font-semibold ${sort === key ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink hover:bg-raised'}`}>{label}</button>
      ))}
    </div>
  );
  if (!cases.length) {
    return <div>{toggle}<Card><EmptyState icon="siren" title="No emergencies right now">New ones appear here the moment they arrive.</EmptyState></Card></div>;
  }
  return (
    <div>
      {toggle}
      <ul className="space-y-2">
        {cases.map((c) => {
          const mine = c.acceptedBy === hospitalId;
          const hr = c.latestVitals?.heartRate;
          const spo2 = c.latestVitals?.spo2;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onSelect(c.id)} title={explain(c.priority)} aria-current={selectedId === c.id ? 'true' : undefined}
                className={`flex w-full min-h-touch overflow-hidden rounded-ui border bg-surface text-left ${selectedId === c.id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:bg-raised'}`}>
                <span aria-hidden="true" className={`w-1.5 shrink-0 ${toneClasses(severityMeta(c.severity).tone).bar}`} />
                <span className="min-w-0 flex-1 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={c.severity} riskScore={c.riskScore} />
                    {c.status !== 'pending' && <span className="text-xs font-semibold text-low">{mine ? 'Accepted by you' : c.status.replace(/_/g, ' ')}</span>}
                  </span>
                  <span className="mt-1 block font-semibold text-ink">{c.patient?.fullName || 'Patient'}</span>
                  <span className="tnum block text-xs text-muted">
                    {c.latestVitals ? (
                      <>Heart rate <b className={toneClasses(VITAL_TONE[classifyVital('heartRate', hr)]).text}>{hr ?? 'none'}</b>, SpO₂ <b className={toneClasses(VITAL_TONE[classifyVital('spo2', spo2)]).text}>{spo2 ?? 'none'}{spo2 != null && '%'}</b></>
                    ) : 'No vitals yet'}
                  </span>
                  {c.priority && <span className="tnum block text-xs text-muted">Priority {c.priority.priorityScore}{c.priority.distanceKm != null && `, ${c.priority.distanceKm} km away`}</span>}
                </span>
                {c.status === 'pending' && <span className="grid place-items-center pr-3"><CountdownRing respondBy={c.respondBy} /></span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
