import { useState } from 'react';
import Field from '../../components/Field.jsx';
import { profileApi } from './api.js';
import { useProfile, useSave } from './useProfile.jsx';

const empty = (fields) => Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : '']));
const fromItem = (fields, item) => Object.fromEntries(fields.map((f) => {
  const v = item[f.name];
  if (f.type === 'checkbox') return [f.name, Boolean(v)];
  if (f.type === 'date') return [f.name, v ? String(v).slice(0, 10) : ''];
  return [f.name, v ?? ''];
}));

/** One medical list (allergies, medications, ...): add, edit and delete, always showing what the server saved. */
export default function CrudSection({ section, title, fields, describe, badge, note, noneLabel }) {
  const { patient, apply } = useProfile();
  const items = patient[section] ?? [];
  const [editing, setEditing] = useState(null); // null | 'new' | item id
  const [form, setForm] = useState(empty(fields));
  const save = useSave();

  const open = (item) => { save.reset(); setEditing(item ? item._id : 'new'); setForm(item ? fromItem(fields, item) : empty(fields)); };
  const close = () => { save.reset(); setEditing(null); };
  const set = (name, type) => (e) => setForm((f) => ({ ...f, [name]: type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = {};
    for (const f of fields) {
      const v = form[f.name];
      if (f.type === 'checkbox') body[f.name] = v;
      else if (v === '' && editing === 'new') continue; // leave blanks out when adding
      else body[f.name] = f.type === 'number' && v !== '' ? Number(v) : v;
    }
    const res = await save.run(async () => apply(editing === 'new' ? await profileApi.addItem(section, body) : await profileApi.updateItem(section, editing, body)));
    if (res) setEditing(null);
  };

  const confirmed = patient.listsConfirmed?.[section] === true;
  const confirmNone = () => save.run(async () => apply(await profileApi.confirmNone(section)));
  const remove = (item) => save.run(async () => apply(await profileApi.deleteItem(section, item._id)));

  return (
    <section className="glass-card" aria-labelledby={`${section}-h`}>
      <div className="row-between">
        <h2 id={`${section}-h`}>{title}</h2>
        {editing === null && <button type="button" className="btn btn-secondary" onClick={() => open(null)}>Add</button>}
      </div>
      {note && <p className="hint">{note}</p>}
      {items.length === 0 && editing === null && !noneLabel && <p className="hint">Nothing added yet.</p>}
      {items.length === 0 && editing === null && noneLabel && (confirmed
        ? <p className="hint" role="status">You confirmed: {noneLabel}.</p>
        : (
          <div className="notice" role="status">
            <p>Not filled in yet. Until you add something or confirm there is none, first aid will not suggest aspirin for you.</p>
            <button type="button" className="btn btn-secondary" onClick={confirmNone} disabled={save.busy}>I have {noneLabel}</button>
          </div>
        ))}
      {save.error && items.length === 0 && <p className="form-error" role="alert">{save.error}</p>}
      <ul className="item-list">
        {items.map((item) => (
          <li key={item._id}>
            <span>{describe(item)} {badge?.(item)}</span>
            {item.dischargeSummaryId ? <span className="hint">Added by hospital</span> : (
              <span className="item-actions">
                <button type="button" className="link-btn" onClick={() => open(item)} aria-label={`Edit ${describe(item)}`}>Edit</button>
                <button type="button" className="link-btn danger" onClick={() => remove(item)} aria-label={`Delete ${describe(item)}`}>Delete</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {editing === null && save.error && <p className="form-error" role="alert">{save.error}</p>}
      {editing !== null && (
        <form onSubmit={submit} noValidate aria-label={editing === 'new' ? `Add to ${title}` : `Edit ${title}`}>
          <div className="grid-2">
            {fields.map((f) => (f.type === 'select' ? (
              <Field key={f.name} label={f.label} error={save.fields[f.name]}>
                {(id) => (
                  <select id={id} value={form[f.name]} onChange={set(f.name)}>
                    <option value="">Select…</option>
                    {f.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
              </Field>
            ) : f.type === 'checkbox' ? (
              <label key={f.name} className="check"><input type="checkbox" checked={form[f.name]} onChange={set(f.name, 'checkbox')} /> {f.label}</label>
            ) : (
              <Field key={f.name} label={f.label} type={f.type ?? 'text'} value={form[f.name]} onChange={set(f.name)} error={save.fields[f.name] ?? (save.fields._ && f === fields[0] ? save.fields._ : undefined)} />
            )))}
          </div>
          {save.error && <p className="form-error" role="alert">{save.error}</p>}
          <button type="submit" className="btn btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
        </form>
      )}
    </section>
  );
}
