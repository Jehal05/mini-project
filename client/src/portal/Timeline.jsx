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
  ambulance_assigned: 'Ambulance reserved',
  ambulance_overridden: 'Ambulance changed by staff',
  no_ambulance_available: 'No ambulance available',
  ambulance_dispatched: 'Ambulance dispatched',
  ambulance_at_patient: 'Ambulance reached the patient',
  patient_on_board: 'Patient on board',
  departed_scene: 'Left the scene for the hospital',
  arrived_at_hospital: 'Arrived at the hospital',
};

// Feature 70: every step, oldest first, with timestamps.
export default function Timeline({ entries, hospitalNames = {} }) {
  if (!entries.length) return <p className="text-sm text-muted">No steps yet.</p>;
  return (
    <ol className="space-y-1.5 border-l-2 border-line pl-3 text-sm">
      {entries.map((t, i) => (
        <li key={`${t.event}-${t.at}-${i}`}>
          <span className="tnum text-xs text-muted">{new Date(t.at).toLocaleTimeString()}</span>{' '}
          <span className="font-semibold text-ink">{LABELS[t.event] || t.event.replace(/_/g, ' ')}</span>
          {t.hospital && hospitalNames[t.hospital] && <span className="text-muted">, {hospitalNames[t.hospital]}</span>}
          {t.detail && t.event === 'rejected' && <span className="text-muted"> ({t.detail.replace(/_/g, ' ')})</span>}
        </li>
      ))}
    </ol>
  );
}
