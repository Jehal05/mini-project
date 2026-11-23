import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { Modal } from '../ui/Overlay.jsx';
import { EmptyState, Toast } from '../ui/Feedback.jsx';
import { addContact, deleteContact, reorderContacts, sendTestAlert, updateContact } from '../lib/patientApi.js';
import { phoneForDisplay } from '../lib/patientRecord.js';
import { useSaver } from './usePatient.js';

const EMPTY = { name: '', relation: '', phone: '', email: '' };

// Feature 9: up to three contacts, in the order they are alerted.
export default function ContactsPanel({ patient, onChange }) {
  const contacts = patient.emergencyContacts ?? [];
  const [editing, setEditing] = useState(null); // null | 'new' | contact
  const [values, setValues] = useState(EMPTY);
  const [alertInfo, setAlertInfo] = useState(null);
  const saver = useSaver((p) => { onChange(p); setEditing(null); });
  const row = useSaver(onChange);

  function open(c) { setValues(c === 'new' ? EMPTY : { name: c.name, relation: c.relation, phone: c.phone, email: c.email ?? '' }); saver.clear(); setEditing(c); }
  const submit = (e) => {
    e.preventDefault();
    if (editing === 'new') saver.run(() => addContact({ name: values.name, relation: values.relation, phone: values.phone, ...(values.email.trim() && { email: values.email }) }));
    else saver.run(() => updateContact(editing.id, { name: values.name, relation: values.relation, phone: values.phone, email: values.email }));
  };
  const move = (i, d) => { const ids = contacts.map((c) => c.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; row.run(() => reorderContacts(ids)); };
  async function test(c) {
    setAlertInfo(null);
    const r = await row.run(() => sendTestAlert(c.id));
    if (r) setAlertInfo({ name: c.name, url: r.whatsappUrl, left: r.remainingThisHour });
  }
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Panel title="Emergency contacts" action={contacts.length < 3 && <Button size="sm" onClick={() => open('new')}>Add contact</Button>}>
      <p className="mb-3 text-sm text-muted">Up to 3 people. They are alerted in this order if you have an emergency.</p>
      {row.error && <div className="mb-3"><Toast tone="critical" onClose={row.clear}>{row.error}</Toast></div>}
      {alertInfo && (
        <div className="mb-3"><Toast tone="info" onClose={() => setAlertInfo(null)}>
          Test alert for {alertInfo.name} is ready: <a className="font-semibold underline" href={alertInfo.url} target="_blank" rel="noreferrer">open WhatsApp</a>. {alertInfo.left} test alerts left this hour.
        </Toast></div>
      )}
      {!contacts.length ? (
        <EmptyState icon="user" title="No emergency contacts yet" action={<Button onClick={() => open('new')}>Add your first contact</Button>}>Add someone who should hear first if something happens.</EmptyState>
      ) : (
        <ol className="divide-y divide-line">
          {contacts.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">{c.priority}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name} <span className="font-normal text-muted">({c.relation})</span></p>
                <p className="text-sm text-muted">{phoneForDisplay(c.phone)}{c.email ? `, ${c.email}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="quiet" disabled={i === 0} aria-label={`Move ${c.name} up`} onClick={() => move(i, -1)}>Up</Button>
                <Button size="sm" variant="quiet" disabled={i === contacts.length - 1} aria-label={`Move ${c.name} down`} onClick={() => move(i, 1)}>Down</Button>
                <Button size="sm" variant="secondary" onClick={() => test(c)}>Send test alert</Button>
                <Button size="sm" variant="secondary" onClick={() => open(c)}>Edit</Button>
                <Button size="sm" variant="quiet" onClick={() => { if (window.confirm(`Remove ${c.name} from your emergency contacts?`)) row.run(() => deleteContact(c.id)); }}>Remove</Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add emergency contact' : 'Edit contact'}
        footer={<><Button variant="quiet" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="contact-form" busy={saver.busy}>Save contact</Button></>}>
        <form id="contact-form" onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Name" error={saver.fields.name}>{(p) => <Input data-autofocus value={values.name} onChange={set('name')} {...p} />}</Field>
          <Field label="Relation" hint="For example Mother, Spouse, Friend" error={saver.fields.relation}>{(p) => <Input value={values.relation} onChange={set('relation')} {...p} />}</Field>
          <Field label="Phone" hint="10-digit Indian number or with country code" error={saver.fields.phone}>{(p) => <Input type="tel" value={values.phone} onChange={set('phone')} {...p} />}</Field>
          <Field label="Email (optional)" error={saver.fields.email}>{(p) => <Input type="email" value={values.email} onChange={set('email')} {...p} />}</Field>
          {saver.error && !Object.keys(saver.fields).length && <p role="alert" className="text-sm font-semibold text-critical">{saver.error}</p>}
        </form>
      </Modal>
    </Panel>
  );
}
