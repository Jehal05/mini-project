import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../../components/Field.jsx';
import { useSave } from '../../profile/useProfile.jsx';
import { fmtTime, useLoad } from '../../shared/useLoad.js';
import { canManage } from '../HospitalLayout.jsx';
import { hospitalApi } from '../api.js';

const TRIAGE = { 1: 'Resuscitation', 2: 'Emergent', 3: 'Urgent', 4: 'Less urgent', 5: 'Non-urgent' };

function OccupyForm({ bay, onDone }) {
  const [f, setF] = useState({ triageLevel: '2', complaint: '', patientId: '' });
  const save = useSave();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const body = { action: 'occupy', triageLevel: Number(f.triageLevel), ...(f.complaint && { complaint: f.complaint }), ...(f.patientId && { patientId: f.patientId }) };
    if (await save.run(() => hospitalApi.bayAction(bay._id, body))) onDone();
  };
  return (
    <form onSubmit={submit} noValidate aria-label={`Occupy ${bay.label}`}>
      <Field label="Triage level">{(id) => <select id={id} value={f.triageLevel} onChange={set('triageLevel')}>{Object.entries(TRIAGE).map(([n, t]) => <option key={n} value={n}>{n} - {t}</option>)}</select>}</Field>
      <Field label="Complaint" value={f.complaint} onChange={set('complaint')} error={save.fields.complaint} />
      <Field label="Patient ID (optional)" value={f.patientId} onChange={set('patientId')} error={save.fields.patientId} hint="For example HT-2026-0001" />
      {save.error && !Object.keys(save.fields).length && <p className="form-error" role="alert">{save.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={save.busy}>Occupy bay</button>
      <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
    </form>
  );
}

/** Feature 86: ED board: bays, current patients with triage level, and the "arriving now" list from accepted cases. */
export default function EdPage() {
  const { role } = useOutletContext();
  const manage = canManage(role);
  const board = useLoad(() => hospitalApi.ed(), []);
  const [label, setLabel] = useState('');
  const [occupying, setOccupying] = useState(null);
  const add = useSave();
  const act = useSave();
  const run = async (fn) => { if (await act.run(fn)) board.reload(); };

  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="arr-h">
        <h2 id="arr-h">Arriving now</h2>
        {board.data?.arriving.length === 0 && <p className="hint">No accepted cases on the way.</p>}
        <ul className="item-list">
          {board.data?.arriving.map((c) => (
            <li key={c._id}>
              <span><strong>{c.summary ?? c.emergencyCaseId}</strong> {c.severity && <span className={`pill pill-${c.severity === 'critical' ? 'red' : 'amber'}`}>{c.severity}</span>} <span className="hint">{c.patientId}</span></span>
              <span>{c.status === 'arrived' ? 'Arrived' : c.etaMinutes != null ? `ETA ${c.etaMinutes} min` : 'On the way'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-card" aria-labelledby="bays-h">
        <h2 id="bays-h">Bays</h2>
        {board.error && <p className="form-error" role="alert">{board.error}</p>}
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <div className="bays">
          {board.data?.bays.map((b) => (
            <article key={b._id} className={`bay bay-${b.status}`} aria-label={`Bay ${b.label}`}>
              <h3>{b.label}</h3>
              <p className="hint">{b.status === 'occupied' ? 'Occupied' : b.status === 'cleaning' ? 'Cleaning' : 'Vacant'}</p>
              {b.status === 'occupied' && (
                <p>Triage {b.triageLevel} ({TRIAGE[b.triageLevel]})<br />{b.complaint}<br /><span className="mono">{b.patientId}</span><br /><span className="hint">since {fmtTime(b.occupiedAt)}</span></p>
              )}
              <div className="item-actions">
                {b.status === 'vacant' && <button type="button" className="link-btn" onClick={() => setOccupying(b._id)} aria-label={`Occupy ${b.label}`}>Occupy</button>}
                {b.status === 'occupied' && <button type="button" className="link-btn" onClick={() => run(() => hospitalApi.bayAction(b._id, { action: 'clear' }))} aria-label={`Clear ${b.label}`}>Clear</button>}
                {b.status === 'cleaning' && <button type="button" className="link-btn" onClick={() => run(() => hospitalApi.bayAction(b._id, { action: 'ready' }))} aria-label={`Ready ${b.label}`}>Ready</button>}
                {manage && b.status === 'vacant' && <button type="button" className="link-btn danger" onClick={() => run(() => hospitalApi.deleteBay(b._id))} aria-label={`Remove ${b.label}`}>Remove</button>}
              </div>
              {occupying === b._id && <OccupyForm bay={b} onDone={() => { setOccupying(null); board.reload(); }} />}
            </article>
          ))}
        </div>
        {manage && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await add.run(() => hospitalApi.addBay(label))) { setLabel(''); board.reload(); } }} noValidate aria-label="Add bay">
            <Field label="New bay label" value={label} onChange={(e) => setLabel(e.target.value)} error={add.fields.label} />
            {add.error && !add.fields.label && <p className="form-error" role="alert">{add.error}</p>}
            <button type="submit" className="btn btn-secondary" disabled={add.busy}>Add bay</button>
          </form>
        )}
      </section>
    </div>
  );
}
