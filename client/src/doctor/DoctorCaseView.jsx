import { useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { ErrorState } from '../ui/Feedback.jsx';
import { Checkbox } from '../ui/Form.jsx';
import SeverityBadge from '../portal/SeverityBadge.jsx';
import GoldenHourClock from '../portal/GoldenHourClock.jsx';
import Timeline from '../portal/Timeline.jsx';
import ClinicalBoard from '../ui/ClinicalBoard.jsx';

const CHECKLIST = [
  ['edBayReady', 'ED bay ready'],
  ['cathLabTeamAlerted', 'Cath lab team alerted'],
  ['ccuBedReserved', 'CCU bed reserved'],
  ['ecgReady', 'ECG ready on arrival'],
];

// One assigned case, vitals first. Actions use the same case endpoints as the hospital screen, with the
// doctor's hospital id (TEMPORARY dev login; Jehal's real auth supplies it from the signed-in doctor).
export default function DoctorCaseView({ hospitalId, caseData, history, onChange }) {
  const [patient, setPatient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = caseData.id;
  const prepKey = JSON.stringify(caseData.preparation);
  const stage = caseData.goldenHour?.[2]?.status;

  useEffect(() => { setPatient(null); setError(''); }, [id]);
  useEffect(() => {
    let alive = true;
    portalFetch(hospitalId, `/cases/${id}/timeline`).then((t) => alive && setTimeline(t.timeline)).catch(() => alive && setTimeline([]));
    return () => { alive = false; };
  }, [hospitalId, id, caseData.status, prepKey, stage]);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const toggle = (item, done) => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/preparation`, { method: 'PATCH', body: { item, done } })));
  const milestone = (name) => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/milestones`, { method: 'POST', body: { name } })));
  const loadPatient = () => run(async () => setPatient(await portalFetch(hospitalId, `/cases/${id}/patient`)));

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-title text-2xl font-semibold text-ink">{caseData.patient?.fullName || 'Patient'}</h2>
        <SeverityBadge severity={caseData.severity} riskScore={caseData.riskScore} solid />
      </div>
    </header>
  );
  const right = (
    <>
      <Panel title="What has happened"><Timeline entries={timeline} /></Panel>
      <Panel title="Patient record">
        {!patient ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={loadPatient}>Open patient record</Button>
            <p className="mt-2 text-xs text-muted">Opening the record is logged.</p>
          </>
        ) : <PatientRecord record={patient} />}
      </Panel>
    </>
  );

  return (
    <ClinicalBoard vitals={caseData.latestVitals} history={history} header={header} right={right}>
      {error && <ErrorState title="That did not go through">{error}</ErrorState>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Golden-hour timer">
          <GoldenHourClock stages={caseData.goldenHour || []} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy || stage !== 'not_started'} onClick={() => milestone('firstMedicalContact')}>Mark first medical contact</Button>
            <Button variant="secondary" size="sm" disabled={busy || stage !== 'running'} onClick={() => milestone('treatmentStarted')}>Mark treatment started</Button>
          </div>
        </Panel>

        <Panel title="Preparation">
          <ul>
            {CHECKLIST.map(([key, label]) => {
              const item = caseData.preparation?.[key] || { done: false };
              return (
                <li key={key} className="flex items-center justify-between gap-2">
                  <Checkbox label={label} disabled={busy} checked={item.done} onChange={(e) => toggle(key, e.target.checked)} />
                  {item.at && <span className="tnum text-xs text-muted">{new Date(item.at).toLocaleTimeString()}</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </ClinicalBoard>
  );
}

function PatientRecord({ record }) {
  const gap = (v) => (v && v.available === false ? <em className="text-muted">{v.note}</em> : <span className="whitespace-pre-wrap">{typeof v === 'string' ? v : JSON.stringify(v)}</span>);
  const row = (label, node) => (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-line py-2 text-sm last:border-0">
      <dt className="font-semibold text-muted">{label}</dt><dd className="text-ink">{node}</dd>
    </div>
  );
  const p = record.passport;
  return (
    <dl>
      {row('Name', p.fullName)}
      {row('Date of birth', p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : 'Not recorded')}
      {row('Phone', p.phone || 'Not recorded')}
      {row('Address', p.address || 'Not recorded')}
      {row('Cardiac history', gap(record.cardiacHistory))}
      {row('Allergies', gap(record.allergies))}
      {row('Medicines', gap(record.medicines))}
      {row('Symptom answers', gap(record.symptomAnswers))}
      {row('Twin snapshot', gap(record.twinSnapshot))}
      {row('Health summary', `Severity ${record.healthSummary.severity}, risk ${record.healthSummary.riskScore ?? 'not available'}`)}
    </dl>
  );
}
