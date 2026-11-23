import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { Badge, Panel } from '../ui/Surface.jsx';
import { Checkbox, Field, Input, Select } from '../ui/Form.jsx';
import { Modal } from '../ui/Overlay.jsx';
import { Toast } from '../ui/Feedback.jsx';
import { SECTIONS, SECTION_ORDER, toBody, toValues } from '../lib/patientRecord.js';
import { addSectionItem, deleteSectionItem, updateSectionItem } from '../lib/patientApi.js';
import { useSaver } from './usePatient.js';

// Features 13-18: six medical lists that share one editor, driven by SECTIONS in lib/patientRecord.js.
export default function MedicalPanel({ patient, onChange }) {
  const [edit, setEdit] = useState(null); // { section, item|null }
  const [values, setValues] = useState({});
  const saver = useSaver((p) => { onChange(p); setEdit(null); });
  const row = useSaver(onChange);
  const cfg = edit && SECTIONS[edit.section];

  function open(section, item = null) { setValues(toValues(SECTIONS[section].fields, item ?? {})); saver.clear(); setEdit({ section, item }); }
  const submit = (e) => {
    e.preventDefault();
    const { section, item } = edit;
    if (item) saver.run(() => updateSectionItem(section, item.id, toBody(cfg.fields, values, { forUpdate: true })));
    else saver.run(() => addSectionItem(section, toBody(cfg.fields, values)));
  };
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="space-y-4">
      {row.error && <Toast tone="critical" onClose={row.clear}>{row.error}</Toast>}
      <p className="text-sm text-muted">Severe allergies and heart conditions appear on your QR passport so a stranger or a hospital can see them in an emergency.</p>
      {SECTION_ORDER.map((section) => {
        const s = SECTIONS[section]; const items = patient[section] ?? [];
        return (
          <Panel key={section} title={s.label} action={<Button size="sm" variant="secondary" onClick={() => open(section)}>Add {s.noun}</Button>}>
            {!items.length ? <p className="text-sm text-muted">Nothing added yet.</p> : (
              <ul className="divide-y divide-line">
                {items.map((it) => {
                  const badge = s.badge?.(it);
                  return (
                    <li key={it.id} className="flex flex-wrap items-center gap-3 py-2">
                      <div className="min-w-0 flex-1"><p className="font-semibold">{s.title(it)} {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}</p>{s.detail(it) && <p className="text-sm text-muted">{s.detail(it)}</p>}</div>
                      {!it.byHospital && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="secondary" aria-label={`Edit ${s.title(it)}`} onClick={() => open(section, it)}>Edit</Button>
                          <Button size="sm" variant="quiet" aria-label={`Delete ${s.title(it)}`} onClick={() => { if (window.confirm(`Delete "${s.title(it)}"?`)) row.run(() => deleteSectionItem(section, it.id)); }}>Delete</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );
      })}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? `${edit.item ? 'Edit' : 'Add'} ${cfg.noun}` : ''}
        footer={<><Button variant="quiet" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" form="section-form" busy={saver.busy}>Save</Button></>}>
        {edit && (
          <form id="section-form" onSubmit={submit} className="space-y-3" noValidate>
            {cfg.fields.map((f, i) => f.kind === 'check'
              ? <Checkbox key={f.key} label={f.label} checked={Boolean(values[f.key])} onChange={set(f.key)} />
              : (
                <Field key={f.key} label={f.label} error={saver.fields[f.key]}>{(p) => (f.kind === 'select'
                  ? <Select value={values[f.key]} onChange={set(f.key)} {...(i === 0 ? { 'data-autofocus': true } : {})} {...p}><option value="">Choose</option>{f.options.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select>
                  : <Input type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'} value={values[f.key]} onChange={set(f.key)} {...(i === 0 ? { 'data-autofocus': true } : {})} {...p} />)}</Field>
              ))}
            {saver.error && !Object.keys(saver.fields).length && <p role="alert" className="text-sm font-semibold text-critical">{saver.error}</p>}
          </form>
        )}
      </Modal>
    </div>
  );
}
