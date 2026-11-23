import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../../components/Field.jsx';
import { useSave } from '../../profile/useProfile.jsx';
import { useLoad } from '../../shared/useLoad.js';
import { canManage } from '../HospitalLayout.jsx';
import { hospitalApi } from '../api.js';

const TYPES = [['general', 'General'], ['icu', 'ICU'], ['ccu', 'CCU']];
const STATUS_TEXT = { vacant: 'Vacant', occupied: 'Occupied', cleaning: 'Cleaning', reserved: 'Reserved' };
const NEXT = { vacant: [['cleaning', 'Needs cleaning'], ['reserved', 'Reserve']], reserved: [['vacant', 'Release'], ['cleaning', 'Needs cleaning']], cleaning: [['vacant', 'Ready']] };

/** Feature 85: beds by type and status, with counts that update after every change. */
export default function BedsPage() {
  const { role } = useOutletContext();
  const manage = canManage(role);
  const beds = useLoad(() => hospitalApi.beds(), []);
  const [type, setType] = useState('general');
  const [label, setLabel] = useState('');
  const [bulk, setBulk] = useState({ prefix: '', count: '5' });
  const one = useSave();
  const many = useSave();
  const act = useSave();

  const apply = async (fn) => { const res = await act.run(fn); if (res) beds.reload(); return res; };
  const addOne = async (e) => { e.preventDefault(); if (await one.run(() => hospitalApi.addBed({ type, label }))) { setLabel(''); beds.reload(); } };
  const addMany = async (e) => { e.preventDefault(); if (await many.run(() => hospitalApi.addBeds({ type, prefix: bulk.prefix, count: Number(bulk.count) }))) { setBulk({ prefix: '', count: '5' }); beds.reload(); } };

  const a = beds.data?.availability;
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="beds-h">
        <h2 id="beds-h">Bed availability</h2>
        {beds.error && <p className="form-error" role="alert">{beds.error}</p>}
        {a && (
          <table className="table" aria-label="Beds by type">
            <thead><tr><th scope="col">Type</th><th scope="col">Vacant</th><th scope="col">Occupied</th><th scope="col">Cleaning</th><th scope="col">Reserved</th><th scope="col">Total</th></tr></thead>
            <tbody>
              {TYPES.map(([key, name]) => <tr key={key}><th scope="row">{name}</th><td data-testid={`${key}-vacant`}>{a[key].vacant}</td><td>{a[key].occupied}</td><td>{a[key].cleaning}</td><td>{a[key].reserved}</td><td>{a[key].total}</td></tr>)}
            </tbody>
          </table>
        )}
      </section>

      {manage && (
        <section className="glass-card" aria-labelledby="addbed-h">
          <h2 id="addbed-h">Add beds</h2>
          <div className="grid-2">
            <Field label="Type">{(id) => <select id={id} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
            <span />
            <form onSubmit={addOne} noValidate aria-label="Add one bed">
              <Field label="Bed label" value={label} onChange={(e) => setLabel(e.target.value)} error={one.fields.label} hint="For example ICU-7" />
              {one.error && !one.fields.label && <p className="form-error" role="alert">{one.error}</p>}
              <button type="submit" className="btn btn-secondary" disabled={one.busy}>Add bed</button>
            </form>
            <form onSubmit={addMany} noValidate aria-label="Add several beds">
              <Field label="Prefix" value={bulk.prefix} onChange={(e) => setBulk((b) => ({ ...b, prefix: e.target.value }))} error={many.fields.prefix} />
              <Field label="How many" type="number" min="1" max="50" value={bulk.count} onChange={(e) => setBulk((b) => ({ ...b, count: e.target.value }))} error={many.fields.count} />
              {many.error && !many.fields.prefix && !many.fields.count && <p className="form-error" role="alert">{many.error}</p>}
              <button type="submit" className="btn btn-secondary" disabled={many.busy}>Add several</button>
            </form>
          </div>
        </section>
      )}

      <section className="glass-card" aria-labelledby="all-h">
        <h2 id="all-h">All beds</h2>
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <ul className="item-list">
          {beds.data?.beds.map((b) => (
            <li key={b._id}>
              <span><strong>{b.label}</strong> <span className="hint">{b.type.toUpperCase()}</span> <span className={`pill pill-${b.status}`}>{STATUS_TEXT[b.status]}</span></span>
              {manage && (
                <span className="item-actions">
                  {(NEXT[b.status] ?? []).map(([to, text]) => <button key={to} type="button" className="link-btn" onClick={() => apply(() => hospitalApi.setBed(b._id, to))} aria-label={`${text}: ${b.label}`}>{text}</button>)}
                  {b.status === 'vacant' && <button type="button" className="link-btn danger" onClick={() => apply(() => hospitalApi.deleteBed(b._id))} aria-label={`Remove ${b.label}`}>Remove</button>}
                </span>
              )}
            </li>
          ))}
        </ul>
        {beds.data?.beds.length === 0 && <p className="hint">No beds yet.</p>}
      </section>
    </div>
  );
}
