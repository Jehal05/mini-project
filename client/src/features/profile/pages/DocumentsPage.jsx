import { useCallback, useEffect, useRef, useState } from 'react';
import Field from '../../../components/Field.jsx';
import { profileApi } from '../api.js';
import { useSave } from '../useProfile.jsx';

export const DOC_TYPES = [['ecg', 'ECG'], ['lab_report', 'Lab report'], ['prescription', 'Prescription'], ['discharge_summary', 'Discharge summary'], ['imaging', 'Imaging'], ['insurance', 'Insurance'], ['other', 'Other']];
const label = Object.fromEntries(DOC_TYPES);
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Shows a protected file. It is fetched with the login token and shown from a temporary local URL. */
function Preview({ doc, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let made = '';
    let live = true;
    profileApi.documentBlob(doc._id).then((b) => { if (live) { made = URL.createObjectURL(b); setUrl(made); } }).catch((e) => live && setError(e.message));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [doc._id]);
  return (
    <div className="preview" role="dialog" aria-label={`Preview of ${doc.originalName}`}>
      <div className="row-between"><strong>{doc.originalName}</strong><button type="button" className="btn btn-secondary" onClick={onClose}>Close preview</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!url && !error && <p role="status">Loading…</p>}
      {url && (doc.mimeType === 'application/pdf'
        ? <iframe title={`Preview of ${doc.originalName}`} src={url} sandbox="" className="preview-frame" />
        : <img src={url} alt={doc.originalName} className="preview-img" />)}
    </div>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState(null);
  const [type, setType] = useState('ecg');
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const up = useSave();
  const del = useSave();
  const input = useRef(null);

  const load = useCallback(() => profileApi.listDocuments().then((r) => setDocs(r.documents)).catch((e) => setLoadError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return up.run(async () => { throw new Error('Documents must be PDF, JPG or PNG'); });
    if (file.size > 5 * 1024 * 1024) return up.run(async () => { throw new Error('Documents must be 5 MB or smaller'); });
    const res = await up.run(() => profileApi.uploadDocument(file, type));
    if (res) await load();
    return res;
  };
  const remove = async (doc) => {
    if (!window.confirm(`Delete ${doc.originalName}? This cannot be undone.`)) return;
    const res = await del.run(() => profileApi.deleteDocument(doc._id));
    if (res) { if (preview?._id === doc._id) setPreview(null); await load(); }
  };

  return (
    <section className="glass-card" aria-labelledby="docs-h">
      <h2 id="docs-h">Documents</h2>
      <p className="hint">ECGs, lab reports, prescriptions and more. PDF, JPG or PNG, up to 5 MB each, up to 50 files. Only you (and a hospital you are admitted to) can open them.</p>
      <div className="upload-row">
        <Field label="Document type" error={up.fields.type}>
          {(id) => <select id={id} value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
        </Field>
        <div>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Choose document file" onChange={choose} />
          <button type="button" className="btn btn-primary" disabled={up.busy} onClick={() => input.current.click()}>{up.busy ? 'Uploading…' : 'Upload document'}</button>
        </div>
      </div>
      {up.error && <p className="form-error" role="alert">{up.error}</p>}
      {up.saved && <p className="notice" role="status">Uploaded.</p>}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {del.error && <p className="form-error" role="alert">{del.error}</p>}
      {docs?.length === 0 && <p className="hint">No documents yet.</p>}
      <ul className="item-list">
        {docs?.map((d) => (
          <li key={d._id}>
            <span><span className="pill">{label[d.type] ?? d.type}</span> {d.originalName} <span className="hint">{size(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('en-IN')}</span></span>
            <span className="item-actions">
              <button type="button" className="link-btn" onClick={() => setPreview(d)} aria-label={`Preview ${d.originalName}`}>Preview</button>
              <button type="button" className="link-btn danger" onClick={() => remove(d)} aria-label={`Delete ${d.originalName}`}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {preview && <Preview doc={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
