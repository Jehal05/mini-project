import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';

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
    setMessage(r.ok ? `${name}: verified OK.` : `${name}: FAILED. ${r.problems.join('; ')}`);
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
    <section className="space-y-3 rounded-lg bg-white p-4 shadow" aria-label="Backups">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Backups</h3>
        <button disabled={Boolean(busy)} onClick={backupNow} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy === 'backup' ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
      <p className="text-xs text-slate-600">Backups contain patient data. Keep them encrypted and off the app server. {list && `Keeping the newest ${list.keep}.`}</p>
      {message && <p className="rounded bg-green-50 p-2 text-sm text-green-900" role="status">{message}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800" role="alert">{error}</p>}

      {!list && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {list && !list.count && <p className="text-sm text-slate-500">No backups yet.</p>}
      {list?.results.length > 0 && (
        <ul className="divide-y text-sm">
          {list.results.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs">{b.name}</span>
                <span className="ml-2 text-xs text-slate-600">
                  {b.unreadable ? 'unreadable' : `${b.totalDocuments} documents, ${b.encrypted ? 'encrypted' : 'not encrypted'}, ${kb(b.sizeBytes)}`}
                </span>
              </span>
              {!b.unreadable && (
                <span className="flex gap-2">
                  <button disabled={Boolean(busy)} onClick={() => verify(b.name)} className="rounded border px-2 py-0.5">Verify</button>
                  <button disabled={Boolean(busy)} onClick={() => startRestore(b.name)} className="rounded border border-red-700 px-2 py-0.5 text-red-700">Restore…</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {restore && (
        <div role="dialog" aria-modal="true" aria-label="Confirm restore" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg space-y-3 overflow-auto rounded-lg bg-white p-4 shadow-xl">
            <h4 className="text-lg font-bold text-red-800">Restore from {restore.name}?</h4>
            <p className="text-sm">
              This replaces the live data with the backup from {new Date(restore.backupCreatedAt).toLocaleString()}. A safety backup of the current data is taken first.
              Nothing has been changed yet. Pause other users before you continue.
            </p>
            <table className="w-full text-left text-sm">
              <thead><tr><th className="border-b py-1">Collection</th><th className="border-b py-1">Now</th><th className="border-b py-1">After restore</th></tr></thead>
              <tbody>
                {restore.plan.map((p) => (
                  <tr key={p.collection}><td className="py-0.5">{p.collection}</td><td>{p.liveDocuments}</td><td>{p.backupDocuments}</td></tr>
                ))}
              </tbody>
            </table>
            {restore.untouchedCollections.length > 0 && <p className="text-xs text-slate-600">Not in the backup, left as they are: {restore.untouchedCollections.join(', ')}</p>}
            <label className="block text-sm">
              Type <strong>{PHRASE}</strong> to confirm
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 font-mono" autoComplete="off" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRestore(null)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
              <button disabled={typed !== PHRASE || busy === 'restore'} onClick={confirmRestore} className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                {busy === 'restore' ? 'Restoring…' : 'Restore now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
