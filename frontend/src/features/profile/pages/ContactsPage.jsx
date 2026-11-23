import { useState } from 'react';
import Field from '../../../components/Field.jsx';
import { profileApi } from '../api.js';
import { useProfile, useSave } from '../useProfile.jsx';

const blank = { name: '', relation: '', phone: '', email: '' };

function Row({ contact, index, count, onMove }) {
  const { apply } = useProfile();
  const save = useSave();
  const [form, setForm] = useState(null);
  const [alert, setAlert] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const res = await save.run(async () => apply(await profileApi.updateContact(contact._id, form)));
    if (res) setForm(null);
  };
  const test = async () => {
    setAlert(null);
    const res = await save.run(() => profileApi.testAlert(contact._id));
    if (res) setAlert(res);
  };

  return (
    <li className="contact">
      <div className="contact-head">
        <strong>{contact.priority}. {contact.name}</strong> <span className="hint">{contact.relation}</span>
        <div>{contact.phone}{contact.email ? ` · ${contact.email}` : ''}</div>
        <div className="item-actions">
          <button type="button" className="link-btn" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${contact.name} up`}>▲</button>
          <button type="button" className="link-btn" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${contact.name} down`}>▼</button>
          <button type="button" className="link-btn" onClick={() => setForm({ name: contact.name, relation: contact.relation, phone: contact.phone, email: contact.email ?? '' })} aria-label={`Edit ${contact.name}`}>Edit</button>
          <button type="button" className="link-btn" disabled={save.busy} onClick={test} aria-label={`Send test alert to ${contact.name}`}>Send test alert</button>
          <button type="button" className="link-btn danger" onClick={() => save.run(async () => apply(await profileApi.deleteContact(contact._id)))} aria-label={`Delete ${contact.name}`}>Delete</button>
        </div>
      </div>
      {alert && (
        <p className="notice" role="status">
          Test alert {alert.email === 'sent' ? 'emailed' : alert.email === 'failed' ? 'could not be emailed' : 'not emailed (no email address)'}.{' '}
          <a href={alert.whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp message</a> · {alert.remainingThisHour} left this hour for this contact.
        </p>
      )}
      {save.error && <p className="form-error" role="alert">{save.error}</p>}
      {form && (
        <form onSubmit={submit} noValidate aria-label={`Edit ${contact.name}`}>
          <div className="grid-2">
            <Field label="Name" value={form.name} onChange={set('name')} error={save.fields.name} />
            <Field label="Relation" value={form.relation} onChange={set('relation')} error={save.fields.relation} />
            <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={save.fields.phone} />
            <Field label="Email (optional)" type="email" value={form.email} onChange={set('email')} error={save.fields.email} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={save.busy}>Save</button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </form>
      )}
    </li>
  );
}

export default function ContactsPage() {
  const { patient, apply } = useProfile();
  const contacts = patient.emergencyContacts;
  const [form, setForm] = useState(blank);
  const add = useSave();
  const order = useSave();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    const res = await add.run(async () => apply(await profileApi.addContact(body)));
    if (res) setForm(blank);
  };
  const move = (index, delta) => {
    const ids = contacts.map((c) => c._id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    return order.run(async () => apply(await profileApi.reorderContacts(ids)));
  };

  return (
    <section className="glass-card" aria-labelledby="contacts-h">
      <h2 id="contacts-h">Emergency contacts</h2>
      <p className="hint">Up to 3 people. Priority 1 is called first and is the one shown on your QR passport.</p>
      {order.error && <p className="form-error" role="alert">{order.error}</p>}
      {contacts.length === 0 && <p className="hint">No contacts yet.</p>}
      <ul className="item-list">
        {contacts.map((c, i) => <Row key={c._id} contact={c} index={i} count={contacts.length} onMove={move} />)}
      </ul>
      {contacts.length < 3 ? (
        <form onSubmit={submit} noValidate aria-label="Add emergency contact">
          <h3>Add a contact</h3>
          <div className="grid-2">
            <Field label="Name" value={form.name} onChange={set('name')} error={add.fields.name} />
            <Field label="Relation" value={form.relation} onChange={set('relation')} error={add.fields.relation} />
            <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={add.fields.phone} />
            <Field label="Email (optional)" type="email" value={form.email} onChange={set('email')} error={add.fields.email} />
          </div>
          {add.error && <p className="form-error" role="alert">{add.error}</p>}
          <button type="submit" className="btn btn-primary" disabled={add.busy}>{add.busy ? 'Adding…' : 'Add contact'}</button>
        </form>
      ) : <p className="notice">You have 3 contacts, the maximum. Delete one to add another.</p>}
    </section>
  );
}
