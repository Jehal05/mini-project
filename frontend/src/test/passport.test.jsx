import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { SevereAllergyBanner, parsePassportToken } from '../features/profile/index.js';
import FullRecordPage from '../features/profile/public/FullRecordPage.jsx';
import PassportPage from '../features/profile/public/PassportPage.jsx';
import ScanPage from '../features/profile/public/ScanPage.jsx';
import { buildWalletCard } from '../features/profile/walletCard.js';
import { json, TOKEN } from './fakeApi.js';

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class { constructor() { this.isScanning = false; } async start() { throw new Error('no camera'); } async stop() {} clear() {} },
}));

const PASSPORT = {
  patientId: 'HT-2026-0001', bloodGroup: 'B+', hasPhoto: false, photoUrl: null,
  severeAllergies: [{ allergen: 'Penicillin', reaction: 'Anaphylaxis' }],
  cardiacHistory: [{ type: 'stent', year: 2022 }],
  emergencyContact: { name: 'Priya Sharma', relation: 'Spouse', phone: '+919876500002' },
};

const anonymous = { status: 'anonymous', user: null, notice: null, logout: vi.fn(), clearNotice: () => {} };
const renderAnon = (ui, path = `/p/${TOKEN}`, pattern = '/p/:token') => render(
  <AuthContext.Provider value={anonymous}><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={ui} /></Routes></MemoryRouter></AuthContext.Provider>,
);

let calls;
function stub(handler) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn((url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); }));
}
const geolocate = (impl) => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: impl } });

beforeEach(() => setAccessToken(null));
afterEach(() => { vi.unstubAllGlobals(); delete navigator.geolocation; });

describe('public passport page (no login)', () => {
  it('shows only the emergency tier, calls the API without a token, and always shows Call 112 / 108', async () => {
    stub(() => json(200, { passport: PASSPORT }));
    renderAnon(<PassportPage />);
    expect(await screen.findByTestId('blood-group')).toHaveTextContent('B+');
    expect(screen.getByRole('alert')).toHaveTextContent(/Penicillin — Anaphylaxis/);
    expect(screen.getByText('Stent (2022)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+919876500002' })).toHaveAttribute('href', 'tel:+919876500002');
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByRole('link', { name: /Call 108/ })).toHaveAttribute('href', 'tel:108');
    expect(calls[0].url).toBe(`/api/passport/${TOKEN}`);
    expect(calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('shows one calm message for an invalid or replaced link, with the call buttons still there', async () => {
    stub(() => json(404, { error: { code: 'PASSPORT_NOT_FOUND', message: 'This passport link is not valid' } }));
    renderAnon(<PassportPage />);
    expect(await screen.findByRole('heading', { name: /not valid/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /report an emergency/i })).not.toBeInTheDocument();
  });

  it('sends the scanner\'s location on one tap and honestly says it is only a report', async () => {
    stub((url) => (url.endsWith('/report') ? json(202, { received: true, reportId: 'r1' }) : json(200, { passport: PASSPORT })));
    geolocate((ok) => ok({ coords: { latitude: 18.52, longitude: 73.85, accuracy: 12.4 } }));
    renderAnon(<PassportPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Report an emergency for this person' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Report received');
    expect(status).toHaveTextContent(/does not call emergency services by itself/i);
    const post = calls.find((c) => c.url.endsWith('/report'));
    expect(post.init.method).toBe('POST');
    expect(JSON.parse(post.init.body)).toEqual({ latitude: 18.52, longitude: 73.85, accuracyMeters: 12 });
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument(); // still visible afterwards
  });

  it('sends nothing when location is refused, and says what to do', async () => {
    stub(() => json(200, { passport: PASSPORT }));
    geolocate((_ok, fail) => fail({ code: 1 }));
    renderAnon(<PassportPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Report an emergency for this person' }));
    expect(await screen.findByText(/We need your location/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/report'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Report an emergency for this person' })).toBeEnabled(); // can try again
  });

  it('does not claim success when the server refuses (rate limit), and points to 112 / 108', async () => {
    stub((url) => (url.endsWith('/report') ? json(429, { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many reports from this device.' } }) : json(200, { passport: PASSPORT })));
    geolocate((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } }));
    renderAnon(<PassportPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Report an emergency for this person' }));
    expect(await screen.findByText(/Too many reports from this device\. If this is an emergency, call 112 \/ 108 now\./)).toBeInTheDocument();
    expect(screen.queryByText('Report received.')).not.toBeInTheDocument();
  });

  it('a second tap while sending does not send a second report', async () => {
    let release;
    stub((url) => (url.endsWith('/report') ? new Promise((r) => { release = () => r(new Response('{"received":true}', { status: 202 })); }) : json(200, { passport: PASSPORT })));
    geolocate((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } }));
    renderAnon(<PassportPage />);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Report an emergency for this person' });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: /sending report/i })).catch(() => {});
    await waitFor(() => expect(release).toBeDefined());
    release();
    await screen.findByText('Report received.');
    expect(calls.filter((c) => c.url.endsWith('/report'))).toHaveLength(1);
  });
});

describe('SevereAllergyBanner', () => {
  it('shows only severe allergies, and nothing when there are none', () => {
    const { container, rerender } = render(<SevereAllergyBanner allergies={[{ allergen: 'Dust', severity: 'mild' }, { allergen: 'Latex', severity: 'severe', reaction: 'Swelling' }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Latex — Swelling');
    expect(screen.queryByText(/Dust/)).not.toBeInTheDocument();
    rerender(<SevereAllergyBanner allergies={[{ allergen: 'Dust', severity: 'mild' }]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SevereAllergyBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('parsePassportToken', () => {
  it.each([
    [`https://healthtwin.example/p/${TOKEN}`, TOKEN],
    [`http://localhost:5173/p/${TOKEN}/`, TOKEN],
    [`  ${TOKEN}  `, TOKEN],
    ['https://evil.example/login', null],
    [`https://x.example/p/${'g'.repeat(64)}`, null],
    [`https://x.example/p/${TOKEN}/full`, null],
    ['', null], [undefined, null], ['javascript:alert(1)', null],
  ])('%s', (input, expected) => expect(parsePassportToken(input)).toBe(expected));
});

describe('scan page', () => {
  const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
  const renderScan = () => render(
    <AuthContext.Provider value={anonymous}>
      <MemoryRouter initialEntries={['/scan']}><Routes><Route path="/scan" element={<ScanPage />} /><Route path="/p/:token" element={<Where />} /></Routes></MemoryRouter>
    </AuthContext.Provider>,
  );

  it('opens a pasted passport link, and says so when the camera is unavailable', async () => {
    const user = userEvent.setup();
    renderScan();
    expect(await screen.findByText(/camera is not available/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Or paste the link'), `https://healthtwin.example/p/${TOKEN}`);
    await user.click(screen.getByRole('button', { name: 'Open passport' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/p/${TOKEN}`);
  });

  it('rejects anything that is not a passport link', async () => {
    const user = userEvent.setup();
    renderScan();
    await user.type(screen.getByLabelText('Or paste the link'), 'https://evil.example/');
    await user.click(screen.getByRole('button', { name: 'Open passport' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a HealthTwin passport/);
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });
});

describe('full record page (hospital login)', () => {
  const record = {
    patientId: 'HT-2026-0001', fullName: 'Rahul Sharma', age: 44, bloodGroup: 'B+', city: 'Pune',
    allergies: [{ _id: 'a1', allergen: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis' }],
    cardiacConditions: [{ _id: 'c1', type: 'stent', year: 2022 }], medicalConditions: [],
    medications: [{ _id: 'm1', drug: 'Clopidogrel', dose: '75 mg', isBloodThinner: true }],
    hospitalizations: [], familyHistory: [], emergencyContacts: [{ _id: 'e1', name: 'Priya', relation: 'Spouse', phone: '+919876500002', priority: 1 }],
    documents: [{ _id: 'd1', originalName: 'ecg.pdf', mimeType: 'application/pdf' }],
  };
  const doctor = { status: 'authenticated', user: { name: 'Dr. Meera', role: 'doctor' }, notice: null, logout: vi.fn(), clearNotice: () => {}, extendSession: vi.fn() };

  it('shows the full record with the allergy banner and a blood thinner flag, sending the login token', async () => {
    setAccessToken('doctor-token');
    stub(() => json(200, { patient: record }));
    render(<AuthContext.Provider value={doctor}><MemoryRouter initialEntries={[`/p/${TOKEN}/full`]}><Routes><Route path="/p/:token/full" element={<FullRecordPage />} /></Routes></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByRole('heading', { name: /Rahul Sharma/ })).toBeInTheDocument();
    expect(screen.getAllByRole('alert').some((a) => /Severe allergy/.test(a.textContent))).toBe(true);
    expect(screen.getByText('Blood thinner')).toBeInTheDocument();
    expect(calls[0].url).toBe(`/api/passport/${TOKEN}/full`);
    expect(calls[0].init.headers.Authorization).toBe('Bearer doctor-token');
  });

  it('shows a plain message for a revoked link', async () => {
    setAccessToken('doctor-token');
    stub(() => json(404, { error: { code: 'PASSPORT_NOT_FOUND', message: 'This passport link is not valid' } }));
    render(<AuthContext.Provider value={doctor}><MemoryRouter initialEntries={[`/p/${TOKEN}/full`]}><Routes><Route path="/p/:token/full" element={<FullRecordPage />} /></Routes></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid/);
  });
});

describe('wallet card', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('is a single credit-card-size page with the blood group and ID, and no name', async () => {
    const pdf = await buildWalletCard({ patientId: 'HT-2026-0001', bloodGroup: 'B+', qrDataUrl: PNG });
    expect(pdf.getNumberOfPages()).toBe(1);
    const { width, height } = pdf.internal.pageSize;
    expect([Math.round(width * 10) / 10, Math.round(height * 10) / 10]).toEqual([85.6, 54]);
    const raw = pdf.output();
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toContain('HT-2026-0001');
    expect(raw).toContain('B+');
    expect(raw).not.toContain('Sharma');
  });
});

describe('login return path for the full record', () => {
  const TOKEN64 = TOKEN;
  const run = async (role, from) => {
    const { default: Login } = await import('../pages/Login.jsx');
    const login = vi.fn().mockResolvedValue({ role });
    render(
      <AuthContext.Provider value={{ ...anonymous, login }}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/hospital" element={<p>hospital home</p>} />
            <Route path="/patient" element={<p>patient home</p>} />
            <Route path="/p/:token/full" element={<p>full record</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: role === 'doctor' ? 'Doctor' : 'Patient' }));
    await user.type(screen.getByLabelText('Email or phone'), 'x@example.com');
    await user.type(screen.getByLabelText('Password'), 'Heart1234');
    await user.click(screen.getByRole('button', { name: /^sign in as/i }));
  };

  it('sends a doctor back to the full record they scanned', async () => {
    await run('doctor', `/p/${TOKEN64}/full`);
    expect(await screen.findByText('full record')).toBeInTheDocument();
  });

  it('never sends a patient (or anyone) to some other address from the return path', async () => {
    await run('patient', `/p/${TOKEN64}/full`);
    expect(await screen.findByText('patient home')).toBeInTheDocument();
  });
});
