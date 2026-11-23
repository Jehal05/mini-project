import { useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import SeverityBadge from './SeverityBadge.jsx';
import Vitals from './Vitals.jsx';
import GoldenHourClock from './GoldenHourClock.jsx';
import Timeline from './Timeline.jsx';
import CountdownRing from './CountdownRing.jsx';
import AmbulancePanel from './AmbulancePanel.jsx';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { ErrorState } from '../ui/Feedback.jsx';
import { Checkbox, Select } from '../ui/Form.jsx';

const REASONS = [
  ['no_beds', 'No beds'],
  ['no_cardiologist', 'No cardiologist'],
  ['cath_lab_busy', 'Cath lab busy'],
  ['other', 'Other'],
];
const CHECKLIST = [
  ['edBayReady', 'ED bay ready'],
  ['cathLabTeamAlerted', 'Cath lab team alerted'],
  ['ccuBedReserved', 'CCU bed reserved'],
  ['ecgReady', 'ECG ready on arrival'],
];

// Features 63-70 and 105 for one case. Every button calls the API; the screen then updates from the response and socket events.
export default function CaseView({ hospitalId, caseData, onChange, onGone }) {
  const [patient, setPatient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('no_beds');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const id = caseData.id;
  const mine = caseData.acceptedBy === hospitalId;
  const pending = caseData.status === 'pending';
  const prepKey = JSON.stringify(caseData.preparation);

  useEffect(() => { setPatient(null); setError(''); }, [id]);

  // Timeline refreshes whenever the case changes.
  useEffect(() => {
    let alive = true;
    portalFetch(hospitalId, `/cases/${id}/timeline`)
      .then((t) => alive && setTimeline(t.timeline))
      .catch(() => alive && setTimeline([]));
    return () => { alive = false; };
  }, [hospitalId, id, caseData.status, caseData.doctor, prepKey, caseData.goldenHour?.[2]?.status]);

  useEffect(() => {
    if (!mine) return;
    portalFetch(hospitalId, `/hospitals/${hospitalId}/doctors`).then((d) => setDoctors(d.results)).catch(() => {});
  }, [hospitalId, mine]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const accept = () => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/accept`, { method: 'POST' })));
  const reject = () => run(async () => { await portalFetch(hospitalId, `/cases/${id}/reject`, { method: 'POST', body: { reason } }); onGone(id); });
  const assign = () => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/doctor`, { method: 'POST', body: { doctorId } })));
  const toggle = (item, done) => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/preparation`, { method: 'PATCH', body: { item, done } })));
  const milestone = (name) => run(async () => onChange(await portalFetch(hospitalId, `/cases/${id}/milestones`, { method: 'POST', body: { name } })));
  const loadPatient = () => run(async () => setPatient(await portalFetch(hospitalId, `/cases/${id}/patient`)));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-ui border border-line bg-surface p-4">
        <div>
          <h2 className="font-title text-2xl font-semibold text-ink">{caseData.patient?.fullName || 'Patient'}</h2>
          <SeverityBadge severity={caseData.severity} riskScore={caseData.riskScore} solid />
        </div>
        {pending && <div className="flex items-center gap-2 text-sm text-muted">Respond within <CountdownRing respondBy={caseData.respondBy} size={64} /></div>}
      </header>

      {error && <ErrorState title="That did not go through">{error}</ErrorState>}
      {caseData.allHospitalsBusy && <p className="rounded-ui border border-moderate bg-moderate-soft p-2 text-sm text-ink">All hospitals have been tried for this case.</p>}

      <Panel title="Latest vitals"><Vitals vitals={caseData.latestVitals} /></Panel>

      {pending && (
        <Panel title="Your response">
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={accept} icon="check">Accept emergency</Button>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for rejecting" className="max-w-[12rem]">
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Button variant="secondary" disabled={busy} onClick={reject}>Reject</Button>
          </div>
        </Panel>
      )}
      {!pending && !mine && <p className="rounded-ui border border-line bg-raised p-2 text-sm text-ink">Accepted by another hospital.</p>}

      <Panel title="Patient information">
        {!patient ? (
          <>
            <Button variant="secondary" disabled={busy || (!pending && !mine)} onClick={loadPatient}>Show patient record</Button>
            <p className="mt-2 text-xs text-muted">Opening the record is logged.</p>
          </>
        ) : <PatientRecord record={patient} />}
      </Panel>

      {mine && (
        <>
          <AmbulancePanel hospitalId={hospitalId} caseData={caseData} onChange={onChange} />

          <Panel title="Doctor">
            <div className="flex gap-2">
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
                <option value="">Choose an on-duty doctor</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}, {d.specialty}</option>)}
              </Select>
              <Button disabled={busy || !doctorId} onClick={assign}>Assign</Button>
            </div>
            {caseData.doctor && <p className="mt-2 text-sm font-semibold text-low">Doctor assigned and alerted.</p>}
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
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Button variant="secondary" size="sm" disabled={busy || caseData.goldenHour?.[2]?.status !== 'not_started'} onClick={() => milestone('firstMedicalContact')}>Mark first medical contact</Button>
              <Button variant="secondary" size="sm" disabled={busy || caseData.goldenHour?.[2]?.status !== 'running'} onClick={() => milestone('treatmentStarted')}>Mark treatment started</Button>
            </div>
          </Panel>
        </>
      )}

      <Panel title="Golden-hour timer"><GoldenHourClock stages={caseData.goldenHour || []} /></Panel>
      <Panel title="What has happened"><Timeline entries={timeline} /></Panel>
    </div>
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
