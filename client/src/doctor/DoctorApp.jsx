import { useEffect, useState } from 'react';
import { fetchDoctorLogins } from '../lib/doctorApi.js';
import { useDoctorCases } from './useDoctorCases.js';
import DoctorCaseView from './DoctorCaseView.jsx';
import SeverityBadge from '../portal/SeverityBadge.jsx';
import { Card } from '../ui/Surface.jsx';
import { Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState, Toast, Skeleton } from '../ui/Feedback.jsx';
import { classifyVital, VITAL_TONE } from '../ui/vitals.js';
import { toneClasses } from '../ui/tokens.js';

const KEY = 'ht.doctorId';

// Doctor screen: only the cases assigned to this doctor. The picker is the TEMPORARY demo login
// (dev-only list from the server). Jehal's real doctor login replaces it and supplies the doctor id.
export default function DoctorApp({ account = null }) {
  const [logins, setLogins] = useState([]);
  const [pickedId, setDoctorId] = useState(() => localStorage.getItem(KEY) || '');
  const doctorId = account ? account.doctorId || '' : pickedId; // signed in: the account decides, no picker
  const [selectedId, setSelectedId] = useState(null);
  const { doctor, cases, history, loading, error, upsert, reload, newAssignment, clearAssignment } = useDoctorCases(doctorId);

  useEffect(() => { if (!account) fetchDoctorLogins().then(setLogins).catch(() => setLogins([])); }, [account]);
  useEffect(() => { if (!account && doctorId) localStorage.setItem(KEY, doctorId); }, [account, doctorId]);
  useEffect(() => { if (selectedId && !cases.some((c) => c.id === selectedId)) setSelectedId(null); }, [cases, selectedId]);

  const selected = cases.find((c) => c.id === selectedId) || cases[0] || null;
  const hospitalId = doctor?.hospitalId;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        {!account && <label className="space-y-1 text-sm"><span className="block font-semibold">Doctor (demo login)</span>
          <Select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSelectedId(null); }}>
            <option value="">Choose your name</option>
            {logins.map((d) => <option key={d.id} value={d.id}>{d.name}, {d.specialty}{d.hospitalName ? ` at ${d.hospitalName}` : ''}</option>)}
          </Select>
        </label>}
        {account && !doctorId && <p className="text-sm text-muted">This account is not linked to a doctor profile. Ask an administrator to link it.</p>}
        {doctor && <p className="pb-2 text-sm text-muted">{doctor.hospitalName}</p>}
      </Card>

      {newAssignment && <Toast tone="info" onClose={clearAssignment}>{newAssignment}</Toast>}
      {error && <ErrorState title="Could not load your cases" onRetry={reload}>{error}</ErrorState>}

      {!doctorId ? (
        <Card><EmptyState icon="stethoscope" title="Choose your name">Your assigned cases appear once you pick a doctor above.</EmptyState></Card>
      ) : loading && !doctor ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>
      ) : cases.length === 0 ? (
        <Card><EmptyState icon="inbox" title="No cases assigned to you">When the hospital assigns you to a cardiac emergency it shows up here straight away.</EmptyState></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <ul aria-label="Your cases" className="space-y-2">
            {cases.map((c) => {
              const hr = c.latestVitals?.heartRate;
              const tone = toneClasses(VITAL_TONE[classifyVital('heartRate', hr)]);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelectedId(c.id)} aria-current={selected?.id === c.id ? 'true' : undefined}
                    className={`w-full min-h-touch rounded-ui border bg-surface p-3 text-left ${selected?.id === c.id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:bg-raised'}`}>
                    <SeverityBadge severity={c.severity} />
                    <p className="mt-1 font-semibold text-ink">{c.patient?.fullName || 'Patient'}</p>
                    <p className="tnum text-xs text-muted">Heart rate <span className={`font-semibold ${tone.text}`}>{hr ?? 'no reading'}</span>{hr != null && ' bpm'}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && hospitalId && (
            <DoctorCaseView key={selected.id} hospitalId={hospitalId} caseData={selected} history={history[selected.id] ?? []} onChange={upsert} />
          )}
        </div>
      )}
    </div>
  );
}
