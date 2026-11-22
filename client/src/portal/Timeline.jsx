const LABELS = {
  detected: 'Emergency detected',
  hospital_notified: 'Hospital notified',
  accepted: 'Hospital accepted',
  rejected: 'Hospital rejected',
  no_answer: 'Hospital did not answer in time',
  all_hospitals_busy: 'All hospitals busy',
  doctor_assigned: 'Doctor assigned',
  edBayReady_done: 'ED bay ready',
  cathLabTeamAlerted_done: 'Cath lab team alerted',
  ccuBedReserved_done: 'CCU bed reserved',
  ecgReady_done: 'ECG ready on arrival',
  firstMedicalContact: 'First medical contact',
  treatmentStarted: 'Treatment started',
};

// Feature 70: every step, oldest first, with timestamps.
export default function Timeline({ entries, hospitalNames = {} }) {
  if (!entries.length) return <p className="text-sm text-slate-500">No steps yet.</p>;
  return (
    <ol className="space-y-1 border-l-2 border-slate-300 pl-3 text-sm">
      {entries.map((t, i) => (
        <li key={`${t.event}-${t.at}-${i}`}>
          <span className="font-mono text-xs text-slate-500">{new Date(t.at).toLocaleTimeString()}</span>{' '}
          <span className="font-medium">{LABELS[t.event] || t.event.replace(/_/g, ' ')}</span>
          {t.hospital && hospitalNames[t.hospital] && <span className="text-slate-600"> · {hospitalNames[t.hospital]}</span>}
          {t.detail && t.event === 'rejected' && <span className="text-slate-600"> ({t.detail.replace(/_/g, ' ')})</span>}
        </li>
      ))}
    </ol>
  );
}
