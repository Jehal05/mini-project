import { useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import SeverityBadge from './SeverityBadge.jsx';
import Vitals from './Vitals.jsx';
import GoldenHourClock from './GoldenHourClock.jsx';
import Timeline from './Timeline.jsx';
import Countdown from './Countdown.jsx';

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

  const btn = 'rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50';

  return (
    <div className="space-y-4 rounded-lg bg-white p-4 shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{caseData.patient?.fullName || 'Patient'}</h2>
          <SeverityBadge severity={caseData.severity} riskScore={caseData.riskScore} />
        </div>
        {pending && <div className="text-right text-sm">Respond within <Countdown respondBy={caseData.respondBy} /></div>}
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {caseData.allHospitalsBusy && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">All hospitals have been tried for this case.</p>}

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Latest vitals</h3>
        <Vitals vitals={caseData.latestVitals} />
      </section>

      {pending && (
        <section className="flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={accept} className={`${btn} bg-green-700 text-white`}>Accept emergency</button>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1.5 text-sm" aria-label="Rejection reason">
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button disabled={busy} onClick={reject} className={`${btn} border border-red-700 text-red-700`}>Reject</button>
        </section>
      )}
      {!pending && !mine && <p className="rounded bg-slate-100 p-2 text-sm">Accepted by another hospital.</p>}

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Patient information</h3>
        {!patient && (
          <>
            <button disabled={busy || (!pending && !mine)} onClick={loadPatient} className={`${btn} bg-slate-800 text-white`}>Show patient record</button>
            <p className="mt-1 text-xs text-slate-500">Opening the record is logged.</p>
          </>
        )}
        {patient && <PatientRecord record={patient} />}
      </section>

      {mine && (
        <>
          <section>
            <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Doctor</h3>
            <div className="flex gap-2">
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="flex-1 rounded border px-2 py-1.5 text-sm" aria-label="Doctor">
                <option value="">Choose an on-duty doctor</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)}
              </select>
              <button disabled={busy || !doctorId} onClick={assign} className={`${btn} bg-blue-700 text-white`}>Assign</button>
            </div>
            {caseData.doctor && <p className="mt-1 text-xs text-green-700">Doctor assigned and alerted.</p>}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Preparation</h3>
            <ul className="space-y-1 text-sm">
              {CHECKLIST.map(([key, label]) => {
                const item = caseData.preparation?.[key] || { done: false };
                return (
                  <li key={key} className="flex items-center gap-2">
                    <input id={key} type="checkbox" disabled={busy} checked={item.done} onChange={(e) => toggle(key, e.target.checked)} />
                    <label htmlFor={key}>{label}</label>
                    {item.at && <span className="text-xs text-slate-500">{new Date(item.at).toLocaleTimeString()}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-wrap gap-2">
            <button disabled={busy || caseData.goldenHour?.[2]?.status !== 'not_started'} onClick={() => milestone('firstMedicalContact')} className={`${btn} border`}>First medical contact</button>
            <button disabled={busy || caseData.goldenHour?.[2]?.status !== 'running'} onClick={() => milestone('treatmentStarted')} className={`${btn} border`}>Treatment started</button>
          </section>
        </>
      )}

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Golden-hour timer</h3>
        <GoldenHourClock stages={caseData.goldenHour || []} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Timeline</h3>
        <Timeline entries={timeline} />
      </section>
    </div>
  );
}

function PatientRecord({ record }) {
  const gap = (v) => (v && v.available === false ? <em className="text-slate-500">{v.note}</em> : <pre className="whitespace-pre-wrap font-sans">{typeof v === 'string' ? v : JSON.stringify(v)}</pre>);
  const row = (label, node) => (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b py-1 text-sm">
      <div className="font-medium text-slate-600">{label}</div>
      <div>{node}</div>
    </div>
  );
  const p = record.passport;
  return (
    <div>
      {row('Name', p.fullName)}
      {row('Date of birth', p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : 'Not recorded')}
      {row('Phone', p.phone || 'Not recorded')}
      {row('Address', p.address || 'Not recorded')}
      {row('Cardiac history', gap(record.cardiacHistory))}
      {row('Allergies', gap(record.allergies))}
      {row('Medicines', gap(record.medicines))}
      {row('Symptom answers', gap(record.symptomAnswers))}
      {row('Twin snapshot', gap(record.twinSnapshot))}
      {row('Health summary', `Severity ${record.healthSummary.severity}, risk ${record.healthSummary.riskScore ?? '–'}`)}
    </div>
  );
}
