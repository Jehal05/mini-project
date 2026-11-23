import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { Modal } from '../ui/Overlay.jsx';

const PHRASE = 'RESTORE';
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Feature 99: list, back up now, verify, and restore with a dry-run summary and a typed confirmation.
export default function BackupsPanel({ token }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restore, setRestore] = useState(null); // { name, plan, untouchedCollections }
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    try { setList(await adminFetch(token, '/admin/backups')); setError(''); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function run(label, fn) {
    setBusy(label);
    setMessage('');
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  const backupNow = () => run('backup', async () => {
    const r = await adminFetch(token, '/admin/backups', { method: 'POST' });
    setMessage(`Backup ${r.name} written and verified (${r.totalDocuments} documents${r.encrypted ? ', encrypted' : ', NOT encrypted'}).`);
    await load();
  });
  const verify = (name) => run(`verify:${name}`, async () => {
    const r = await adminFetch(token, `/admin/backups/${name}/verify`, { method: 'POST' });
    setMessage(r.ok ? `${name}: verified OK.` : `${name}: failed. ${r.problems.join('; ')}`);
  });
  const startRestore = (name) => run(`dry:${name}`, async () => {
    const r = await adminFetch(token, `/admin/backups/${name}/restore`, { method: 'POST', body: {} }); // no phrase = dry run
    setTyped('');
    setRestore(r);
  });
  const confirmRestore = () => run('restore', async () => {
    const r = await adminFetch(token, `/admin/backups/${restore.name}/restore`, { method: 'POST', body: { confirm: typed } });
    setRestore(null);
    setMessage(`Restored from ${r.name}. A safety backup of the previous data was saved as ${r.safetyBackup}.`);
    await load();
  });

  return (
    <Panel title="Backups" action={<Button busy={busy === 'backup'} disabled={Boolean(busy)} onClick={backupNow}>Back up now</Button>}>
      <div className="space-y-3">
        <p className="text-xs text-muted">Backups contain patient data. Keep them encrypted and off the app server. {list && `Keeping the newest ${list.keep}.`}</p>
        {message && <p className="rounded-ui border border-low bg-low-soft p-2 text-sm text-ink" role="status">{message}</p>}
        {error && <ErrorState title="Backup action failed">{error}</ErrorState>}

        {!list && !error && <Skeleton className="h-16" />}
        {list && !list.count && <p className="text-sm text-muted">No backups yet.</p>}
        {list?.results.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {list.results.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="tnum text-xs text-ink">{b.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {b.unreadable ? 'unreadable' : `${b.totalDocuments} documents, ${b.encrypted ? 'encrypted' : 'not encrypted'}, ${kb(b.sizeBytes)}`}
                  </span>
                </span>
                {!b.unreadable && (
                  <span className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => verify(b.name)}>Verify</Button>
                    <Button size="sm" variant="secondary" className="!border-critical !text-critical" disabled={Boolean(busy)} onClick={() => startRestore(b.name)}>Restore</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={Boolean(restore)} onClose={() => setRestore(null)} tone="danger" title={restore ? `Restore from ${restore.name}?` : ''}
        footer={<>
          <Button variant="secondary" onClick={() => setRestore(null)}>Cancel</Button>
          <Button variant="danger" busy={busy === 'restore'} disabled={typed !== PHRASE} onClick={confirmRestore}>Restore now</Button>
        </>}>
        {restore && (
          <>
            <p>
              This replaces the live data with the backup from {new Date(restore.backupCreatedAt).toLocaleString()}. A safety backup of the current data is taken first.
              Nothing has been changed yet. Pause other users before you continue.
            </p>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Documents per collection before and after the restore</caption>
              <thead><tr><th scope="col" className="border-b border-line py-1">Collection</th><th scope="col" className="border-b border-line py-1">Now</th><th scope="col" className="border-b border-line py-1">After restore</th></tr></thead>
              <tbody>
                {restore.plan.map((p) => <tr key={p.collection}><td className="py-0.5">{p.collection}</td><td className="tnum">{p.liveDocuments}</td><td className="tnum">{p.backupDocuments}</td></tr>)}
              </tbody>
            </table>
            {restore.untouchedCollections.length > 0 && <p className="text-xs text-muted">Not in the backup, left as they are: {restore.untouchedCollections.join(', ')}</p>}
            <Field label={`Type ${PHRASE} to confirm`}>{(p) => <Input data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" {...p} />}</Field>
          </>
        )}
      </Modal>
    </Panel>
  );
}
