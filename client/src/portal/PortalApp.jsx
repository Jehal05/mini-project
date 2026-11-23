import { useEffect, useState } from 'react';
import { fetchHospitals, portalFetch, createDemoEmergency } from '../lib/portalApi.js';
import { enableBackgroundAlerts } from '../lib/push.js';
import { useQueue } from './useQueue.js';
import CaseQueue from './CaseQueue.jsx';
import CaseView from './CaseView.jsx';
import TakeoverScreen from './TakeoverScreen.jsx';
import FleetPanel from './FleetPanel.jsx';

const KEY = 'ht.portalHospital';

// Hospital Portal. The hospital picker is the TEMPORARY login stub until Jehal's real hospital login exists.
export default function PortalApp({ view = 'queue' }) {
  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState(() => localStorage.getItem(KEY) || '');
  const [selectedId, setSelectedId] = useState(null);
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [takeoverError, setTakeoverError] = useState('');
  const [info, setInfo] = useState('');
  const showFleet = view === 'fleet';

  useEffect(() => { fetchHospitals().then(setHospitals).catch(() => setHospitals([])); }, []);
  useEffect(() => { if (hospitalId) localStorage.setItem(KEY, hospitalId); }, [hospitalId]);

  const [sort, setSort] = useState('priority');
  const here = hospitals.find((h) => h.id === hospitalId)?.location || null;
  const { cases, notices, dismissNotice, error, upsert, remove } = useQueue(hospitalId, { sort, origin: here });
  const selected = cases.find((c) => c.id === selectedId) || null;

  // Feature 103: the most urgent critical case that has not been acknowledged takes over the screen.
  const takeover = cases.find((c) => c.severity === 'critical' && c.status === 'pending' && !acknowledged.has(c.id));

  async function act(fn) {
    setBusy(true);
    setTakeoverError('');
    try { await fn(); } catch (e) { setTakeoverError(e.message); } finally { setBusy(false); }
  }
  const acceptTakeover = () => act(async () => {
    upsert(await portalFetch(hospitalId, `/cases/${takeover.id}/accept`, { method: 'POST' }));
    setSelectedId(takeover.id);
  });
  const rejectTakeover = (reason) => act(async () => {
    await portalFetch(hospitalId, `/cases/${takeover.id}/reject`, { method: 'POST', body: { reason } });
    remove(takeover.id);
  });
  const acknowledge = () => setAcknowledged((s) => new Set(s).add(takeover.id));

  async function demo() {
    setInfo('');
    try {
      const h = hospitals.find((x) => x.id === hospitalId);
      const loc = h?.location || { lat: 18.5204, lng: 73.8567 };
      const res = await createDemoEmergency(loc.lat, loc.lng);
      localStorage.setItem('ht.demoPatientId', res.patientId);
      setInfo(`Demo emergency created. Notified ${res.notified.length} hospitals.`);
    } catch (e) {
      setInfo(e.message);
    }
  }

  return (
    <div className="p-4">
      {takeover && (
        <TakeoverScreen caseData={takeover} busy={busy} error={takeoverError} onAccept={acceptTakeover} onReject={rejectTakeover} onAcknowledge={acknowledge} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow">
        <label className="text-sm font-medium">
          Hospital (demo login){' '}
          <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setSelectedId(null); }} className="rounded border px-2 py-1">
            <option value="">Choose your hospital</option>
            {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        {hospitalId && (
          <>
            <button className="rounded border px-3 py-1 text-sm" onClick={async () => setInfo(await enableBackgroundAlerts(hospitalId).catch((e) => e.message))}>
              Alerts when tab is closed
            </button>
            <button className="rounded bg-red-700 px-3 py-1 text-sm font-semibold text-white" onClick={demo}>Create demo emergency</button>
          </>
        )}
        {info && <span className="text-sm text-slate-700">{info}</span>}
      </div>

      {notices.map((n) => (
        <div key={n.id} className="mb-2 flex justify-between rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {n.text}
          <button onClick={() => dismissNotice(n.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
      {error && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {hospitalId && showFleet && <div className="mb-4"><FleetPanel hospitalId={hospitalId} /></div>}

      {!hospitalId ? (
        <p className="rounded bg-white p-4 text-sm shadow">Choose a hospital to see its incoming emergencies.</p>
      ) : showFleet ? null : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <CaseQueue cases={cases} selectedId={selectedId} onSelect={setSelectedId} hospitalId={hospitalId} sort={sort} onSort={setSort} />
          {selected ? (
            <CaseView key={selected.id} hospitalId={hospitalId} caseData={selected} onChange={upsert} onGone={(id) => { remove(id); setSelectedId(null); }} />
          ) : (
            <p className="rounded bg-white p-4 text-sm text-slate-600 shadow">Select a case to see the patient, controls, timer and timeline.</p>
          )}
        </div>
      )}
    </div>
  );
}
