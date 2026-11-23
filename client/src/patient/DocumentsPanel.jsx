import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState, Toast } from '../ui/Feedback.jsx';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, docTypeLabel, fileProblem, formatBytes } from '../lib/patientRecord.js';
import { deleteDocument, documentUrl, listDocuments, readAsBase64, uploadDocument } from '../lib/patientApi.js';

// Feature 19: PDF, JPG or PNG up to 5 MB. The server checks the real file contents again.
export default function DocumentsPanel() {
  const [docs, setDocs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState('lab_report');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);

  const load = useCallback(() => { setLoadError(''); listDocuments().then(setDocs).catch((e) => setLoadError(e.message)); }, []);
  useEffect(load, [load]);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = fileProblem(file, { maxBytes: MAX_DOCUMENT_BYTES, types: ['application/pdf', 'image/jpeg', 'image/png'] });
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { const d = await uploadDocument({ type, name: file.name, data: await readAsBase64(file) }); setDocs((x) => [d, ...(x ?? [])]); }
    catch (err) { setError(err.fields?.data || err.message); } finally { setBusy(false); }
  }
  async function open(d) {
    try { const url = await documentUrl(d.id); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { setError(err.message); }
  }
  async function remove(d) {
    if (!window.confirm(`Delete "${d.originalName}"? This cannot be undone.`)) return;
    try { await deleteDocument(d.id); setDocs((x) => x.filter((y) => y.id !== d.id)); } catch (err) { setError(err.message); }
  }

  if (loadError) return <ErrorState title="Could not load your documents" onRetry={load}>{loadError}</ErrorState>;
  return (
    <Panel title="Medical documents">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Type of document">{(p) => <Select value={type} onChange={(e) => setType(e.target.value)} {...p}>{DOCUMENT_TYPES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select>}</Field>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" id="doc-input" onChange={pick} />
        <Button busy={busy} onClick={() => input.current?.click()}>Choose file to upload</Button>
        <p className="pb-2 text-xs text-muted">PDF, JPG or PNG, up to {formatBytes(MAX_DOCUMENT_BYTES)} each, 50 files in total.</p>
      </div>
      {error && <div className="mb-3"><Toast tone="critical" onClose={() => setError('')}>{error}</Toast></div>}
      {docs && !docs.length && <EmptyState icon="inbox" title="No documents yet">Upload an ECG, a lab report or a discharge summary so a hospital can see it if you are admitted.</EmptyState>}
      {docs?.length > 0 && (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{d.originalName}</p><p className="text-sm text-muted">{docTypeLabel(d.type)}, {formatBytes(d.size)}, {new Date(d.uploadedAt).toLocaleDateString()}</p></div>
              <Button size="sm" variant="secondary" onClick={() => open(d)}>View</Button>
              <Button size="sm" variant="quiet" aria-label={`Delete ${d.originalName}`} onClick={() => remove(d)}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
