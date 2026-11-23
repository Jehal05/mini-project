import { useEffect, useState } from 'react';
import { fetchHospitals, portalFetch, createDemoEmergency } from '../lib/portalApi.js';
import { enableBackgroundAlerts } from '../lib/push.js';
import { useQueue } from './useQueue.js';
import CaseQueue from './CaseQueue.jsx';
import CaseView from './CaseView.jsx';
import TakeoverScreen from './TakeoverScreen.jsx';
import FleetPanel from './FleetPanel.jsx';
import Button from '../ui/Button.jsx';
import { Card } from '../ui/Surface.jsx';
import { Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState, Toast } from '../ui/Feedback.jsx';

const KEY = 'ht.portalHospital';

// Hospital Portal. The hospital picker is the TEMPORARY login stub until Jehal's real hospital login exists.
export default function PortalApp({ view = 'queue', account = null }) {
  const [hospitals, setHospitals] = useState([]);
  const [pickedId, setHospitalId] = useState(() => localStorage.getItem(KEY) || '');
  const hospitalId = account ? account.hospitalId || '' : pickedId; // signed in: the account decides, no picker
  const [selectedId, setSelectedId] = useState(null);
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [takeoverError, setTakeoverError] = useState('');
  const [info, setInfo] = useState('');
  const showFleet = view === 'fleet';

  useEffect(() => { fetchHospitals().then(setHospitals).catch(() => setHospitals([])); }, []);
  useEffect(() => { if (!account && hospitalId) localStorage.setItem(KEY, hospitalId); }, [account, hospitalId]);

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
    <div className="space-y-4">
      {takeover && (
        <TakeoverScreen caseData={takeover} busy={busy} error={takeoverError} onAccept={acceptTakeover} onReject={rejectTakeover} onAcknowledge={acknowledge} />
      )}

      <Card className="flex flex-wrap items-end gap-3 p-3">
        {!account && <label className="space-y-1 text-sm"><span className="block font-semibold">Hospital (demo login)</span>
          <Select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setSelectedId(null); }}>
            <option value="">Choose your hospital</option>
            {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </label>}
        {account && hospitalId && <p className="pb-2 text-sm font-semibold">{hospitals.find((h) => h.id === hospitalId)?.name ?? ''}</p>}
        {hospitalId && (
          <>
            <Button variant="secondary" onClick={async () => setInfo(await enableBackgroundAlerts(hospitalId).catch((e) => e.message))}>Alerts when tab is closed</Button>
            <Button variant="secondary" icon="siren" onClick={demo}>Create demo emergency</Button>
          </>
        )}
        <p role="status" aria-live="polite" className="pb-2 text-sm text-muted">{info}</p>
      </Card>

      {notices.map((n) => <Toast key={n.id} tone="moderate" onClose={() => dismissNotice(n.id)}>{n.text}</Toast>)}
      {error && <ErrorState title="Could not load the queue">{error}</ErrorState>}

      {!hospitalId ? (
        <Card><EmptyState icon="siren" title={account ? 'No hospital linked' : 'Choose a hospital'}>{account ? 'This account is not linked to a hospital. Ask an administrator to link it.' : 'Pick your hospital above to see its incoming emergencies.'}</EmptyState></Card>
      ) : showFleet ? (
        <FleetPanel hospitalId={hospitalId} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <CaseQueue cases={cases} selectedId={selectedId} onSelect={setSelectedId} hospitalId={hospitalId} sort={sort} onSort={setSort} />
          {selected ? (
            <CaseView key={selected.id} hospitalId={hospitalId} caseData={selected} onChange={upsert} onGone={(id) => { remove(id); setSelectedId(null); }} />
          ) : (
            <Card><EmptyState icon="inbox" title="Select a case">Choose one from the queue to see the patient, controls, timer and timeline.</EmptyState></Card>
          )}
        </div>
      )}
    </div>
  );
}
