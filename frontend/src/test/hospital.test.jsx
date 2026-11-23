import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AdminLayout from '../features/admin/AdminLayout.jsx';
import HospitalLayout from '../features/hospital/HospitalLayout.jsx';
import AdmissionPage from '../features/hospital/pages/AdmissionPage.jsx';
import AdmissionsPage from '../features/hospital/pages/AdmissionsPage.jsx';
import BedsPage from '../features/hospital/pages/BedsPage.jsx';
import DashboardPage from '../features/hospital/pages/DashboardPage.jsx';
import EdPage from '../features/hospital/pages/EdPage.jsx';
import { buildReport, dischargeReport } from '../features/reports/pdf.js';
import { json } from './fakeApi.js';

const err = (status, code, message, details) => json(status, { error: { code, message, details } });
let calls;
function stub(handler) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn((url, init = {}) => {
    const path = new URL(String(url), 'http://x').pathname.replace(/^\/api/, '');
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method ?? 'GET', path, body });
    return handler(path, init.method ?? 'GET', body, String(url));
  }));
}
const as = (role) => ({ status: 'authenticated', user: { id: 'u1', name: 'Dr. Test', role, hospitalId: 'h1' }, notice: null, logout: vi.fn(), clearNotice: () => {} });
const renderAt = (ui, { role = 'hospital_admin', path = '/hospital', pattern = '/hospital' } = {}) => render(
  <AuthContext.Provider value={as(role)}><MemoryRouter initialEntries={[path]}><Routes><Route path="/hospital" element={<HospitalLayout />}><Route index element={<DashboardPage />} /><Route path="beds" element={<BedsPage />} /><Route path="ed" element={<EdPage />} /><Route path="admissions" element={<AdmissionsPage />} /><Route path="admissions/:id" element={<AdmissionPage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>,
);

beforeEach(() => setAccessToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('central admin: hospitals (81)', () => {
  const hosp = { _id: 'a'.repeat(24), name: 'Sahyadri Heart Centre', address: '1 Demo Road', phone: '+912020000000', isActive: true, location: { latitude: 18.53, longitude: 73.85 }, beds: 3, capabilities: { cathLab: true, icuBeds: 4, ccuBeds: 2, cardiologist24x7: true, alsAmbulances: 1 } };
  const renderAdmin = () => render(<AuthContext.Provider value={as('central_admin')}><MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin/*" element={<AdminLayout />} /></Routes></MemoryRouter></AuthContext.Provider>);

  it('lists hospitals, registers one with its admin, and shows field errors from the server', async () => {
    const list = [hosp];
    stub((path, method, body) => {
      if (path === '/admin/hospitals' && method === 'GET') return json(200, { hospitals: list });
      if (path === '/admin/hospitals' && method === 'POST') {
        if (!body.admin.email.includes('@')) return err(400, 'VALIDATION_ERROR', 'Check the highlighted fields', { 'admin.email': 'Enter a valid email' });
        list.push({ ...hosp, _id: 'b'.repeat(24), name: body.name });
        return json(201, { hospital: list.at(-1), admin: { email: body.admin.email }, invite: 'sent' });
      }
      return err(404, 'NOT_FOUND', 'x');
    });
    const user = userEvent.setup();
    renderAdmin();
    expect(await screen.findByText('Sahyadri Heart Centre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register a hospital' }));
    await user.type(screen.getByLabelText('Hospital name'), 'Kothrud Cardiac Care');
    await user.type(screen.getByLabelText('Phone'), '020 2000 1111');
    await user.type(screen.getByLabelText('Address'), '2 Demo Lane, Pune');
    await user.type(screen.getByLabelText('Latitude'), '18.5');
    await user.type(screen.getByLabelText('Longitude'), '73.8');
    await user.type(screen.getByLabelText('Hospital admin name'), 'Meera Admin');
    await user.type(screen.getByLabelText('Hospital admin email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Register hospital' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Hospital admin email'));
    await user.type(screen.getByLabelText('Hospital admin email'), 'meera@example.test');
    await user.click(screen.getByRole('button', { name: 'Register hospital' }));
    expect(await screen.findByText('Kothrud Cardiac Care')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').at(-1).body.admin).toEqual({ name: 'Meera Admin', email: 'meera@example.test' });
  });

  it('asks before closing a hospital and does nothing if cancelled', async () => {
    stub((path, method) => (path === '/admin/hospitals' && method === 'GET' ? json(200, { hospitals: [hosp] }) : json(200, { hospital: hosp })));
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Close Sahyadri Heart Centre' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
});

describe('hospital dashboard (82)', () => {
  it('shows the KPIs from the server', async () => {
    stub((path) => {
      if (path === '/hospital/dashboard') return json(200, { kpis: { incomingEmergencies: 2, freeBeds: 7, freeBedsByType: { general: 4, icu: 2, ccu: 1 }, doctorsOnDuty: 3, cardiologistOnDuty: false, ambulancesAvailable: 2, avgResponseSeconds: 45, respondedCases: 5, activeAdmissions: 6 } });
      if (path === '/hospital/me') return json(200, { hospital: { name: 'Sahyadri Heart Centre' } });
      return err(404, 'NOT_FOUND', 'x');
    });
    renderAt(null, { role: 'hospital_admin' });
    expect(await screen.findByText('Free beds')).toBeInTheDocument();
    expect(screen.getByText('General 4 · ICU 2 · CCU 1')).toBeInTheDocument();
    expect(screen.getByText('No cardiologist on duty')).toBeInTheDocument();
    expect(screen.getByText('45 s')).toBeInTheDocument();
  });
});

describe('beds (85)', () => {
  it('changes a bed and reloads the counts from the server', async () => {
    const bed = { _id: 'b'.repeat(24), label: 'ICU-1', type: 'icu', status: 'vacant' };
    const avail = () => ({ general: { vacant: 0, occupied: 0, cleaning: 0, reserved: 0, total: 0 }, ccu: { vacant: 0, occupied: 0, cleaning: 0, reserved: 0, total: 0 }, icu: { vacant: bed.status === 'vacant' ? 1 : 0, occupied: 0, cleaning: bed.status === 'cleaning' ? 1 : 0, reserved: 0, total: 1 } });
    stub((path, method, body) => {
      if (path === '/hospital/beds' && method === 'GET') return json(200, { beds: [{ ...bed }], availability: avail() });
      if (path === `/hospital/beds/${bed._id}`) { bed.status = body.status; return json(200, { bed }); }
      return err(404, 'NOT_FOUND', 'x');
    });
    const user = userEvent.setup();
    renderAt(null, { path: '/hospital/beds' });
    expect(await screen.findByTestId('icu-vacant')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Needs cleaning: ICU-1' }));
    await waitFor(() => expect(screen.getByTestId('icu-vacant')).toHaveTextContent('0'));
    expect(screen.getByRole('button', { name: 'Ready: ICU-1' })).toBeInTheDocument();
  });

  it('hides bed controls from a doctor', async () => {
    stub(() => json(200, { beds: [{ _id: 'b'.repeat(24), label: 'G-1', type: 'general', status: 'vacant' }], availability: { general: { vacant: 1, occupied: 0, cleaning: 0, reserved: 0, total: 1 }, icu: { vacant: 0, occupied: 0, cleaning: 0, reserved: 0, total: 0 }, ccu: { vacant: 0, occupied: 0, cleaning: 0, reserved: 0, total: 0 } } }));
    renderAt(null, { role: 'doctor', path: '/hospital/beds' });
    expect(await screen.findByText('G-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove G-1/ })).toBeNull();
    expect(screen.queryByText('Add beds')).toBeNull();
  });
});

describe('ED board (86)', () => {
  it('lists arriving cases and occupies a bay with a triage level', async () => {
    const bay = { _id: 'c'.repeat(24), label: 'Bay 1', status: 'vacant' };
    stub((path, method, body) => {
      if (path === '/hospital/ed') return json(200, { bays: [{ ...bay }], arriving: [{ _id: 'd'.repeat(24), emergencyCaseId: 'EC-1', summary: 'Chest pain, 52M', severity: 'critical', etaMinutes: 6 }] });
      if (path === `/hospital/ed/bays/${bay._id}`) { Object.assign(bay, { status: 'occupied', triageLevel: body.triageLevel, complaint: body.complaint }); return json(200, { bay }); }
      return err(404, 'NOT_FOUND', 'x');
    });
    const user = userEvent.setup();
    renderAt(null, { path: '/hospital/ed' });
    expect(await screen.findByText('Chest pain, 52M')).toBeInTheDocument();
    expect(screen.getByText('ETA 6 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Occupy Bay 1' }));
    await user.type(screen.getByLabelText('Complaint'), 'Palpitations');
    await user.click(screen.getByRole('button', { name: 'Occupy bay' }));
    expect(calls.find((c) => c.method === 'PATCH').body).toMatchObject({ action: 'occupy', triageLevel: 2, complaint: 'Palpitations' });
    expect(await screen.findByText(/Triage 2/)).toBeInTheDocument();
  });
});

describe('prescriptions (88) and discharge (89)', () => {
  const ADM = 'e'.repeat(24);
  const admission = { _id: ADM, patientId: 'HT-2026-0001', patientName: 'Rahul Sharma', ward: 'icu', bedLabel: 'ICU-1', doctorName: 'Dr. Mehta', status: 'admitted', admittedAt: new Date().toISOString() };
  const renderAdmission = (role = 'doctor') => render(
    <AuthContext.Provider value={as(role)}><MemoryRouter initialEntries={[`/hospital/admissions/${ADM}`]}><Routes><Route path="/hospital" element={<HospitalLayout />}><Route path="admissions/:id" element={<AdmissionPage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>,
  );

  it('does not load the patient record until it is opened on purpose', async () => {
    stub((path) => (path === `/hospital/admissions/${ADM}` ? json(200, { admission }) : err(404, 'NOT_FOUND', 'x')));
    const user = userEvent.setup();
    renderAdmission();
    await screen.findByText('Rahul Sharma');
    expect(calls.some((c) => c.path.endsWith('/record'))).toBe(false);
    stub((path) => (path.endsWith('/record') ? json(200, { patient: { fullName: 'Rahul Sharma', patientId: 'HT-2026-0001', allergies: [{ allergen: 'Penicillin', severity: 'severe' }], cardiacConditions: [], medications: [] }, summary: { text: 'Rahul, 44.' } }) : err(404, 'NOT_FOUND', 'x')));
    await user.click(screen.getByRole('button', { name: 'Open patient record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Penicillin/);
    expect(calls.filter((c) => c.path.endsWith('/record'))).toHaveLength(1);
  });

  it('shows the allergy warning and only saves after "Prescribe anyway"', async () => {
    const saved = [];
    stub((path, method, body) => {
      if (path === `/hospital/admissions/${ADM}`) return json(200, { admission });
      if (path.endsWith('/prescriptions/check')) return json(200, { allergens: [] });
      if (path.endsWith('/prescriptions') && method === 'GET') return json(200, { prescriptions: saved });
      if (path.endsWith('/prescriptions') && method === 'POST') {
        if (!body.acknowledgeAllergy) return err(409, 'ALLERGY_WARNING', 'Amoxicillin matches a recorded allergy: Penicillin. Confirm to prescribe anyway.', { allergens: ['Penicillin'] });
        saved.push({ _id: 'f'.repeat(24), ...body, prescriberName: 'Dr. Mehta', allergyOverride: { allergens: ['Penicillin'] } });
        return json(201, { prescription: saved[0] });
      }
      return err(404, 'NOT_FOUND', 'x');
    });
    const user = userEvent.setup();
    renderAdmission();
    await user.click(await screen.findByRole('tab', { name: 'Prescriptions' }));
    await user.type(await screen.findByLabelText('Drug'), 'Amoxicillin');
    await user.type(screen.getByLabelText('Dose'), '500 mg');
    await user.type(screen.getByLabelText('Frequency'), 'Twice daily');
    await user.type(screen.getByLabelText('Duration'), '5 days');
    await user.click(screen.getByRole('button', { name: 'Save prescription' }));
    expect(await screen.findByText('Allergy warning')).toBeInTheDocument();
    expect(saved).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Prescribe anyway' }));
    expect(await screen.findByText('Allergy acknowledged')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => Boolean(c.body.acknowledgeAllergy))).toEqual([false, true]);
  });

  it('only a doctor sees the discharge form, and it asks before discharging', async () => {
    stub((path, method) => {
      if (path === `/hospital/admissions/${ADM}`) return json(200, { admission });
      if (path.endsWith('/discharge') && method === 'GET') return json(200, { finalized: false, context: {}, summary: { diagnosis: 'NSTEMI', treatment: '', followUp: '', medicines: [] } });
      return err(404, 'NOT_FOUND', 'x');
    });
    const user = userEvent.setup();
    renderAdmission('hospital_staff');
    await user.click(await screen.findByRole('tab', { name: 'Discharge' }));
    expect(await screen.findByText('Only a doctor can discharge a patient.')).toBeInTheDocument();
    vi.unstubAllGlobals();
    stub((path, method) => {
      if (path === `/hospital/admissions/${ADM}`) return json(200, { admission });
      if (path.endsWith('/discharge') && method === 'GET') return json(200, { finalized: false, context: {}, summary: { diagnosis: 'NSTEMI', treatment: '', followUp: '', medicines: [] } });
      return err(404, 'NOT_FOUND', 'x');
    });
    document.body.innerHTML = '';
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmission('doctor');
    await user.click(await screen.findByRole('tab', { name: 'Discharge' }));
    await user.click(await screen.findByRole('button', { name: 'Finalize and discharge' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('PDF reports (97)', () => {
  it('puts a header and "Page X of Y" on every page', async () => {
    const lines = Array.from({ length: 90 }, (_, i) => `Line number ${i + 1}`);
    const pdf = await buildReport({ title: 'Test report', subtitle: 'Sub', sections: [{ heading: 'Body', lines }] });
    const pages = pdf.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    const text = pdf.output();
    expect(text).toContain('HealthTwin AI');
    for (let p = 1; p <= pages; p += 1) expect(text).toContain(`Page ${p} of ${pages}`);
  });

  it('builds a discharge summary with the diagnosis and medicines', async () => {
    const pdf = await dischargeReport({
      summary: { diagnosis: 'NSTEMI', treatment: 'Angioplasty', followUp: '', medicines: [{ drug: 'Aspirin', dose: '75 mg', frequency: 'Daily', duration: '30 days' }], finalizedByName: 'Dr. Mehta', finalizedAt: new Date().toISOString() },
      context: { hospital: { name: 'Sahyadri Heart Centre' }, patient: { fullName: 'Rahul Sharma', patientId: 'HT-2026-0001' }, ward: 'ccu' },
    });
    const text = pdf.output();
    expect(text).toContain('Discharge summary');
    expect(text).toContain('NSTEMI');
    expect(text).toContain('Aspirin');
  });
});

describe('PWA and accessibility (108)', () => {
  const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('has an installable manifest with 192 and 512 icons that exist', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of m.icons) expect(() => readFileSync(resolve(process.cwd(), `public${i.src}`))).not.toThrow();
    expect(read('index.html')).toContain('rel="manifest"');
  });

  it('service worker never handles /api requests', () => {
    expect(read('public/sw.js')).toMatch(/startsWith\('\/api'\)\) return/);
  });

  it('text and button colours meet WCAG AA (4.5:1)', () => {
    const css = read('src/styles/auth.css');
    const v = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1];
    const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    for (const bg of [v('bg-from'), v('bg-to')]) for (const fg of ['text', 'text-2', 'primary', 'normal', 'warning', 'critical']) expect(ratio(v(fg), bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', v('critical-strong'))).toBeGreaterThanOrEqual(4.5); // red buttons
    expect(ratio('#021018', v('primary'))).toBeGreaterThanOrEqual(4.5); // primary buttons
  });

  it('keeps a visible focus style and respects reduced motion', () => {
    const css = read('src/styles/auth.css');
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe('portal layout', () => {
  it('has a skip link to the main content', async () => {
    stub(() => json(200, {}));
    renderAt(null);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).not.toBeNull();
  });
});
