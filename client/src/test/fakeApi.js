import { vi } from 'vitest';
import { setAccessToken } from '../api/http.js';

export const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const err = (status, code, message, details) => json(status, { error: { code, message, details } });

let n = 0;
const id = () => `id${(n += 1).toString().padStart(22, '0')}`;
export const TOKEN = 'a'.repeat(64);

/**
 * A small stand-in for the server: it keeps the patient's record in memory, so what a screen shows after
 * a reload is whatever was "saved" by earlier calls. `calls` records every request for assertions.
 */
export function fakeServer(initial = {}) {
  const state = {
    patient: {
      patientId: 'HT-2026-0001', fullName: 'Rahul Sharma', hasPhoto: false, photoUrl: null, age: 44,
      allergies: [], cardiacConditions: [], medicalConditions: [], medications: [], hospitalizations: [], familyHistory: [], emergencyContacts: [],
      notificationPreferences: { email: true, webPush: true, whatsapp: true }, consent: { location: false, dataUse: true },
      ...initial.patient,
    },
    documents: initial.documents ?? [],
    qr: { url: `http://localhost:5173/p/${TOKEN}`, rotatedAt: null },
    calls: [],
    failNext: null,
  };
  const SECTIONS = ['allergies', 'cardiacConditions', 'medicalConditions', 'medications', 'hospitalizations', 'familyHistory'];

  const respond = async (url, init = {}) => {
    const path = new URL(url, 'http://x').pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    const isForm = init.body instanceof FormData;
    const body = isForm ? init.body : init.body ? JSON.parse(init.body) : undefined;
    state.calls.push({ method, path, body, headers: init.headers ?? {} });
    if (state.failNext) { const f = state.failNext; state.failNext = null; return err(f.status, f.code, f.message, f.details); }
    const p = state.patient;
    const ok = () => json(200, { patient: structuredClone(p) });

    if (path === '/patients/me' && method === 'GET') return ok();
    if (path === '/patients/me/personal') { Object.assign(p, body); return ok(); }
    if (path === '/patients/me/preferences') {
      const { locationConsent, ...rest } = body;
      Object.assign(p.notificationPreferences, rest);
      if (locationConsent !== undefined) p.consent.location = locationConsent;
      return ok();
    }
    for (const section of SECTIONS) {
      const base = `/patients/me/${section}`;
      if (path === base && method === 'POST') {
        const item = { _id: id(), ...body };
        if (section === 'medications') item.isBloodThinner = Boolean(body.isBloodThinner) || /warfarin|clopidogrel/i.test(body.drug);
        p[section].push(item);
        return json(201, { patient: structuredClone(p) });
      }
      if (path.startsWith(`${base}/`)) {
        const itemId = path.split('/').pop();
        if (method === 'PATCH') { Object.assign(p[section].find((x) => x._id === itemId), body); return ok(); }
        if (method === 'DELETE') { p[section] = p[section].filter((x) => x._id !== itemId); return ok(); }
      }
    }
    if (path === '/patients/me/contacts' && method === 'POST') {
      if (p.emergencyContacts.length >= 3) return err(409, 'CONTACT_LIMIT', 'You can have at most 3 emergency contacts');
      const used = p.emergencyContacts.map((c) => c.priority);
      p.emergencyContacts.push({ _id: id(), ...body, priority: [1, 2, 3].find((x) => !used.includes(x)) });
      return json(201, { patient: structuredClone(p) });
    }
    if (path === '/patients/me/contacts/order') {
      body.order.forEach((cid, i) => { p.emergencyContacts.find((c) => c._id === cid).priority = i + 1; });
      p.emergencyContacts.sort((a, b) => a.priority - b.priority);
      return ok();
    }
    const contactMatch = path.match(/^\/patients\/me\/contacts\/([^/]+)(\/test-alert)?$/);
    if (contactMatch) {
      const c = p.emergencyContacts.find((x) => x._id === contactMatch[1]);
      if (contactMatch[2]) return json(200, { email: c.email ? 'sent' : 'skipped', whatsappUrl: `https://wa.me/${c.phone.replace(/\D/g, '')}?text=test`, remainingThisHour: 2 });
      if (method === 'PATCH') { Object.assign(c, body); return ok(); }
      if (method === 'DELETE') { p.emergencyContacts = p.emergencyContacts.filter((x) => x._id !== c._id); return ok(); }
    }
    if (path === '/patients/me/documents' && method === 'GET') return json(200, { documents: structuredClone(state.documents) });
    if (path === '/patients/me/documents' && method === 'POST') {
      const file = body.get('file');
      const doc = { _id: id(), type: body.get('type'), originalName: file.name, mimeType: file.type, size: file.size, uploadedAt: new Date().toISOString() };
      state.documents.unshift(doc);
      return json(201, { document: doc });
    }
    const docMatch = path.match(/^\/patients\/me\/documents\/([^/]+)(\/file)?$/);
    if (docMatch && docMatch[2]) return Promise.resolve(new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    if (docMatch && method === 'DELETE') { state.documents = state.documents.filter((d) => d._id !== docMatch[1]); return json(200, { deleted: true }); }
    if (path === '/patients/me/qr') return json(200, state.qr);
    if (path === '/patients/me/qr/regenerate') { state.qr = { url: `http://localhost:5173/p/${'b'.repeat(64)}`, rotatedAt: new Date().toISOString() }; return json(200, state.qr); }
    return err(404, 'NOT_FOUND', `fake server has no ${method} ${path}`);
  };

  const install = () => { const f = vi.fn(respond); vi.stubGlobal('fetch', f); setAccessToken('tok'); return f; };
  return { state, install };
}
