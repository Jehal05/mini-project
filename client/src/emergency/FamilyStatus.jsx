// The page behind the link in an emergency contact's message (features 47, 48). No sign-in: the token in the link is the
// credential. It shows what a relative needs and lets them tap "Seen".
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, SimulatedNotice } from './kit.jsx';
import { CallLinks } from './CallLinks.jsx';
import { CANCEL_LABEL, STATUS_TEXT, STATUS_TONE } from './status.js';

// Plain fetch on purpose: this page has no account, so there is nothing to refresh.
async function pub(method, path) {
  let res;
  try { res = await fetch(`/api/emergency/status/${encodeURIComponent(path)}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined }); }
  catch { throw Object.assign(new Error('Cannot reach HealthTwin right now.'), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

export default function FamilyStatus({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => pub('GET', token).then((d) => { setData(d); setError(null); }).catch(setError), [token]);
  const invalid = error?.status === 404; // a wrong link stays wrong: stop asking
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (invalid) return undefined;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load, invalid]);

  async function seen() {
    setBusy(true);
    try { await pub('POST', `${token}/seen`); await load(); } finally { setBusy(false); }
  }

  return (
    <main className="paper-bg min-h-screen">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-title text-2xl font-semibold">Emergency status</h1>
        <SimulatedNotice className="mt-2" />
        {error && (
          <Card status="moderate" className="mt-6">
            <p className="text-sm">{invalid ? 'This status link is not valid.' : 'Cannot reach HealthTwin right now. Try again in a moment.'}</p>
          </Card>
        )}
        {data && (
          <Card className="mt-6" status={data.isLive ? 'critical' : undefined} title={data.patientName} subtitle={`Hello ${data.contactName}`} action={<Badge tone={STATUS_TONE[data.status]}>{STATUS_TEXT[data.status]}</Badge>}>
            <p className="text-sm">
              {data.isLive ? `${data.patientName} may need urgent help. Try to call them now.` : `This emergency is no longer open${data.cancellation ? `: ${CANCEL_LABEL[data.cancellation.reason]}` : ''}.`}
            </p>
            <p className="mt-2 text-xs text-muted">Started {new Date(data.since).toLocaleString()}</p>
            {data.location && (
              <p className="mt-3 text-sm">
                Last known location:{' '}
                <a href={`https://www.openstreetmap.org/?mlat=${data.location.lat}&mlon=${data.location.lng}#map=17/${data.location.lat}/${data.location.lng}`} target="_blank" rel="noopener noreferrer" className="text-accent underline">open in a map</a>
                {data.location.updatedAt && <span className="text-muted"> (updated {new Date(data.location.updatedAt).toLocaleTimeString()})</span>}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={seen} disabled={data.seen} loading={busy}>{data.seen ? 'You marked this as seen' : 'I have seen this'}</Button>
              <CallLinks />
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
