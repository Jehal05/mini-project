import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { ProfileLayout } from '../features/profile/index.js';
import ContactsPage from '../features/profile/pages/ContactsPage.jsx';
import DocumentsPage from '../features/profile/pages/DocumentsPage.jsx';
import MedicalPage from '../features/profile/pages/MedicalPage.jsx';
import PersonalPage from '../features/profile/pages/PersonalPage.jsx';
import QrPage from '../features/profile/pages/QrPage.jsx';
import SettingsPage from '../features/profile/pages/SettingsPage.jsx';
import { fakeServer } from './fakeApi.js';

const auth = { status: 'authenticated', user: { name: 'Rahul Sharma', role: 'patient', patient: { patientId: 'HT-2026-0001' } }, notice: null, logout: vi.fn(), clearNotice: () => {}, extendSession: vi.fn() };

function renderProfile(path = '/patient/profile/personal') {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/patient" element={<p>home</p>} />
          <Route path="/patient/profile" element={<ProfileLayout />}>
            <Route path="personal" element={<PersonalPage />} />
            <Route path="medical" element={<MedicalPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="passport" element={<QrPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

let server;
beforeEach(() => { server = fakeServer(); server.install(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setAccessToken(null); });

const section = (name) => screen.getByRole('region', { name });
const sent = (method, path) => server.state.calls.filter((c) => c.method === method && c.path === path);

describe('personal information', () => {
  it('saves details, shows server field errors and keeps them after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderProfile();
    await user.type(await screen.findByLabelText('City'), 'Pune');
    server.state.failNext = { status: 400, code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: { dateOfBirth: 'Date cannot be in the future' } };
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(/saved/i);
    expect(sent('PATCH', '/patients/me/personal').at(-1).body).toMatchObject({ fullName: 'Rahul Sharma', city: 'Pune' });
    unmount();
    renderProfile();
    expect(await screen.findByLabelText('City')).toHaveValue('Pune'); // data persisted on the (fake) server
  });

  it('refuses a non-image or oversized photo without calling the server', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderProfile();
    const input = await screen.findByLabelText('Choose profile photo');
    await user.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPG or PNG/);
    await user.upload(input, new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/2 MB/);
    expect(server.state.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });
});

describe('unknown or none: allergies and medicines', () => {
  it('asks the patient to add entries or confirm there are none, and remembers the answer', async () => {
    const user = userEvent.setup();
    const { unmount } = renderProfile('/patient/profile/medical');
    const allergies = await screen.findByRole('region', { name: 'Allergies' });
    expect(within(allergies).getByText(/first aid will not suggest aspirin/)).toBeInTheDocument();
    await user.click(within(allergies).getByRole('button', { name: 'I have no known allergies' }));
    expect(await within(await screen.findByRole('region', { name: 'Allergies' })).findByText('You confirmed: no known allergies.')).toBeInTheDocument();
    expect(sent('PUT', '/patients/me/allergies/confirm-none')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Medications' })).getByText(/Not filled in yet/)).toBeInTheDocument(); // medicines are separate
    unmount();
    renderProfile('/patient/profile/medical'); // reload: the server remembered
    expect(await within(await screen.findByRole('region', { name: 'Allergies' })).findByText('You confirmed: no known allergies.')).toBeInTheDocument();
  });

  it('counts an added entry as filled in', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/medical');
    const meds = await screen.findByRole('region', { name: 'Medications' });
    await user.click(within(meds).getByRole('button', { name: 'Add' }));
    await user.type(within(meds).getByLabelText('Drug'), 'Atorvastatin');
    await user.click(within(meds).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(server.state.patient.listsConfirmed.medications).toBe(true));
    expect(within(await screen.findByRole('region', { name: 'Medications' })).queryByText(/Not filled in yet/)).toBeNull();
  });
});

describe('medical profile', () => {
  it('adds, edits and deletes an allergy, with the red banner for severe ones on every tab', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/medical');
    const allergies = await screen.findByRole('region', { name: 'Allergies' });
    await user.click(within(allergies).getByRole('button', { name: 'Add' }));
    await user.type(within(allergies).getByLabelText('Allergen'), 'Penicillin');
    await user.type(within(allergies).getByLabelText('Reaction'), 'Anaphylaxis');
    await user.selectOptions(within(allergies).getByLabelText('Severity'), 'severe');
    await user.click(within(allergies).getByRole('button', { name: 'Save' }));
    expect(await within(allergies).findByText(/Penicillin — Anaphylaxis \(severe\)/)).toBeInTheDocument();
    const banner = screen.getAllByRole('alert').find((a) => /Severe allergy/.test(a.textContent));
    expect(banner).toHaveTextContent('Penicillin');

    await user.click(screen.getByRole('link', { name: 'Personal' }));
    expect(await screen.findByLabelText('City')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').some((a) => /Severe allergy/.test(a.textContent))).toBe(true); // still there on another tab

    await user.click(screen.getByRole('link', { name: 'Medical' }));
    const again = await screen.findByRole('region', { name: 'Allergies' });
    await user.click(within(again).getByRole('button', { name: /edit penicillin/i }));
    await user.selectOptions(within(again).getByLabelText('Severity'), 'mild');
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText(/Severe allergy/)).not.toBeInTheDocument());

    await user.click(within(screen.getByRole('region', { name: 'Allergies' })).getByRole('button', { name: /delete penicillin/i }));
    expect(await screen.findAllByText('Nothing added yet.')).not.toHaveLength(0);
    expect(server.state.patient.allergies).toHaveLength(0);
  });

  it('shows server validation errors next to the field and keeps the form open', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/medical');
    const cardiac = await screen.findByRole('region', { name: 'Cardiac history' });
    await user.click(within(cardiac).getByRole('button', { name: 'Add' }));
    server.state.failNext = { status: 400, code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: { year: 'Year cannot be in the future' } };
    await user.click(within(cardiac).getByRole('button', { name: 'Save' }));
    expect(await within(cardiac).findByText('Year cannot be in the future')).toBeInTheDocument();
    expect(within(cardiac).getByRole('form')).toBeInTheDocument();
  });

  it('marks blood thinners', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/medical');
    const meds = await screen.findByRole('region', { name: 'Medications' });
    await user.click(within(meds).getByRole('button', { name: 'Add' }));
    await user.type(within(meds).getByLabelText('Drug'), 'Warfarin');
    await user.click(within(meds).getByRole('button', { name: 'Save' }));
    expect(await within(meds).findByText('Blood thinner')).toBeInTheDocument();
  });

  it('hides edit and delete on hospital-written hospitalizations', async () => {
    server = fakeServer({ patient: { hospitalizations: [{ _id: 'h1', hospital: 'City Hospital', dischargeSummaryId: 'x' }] } });
    server.install();
    renderProfile('/patient/profile/medical');
    const h = await screen.findByRole('region', { name: 'Previous hospitalizations' });
    expect(within(h).getByText('Added by hospital')).toBeInTheDocument();
    expect(within(h).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});

describe('emergency contacts', () => {
  const addContact = async (user, name, phone) => {
    const form = await screen.findByRole('form', { name: 'Add emergency contact' });
    await user.type(within(form).getByLabelText('Name'), name);
    await user.type(within(form).getByLabelText('Relation'), 'Friend');
    await user.type(within(form).getByLabelText('Phone'), phone);
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
  };

  it('adds up to three contacts and then hides the form', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/contacts');
    for (const [name, phone] of [['Ann', '+919000000001'], ['Bob', '+919000000002'], ['Cy', '+919000000003']]) {
      await addContact(user, name, phone);
      await screen.findByText(new RegExp(`${name}$`));
    }
    expect(await screen.findByText(/maximum/i)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add emergency contact' })).not.toBeInTheDocument();
  });

  it('shows the server\'s message if the limit was hit elsewhere', async () => {
    const user = userEvent.setup();
    renderProfile('/patient/profile/contacts');
    await screen.findByRole('form', { name: 'Add emergency contact' });
    server.state.failNext = { status: 409, code: 'CONTACT_LIMIT', message: 'You can have at most 3 emergency contacts' };
    await addContact(user, 'Zed', '+919000000009');
    expect(await screen.findByRole('alert')).toHaveTextContent(/at most 3/);
  });

  it('reorders, and the new order is what the server saved', async () => {
    server = fakeServer({ patient: { emergencyContacts: [
      { _id: 'c1', name: 'Ann', relation: 'Spouse', phone: '+919000000001', priority: 1 },
      { _id: 'c2', name: 'Bob', relation: 'Friend', phone: '+919000000002', priority: 2 },
    ] } });
    server.install();
    const user = userEvent.setup();
    renderProfile('/patient/profile/contacts');
    await user.click(await screen.findByRole('button', { name: 'Move Bob up' }));
    await waitFor(() => expect(screen.getAllByText(/^\d\. /)[0]).toHaveTextContent('1. Bob'));
    expect(sent('PUT', '/patients/me/contacts/order')[0].body).toEqual({ order: ['c2', 'c1'] });
  });

  it('edits and deletes a contact', async () => {
    server = fakeServer({ patient: { emergencyContacts: [{ _id: 'c1', name: 'Ann', relation: 'Spouse', phone: '+919000000001', priority: 1 }] } });
    server.install();
    const user = userEvent.setup();
    renderProfile('/patient/profile/contacts');
    await user.click(await screen.findByRole('button', { name: 'Edit Ann' }));
    const form = screen.getByRole('form', { name: 'Edit Ann' });
    const name = within(form).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Anita');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/1\. Anita/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Anita' }));
    expect(await screen.findByText('No contacts yet.')).toBeInTheDocument();
  });

  it('sends a test alert and offers the WhatsApp link; shows the limit message', async () => {
    server = fakeServer({ patient: { emergencyContacts: [{ _id: 'c1', name: 'Ann', relation: 'Spouse', phone: '+919000000001', email: 'ann@example.com', priority: 1 }] } });
    server.install();
    const user = userEvent.setup();
    renderProfile('/patient/profile/contacts');
    await user.click(await screen.findByRole('button', { name: 'Send test alert to Ann' }));
    const link = await screen.findByRole('link', { name: /open whatsapp/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/919000000001/));
    expect(screen.getByRole('status')).toHaveTextContent(/emailed/);
    server.state.failNext = { status: 429, code: 'TOO_MANY_REQUESTS', message: 'You can send 3 test alerts per hour to each contact.' };
    await user.click(screen.getByRole('button', { name: 'Send test alert to Ann' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/3 test alerts per hour/);
  });
});

describe('documents', () => {
  it('rejects wrong types and sizes before uploading, then uploads, lists and deletes', async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderProfile('/patient/profile/documents');
    const input = await screen.findByLabelText('Choose document file');
    await user.upload(input, new File(['x'], 'a.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/PDF, JPG or PNG/);
    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/);
    expect(sent('POST', '/patients/me/documents')).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText('Document type'), 'lab_report');
    await user.upload(input, new File(['%PDF-1.4'], 'blood-test.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('blood-test.pdf')).toBeInTheDocument();
    expect(sent('POST', '/patients/me/documents')[0].body.get('type')).toBe('lab_report');

    await user.click(screen.getByRole('button', { name: 'Delete blood-test.pdf' }));
    await waitFor(() => expect(screen.queryByText('blood-test.pdf')).not.toBeInTheDocument());
    expect(server.state.documents).toHaveLength(0);
  });

  it('keeps the document if the delete is not confirmed, and previews through the login token', async () => {
    server = fakeServer({ documents: [{ _id: 'd1', type: 'ecg', originalName: 'ecg.pdf', mimeType: 'application/pdf', size: 2048, uploadedAt: '2024-01-01T00:00:00Z' }] });
    server.install();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderProfile('/patient/profile/documents');
    await user.click(await screen.findByRole('button', { name: 'Delete ecg.pdf' }));
    expect(sent('DELETE', '/patients/me/documents/d1')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Preview ecg.pdf' }));
    expect(await screen.findByTitle('Preview of ecg.pdf')).toHaveAttribute('src', 'blob:x');
    expect(sent('GET', '/patients/me/documents/d1/file')[0].headers.Authorization).toBe('Bearer tok');
  });
});

describe('QR passport tab', () => {
  it('shows the QR link, and renewing asks first and replaces the link', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderProfile('/patient/profile/passport');
    expect(await screen.findByTestId('qr-url')).toHaveTextContent(`/p/${'a'.repeat(64)}`);
    await user.click(screen.getByRole('button', { name: /make a new qr code/i }));
    expect(sent('POST', '/patients/me/qr/regenerate')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /make a new qr code/i }));
    await waitFor(() => expect(screen.getByTestId('qr-url')).toHaveTextContent(`/p/${'b'.repeat(64)}`));
    expect(confirm.mock.calls[0][0]).toMatch(/stop working immediately/);
  });
});

describe('settings', () => {
  it('saves notification preferences and location consent, and shows the browser permission', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: () => Promise.resolve({ state: 'denied', addEventListener: () => {}, removeEventListener: () => {} }) } });
    const user = userEvent.setup();
    renderProfile('/patient/profile/settings');
    await user.click(await screen.findByLabelText('WhatsApp'));
    await waitFor(() => expect(screen.getByLabelText('WhatsApp')).not.toBeChecked());
    expect(sent('PUT', '/patients/me/preferences')[0].body).toEqual({ whatsapp: false });
    expect(screen.getByTestId('consent-status')).toHaveTextContent('Not given');
    await user.click(screen.getByLabelText(/use my location in an emergency/i));
    await waitFor(() => expect(screen.getByTestId('consent-status')).toHaveTextContent(/Given/));
    await waitFor(() => expect(screen.getByTestId('browser-permission')).toHaveTextContent(/Blocked/));
    delete navigator.permissions;
  });
});
