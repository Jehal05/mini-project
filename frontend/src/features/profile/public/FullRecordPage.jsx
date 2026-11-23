import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PortalLayout from '../../../components/PortalLayout.jsx';
import { passportApi } from '../api.js';
import { CARDIAC_LABELS } from '../constants.js';
import SevereAllergyBanner from '../SevereAllergyBanner.jsx';
import '../profile.css';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');

function List({ title, items, render }) {
  return (
    <section className="glass-card" aria-label={title}>
      <h2>{title}</h2>
      {items?.length ? <ul>{items.map((it) => <li key={it._id}>{render(it)}</li>)}</ul> : <p className="hint">None recorded.</p>}
    </section>
  );
}

/** Hospital logins only. Opening this page is written to the audit log by the server. */
export default function FullRecordPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [docUrl, setDocUrl] = useState(null);

  useEffect(() => {
    let live = true;
    passportApi.full(token)
      .then((r) => live && setState({ status: 'ok', p: r.patient }))
      .catch((e) => live && setState({ status: 'error', message: e.status === 404 ? 'This passport link is not valid.' : e.message }));
    return () => { live = false; };
  }, [token]);
  useEffect(() => () => { if (docUrl) URL.revokeObjectURL(docUrl.url); }, [docUrl]);

  const openDoc = async (d) => {
    try {
      const blob = await passportApi.fullDocumentBlob(token, d._id);
      setDocUrl({ url: URL.createObjectURL(blob), name: d.originalName, pdf: d.mimeType === 'application/pdf' });
    } catch (e) { setState((s) => ({ ...s, docError: e.message })); }
  };

  const p = state.p;
  return (
    <PortalLayout title="Patient record">
      {state.status === 'loading' && <p role="status">Loading…</p>}
      {state.status === 'error' && <div className="form-error" role="alert">{state.message}</div>}
      {p && (
        <div className="stack">
          <SevereAllergyBanner allergies={p.allergies} />
          <section className="glass-card" aria-label="Personal information">
            <h2>{p.fullName} <span className="mono hint">{p.patientId}</span></h2>
            <dl className="facts">
              <div><dt>Age</dt><dd>{p.age ?? '—'}</dd></div>
              <div><dt>Blood group</dt><dd>{p.bloodGroup ?? '—'}</dd></div>
              <div><dt>Gender</dt><dd>{p.gender ?? '—'}</dd></div>
              <div><dt>City</dt><dd>{p.city ?? '—'}</dd></div>
            </dl>
          </section>
          <List title="Cardiac history" items={p.cardiacConditions} render={(c) => `${CARDIAC_LABELS[c.type] ?? c.type}${c.year ? ` (${c.year})` : ''}`} />
          <List title="Existing conditions" items={p.medicalConditions} render={(c) => c.name} />
          <List title="Allergies" items={p.allergies} render={(a) => `${a.allergen} (${a.severity})${a.reaction ? ` — ${a.reaction}` : ''}`} />
          <List title="Medications" items={p.medications} render={(m) => <>{m.drug} {m.dose} {m.frequency} {m.isBloodThinner && <span className="pill pill-amber">Blood thinner</span>}</>} />
          <List title="Previous hospitalizations" items={p.hospitalizations} render={(h) => `${h.hospital} ${day(h.admittedOn)}${h.dischargedOn ? ` to ${day(h.dischargedOn)}` : ''}${h.reason ? ` — ${h.reason}` : ''}`} />
          <List title="Family history" items={p.familyHistory} render={(f) => `${f.relative}: ${f.condition}${f.ageAtDiagnosis !== undefined ? ` (age ${f.ageAtDiagnosis})` : ''}`} />
          <List title="Emergency contacts" items={p.emergencyContacts} render={(c) => `${c.priority}. ${c.name} (${c.relation}) ${c.phone}`} />
          <section className="glass-card" aria-label="Documents">
            <h2>Documents</h2>
            {p.documents.length === 0 ? <p className="hint">None uploaded.</p> : (
              <ul className="item-list">{p.documents.map((d) => (
                <li key={d._id}><span>{d.originalName}</span><button type="button" className="link-btn" onClick={() => openDoc(d)} aria-label={`Open ${d.originalName}`}>Open</button></li>
              ))}</ul>
            )}
            {state.docError && <p className="form-error" role="alert">{state.docError}</p>}
            {docUrl && (docUrl.pdf ? <iframe title={docUrl.name} src={docUrl.url} sandbox="" className="preview-frame" /> : <img src={docUrl.url} alt={docUrl.name} className="preview-img" />)}
          </section>
        </div>
      )}
    </PortalLayout>
  );
}
