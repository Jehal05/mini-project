import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import App from '../App.jsx';
import ForgotPassword from '../pages/ForgotPassword.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import AuditLogViewer from '../pages/AuditLogViewer.jsx';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const ctx = (over = {}) => ({ status: 'anonymous', user: null, notice: null, logout: vi.fn(), clearNotice: () => {}, ...over });

beforeEach(() => setAccessToken('tok'));
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

describe('forgot password page (feature 7)', () => {
  const renderIt = () => render(<AuthContext.Provider value={ctx()}><MemoryRouter><ForgotPassword /></MemoryRouter></AuthContext.Provider>);

  it('asks for a valid email before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderIt();
    await userEvent.setup().click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter the email/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the same confirmation the server gives, and hides the form', async () => {
    const fetchMock = vi.fn(() => json(200, { message: 'If an account exists for that email, a reset link has been sent. It expires in 15 minutes.' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderIt();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/expires in 15 minutes/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'a@b.co' });
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the form when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const user = userEvent.setup();
    renderIt();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeEnabled();
  });
});

describe('reset password page (feature 7)', () => {
  const renderIt = (auth, path = '/reset-password?token=' + 'a'.repeat(64)) => render(
    <AuthContext.Provider value={ctx(auth)}><MemoryRouter initialEntries={[path]}><Routes><Route path="/reset-password" element={<ResetPassword />} /></Routes></MemoryRouter></AuthContext.Provider>,
  );
  const fill = async (user, pw = 'Brandnew99', confirm = pw) => {
    await user.type(screen.getByLabelText('New password'), pw);
    await user.type(screen.getByLabelText('Confirm new password'), confirm);
    await user.click(screen.getByRole('button', { name: /update password/i }));
  };

  it('explains what to do when the link has no token', () => {
    renderIt({}, '/reset-password');
    expect(screen.getByRole('heading', { name: /reset link missing/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('blocks weak or mismatched passwords before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderIt();
    await fill(user, 'short', 'short');
    expect(await screen.findByText(/does not meet the rules/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    renderIt();
    await fill(user, 'Brandnew99', 'Different99');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });

  it('sends the token from the link with the new password and then points to sign-in', async () => {
    const fetchMock = vi.fn(() => json(200, { message: 'Password updated. Please sign in.' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderIt();
    await fill(user);
    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'a'.repeat(64), password: 'Brandnew99' });
  });

  it('shows the server message for an expired or used link', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(400, { error: { code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or has expired. Request a new one.' } })));
    const user = userEvent.setup();
    renderIt();
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/);
    expect(screen.queryByRole('heading', { name: /password updated/i })).not.toBeInTheDocument();
  });

  it('signs a signed-in user out locally, because the reset ended every session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { message: 'ok' })));
    const logout = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    renderIt({ status: 'authenticated', user: { id: '1', name: 'X', role: 'patient' }, logout });
    await fill(user);
    await screen.findByRole('heading', { name: /password updated/i });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('is reachable even when already signed in (the guard does not bounce it away)', () => {
    render(
      <AuthContext.Provider value={ctx({ status: 'authenticated', user: { id: '1', name: 'X', role: 'patient' } })}>
        <MemoryRouter initialEntries={['/reset-password?token=abc']}><App /></MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: /choose a new password/i })).toBeInTheDocument();
  });
});

describe('audit log viewer (feature 98)', () => {
  const rows = (n, start = 0) => Array.from({ length: n }, (_, i) => ({
    _id: `id${start + i}`, createdAt: '2026-11-18T07:30:00.000Z', actorLabel: `user${start + i}@x.co`, role: 'doctor', action: 'record.view',
    resourceType: 'patient', resourceId: 'HT-2026-0001', outcome: 'success',
  }));
  const page = (items, over = {}) => ({ items, total: items.length, page: 1, limit: 20, pages: 1, ...over });
  const lastUrl = (fetchMock) => new URL(fetchMock.mock.calls.at(-1)[0], 'http://x');

  it('lists entries newest first with who, role, action, record and outcome', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, page(rows(2)))));
    render(<AuditLogViewer />);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('user0@x.co')).toBeInTheDocument();
    expect(within(table).getAllByText('record.view')).toHaveLength(2);
    expect(within(table).getAllByText(/patient · HT-2026-0001/)).toHaveLength(2);
    expect(screen.getByText(/page 1 of 1 · 2 entries/i)).toBeInTheDocument();
  });

  it('sends the chosen filters, turns the dates into a full-day range, and returns to page 1', async () => {
    const fetchMock = vi.fn(() => json(200, page(rows(1), { pages: 3, total: 50 })));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AuditLogViewer />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastUrl(fetchMock).searchParams.get('page')).toBe('2'));

    await user.type(screen.getByLabelText(/who/i), ' rahul@x.co ');
    await user.selectOptions(screen.getByLabelText('Role'), 'doctor');
    await user.selectOptions(screen.getByLabelText('Outcome'), 'denied');
    await user.type(screen.getByLabelText(/^action/i), 'access.denied');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-18' } });
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    await waitFor(() => expect(lastUrl(fetchMock).searchParams.get('outcome')).toBe('denied'));
    const q = lastUrl(fetchMock).searchParams;
    expect(q.get('page')).toBe('1');
    expect(q.get('actor')).toBe('rahul@x.co');
    expect(q.get('role')).toBe('doctor');
    expect(q.get('action')).toBe('access.denied');
    expect(new Date(q.get('from')).getTime()).toBe(new Date('2026-11-01T00:00:00').getTime());
    expect(new Date(q.get('to')).getTime()).toBe(new Date('2026-11-18T23:59:59.999').getTime());
  });

  it('clears all filters', async () => {
    const fetchMock = vi.fn(() => json(200, page(rows(1))));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AuditLogViewer />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Role'), 'patient');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));
    await waitFor(() => expect(lastUrl(fetchMock).searchParams.get('role')).toBe('patient'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastUrl(fetchMock).searchParams.has('role')).toBe(false));
    expect(screen.getByLabelText('Role')).toHaveValue('');
  });

  it('pages forwards and back, disabling the buttons at the ends', async () => {
    const fetchMock = vi.fn((url) => {
      const p = Number(new URL(url, 'http://x').searchParams.get('page'));
      return json(200, page(rows(1, p), { page: p, pages: 2, total: 21 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AuditLogViewer />);
    await screen.findByText(/page 1 of 2/i);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/page 2 of 2/i);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText(/page 1 of 2/i);
  });

  it('says so when nothing matches, and shows the error when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, page([], { total: 0 }))));
    const { unmount } = render(<AuditLogViewer />);
    expect(await screen.findByText(/no entries match/i)).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', vi.fn(() => json(403, { error: { code: 'ROLE_FORBIDDEN', message: 'The doctor role cannot access this resource' } })));
    render(<AuditLogViewer />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot access/);
  });

  it('has no control that can change an entry', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, page(rows(2)))));
    render(<AuditLogViewer />);
    await screen.findByRole('table');
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names.filter((n) => /edit|delete|remove|change/i.test(n))).toEqual([]);
  });
});
