import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';

afterEach(() => vi.restoreAllMocks());

function renderPage(ui, auth, path = '/') {
  const value = { status: 'anonymous', user: null, notice: null, clearNotice: () => {}, ...auth };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/login" element={ui} />
          <Route path="/patient" element={<p>patient home</p>} />
          <Route path="/hospital" element={<p>hospital home</p>} />
          <Route path="/admin" element={<p>admin home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('login page', () => {
  it.each([
    ['Patient', '/auth/login/patient', 'patient', 'patient home'],
    ['Doctor', '/auth/login/doctor', 'doctor', 'hospital home'],
    ['Hospital staff', '/auth/login/staff', 'hospital_staff', 'hospital home'],
    ['Admin', '/auth/login/admin', 'central_admin', 'admin home'],
  ])('the %s tab signs in through its own endpoint and lands in the right portal', async (tab, endpoint, role, landing) => {
    const login = vi.fn().mockResolvedValue({ role });
    const user = userEvent.setup();
    renderPage(<Login />, { login });
    await user.click(screen.getByRole('tab', { name: tab }));
    await user.type(screen.getByLabelText('Email or phone'), 'someone@example.com');
    await user.type(screen.getByLabelText('Password'), 'Heart1234');
    await user.click(screen.getByRole('button', { name: /^sign in as/i }));
    expect(login).toHaveBeenCalledWith(endpoint, 'someone@example.com', 'Heart1234');
    expect(await screen.findByText(landing)).toBeInTheDocument();
  });

  it('asks for both fields without calling the server', async () => {
    const login = vi.fn();
    const user = userEvent.setup();
    renderPage(<Login />, { login });
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual(expect.arrayContaining(['Enter your email or phone', 'Enter your password']));
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the server message when the login is refused and lets the user retry', async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(401, 'INVALID_CREDENTIALS', 'Incorrect email/phone or password'));
    const user = userEvent.setup();
    renderPage(<Login />, { login });
    await user.type(screen.getByLabelText('Email or phone'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in as patient/i }));
    expect(await screen.findByText('Incorrect email/phone or password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in as patient/i })).toBeEnabled();
  });

  it('can reveal the password and links to registration and password reset', async () => {
    const user = userEvent.setup();
    renderPage(<Login />, {});
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register');
  });

  it('shows why the user was signed out', () => {
    renderPage(<Login />, { notice: 'You were signed out after 30 minutes of inactivity.' });
    expect(screen.getByRole('status')).toHaveTextContent(/30 minutes of inactivity/);
  });

  it('opens on the tab named in the address', () => {
    renderPage(<Login />, {}, '/?portal=doctor');
    expect(screen.getByRole('tab', { name: 'Doctor' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('registration page', () => {
  async function fill(user, over = {}) {
    await user.type(screen.getByLabelText('Full name'), over.name ?? 'Rahul Sharma');
    await user.type(screen.getByLabelText('Email'), over.email ?? 'rahul@example.com');
    await user.type(screen.getByLabelText('Password'), over.password ?? 'Heart1234');
    await user.type(screen.getByLabelText('Confirm password'), over.confirm ?? over.password ?? 'Heart1234');
  }

  it('blocks submission until data-use consent is given', async () => {
    const register = vi.fn();
    const user = userEvent.setup();
    renderPage(<Register />, { register });
    await fill(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/you must agree to data use/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('sends the consent choices with the registration and opens the patient portal', async () => {
    const register = vi.fn().mockResolvedValue({ role: 'patient' });
    const user = userEvent.setup();
    renderPage(<Register />, { register });
    await fill(user);
    await user.click(screen.getByRole('checkbox', { name: /store my health information/i }));
    await user.click(screen.getByRole('checkbox', { name: /use of my location/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register).toHaveBeenCalledWith({ fullName: 'Rahul Sharma', email: 'rahul@example.com', phone: undefined, password: 'Heart1234', consent: { dataUse: true, location: true } });
    expect(await screen.findByText('patient home')).toBeInTheDocument();
  });

  it('checks password rules live and that both passwords match', async () => {
    const register = vi.fn();
    const user = userEvent.setup();
    renderPage(<Register />, { register });
    await user.type(screen.getByLabelText('Password'), 'abc');
    const rules = screen.getByRole('list', { name: /password rules/i });
    expect(rules).toHaveTextContent('○ At least 8 characters');
    expect(rules).toHaveTextContent('✓ A letter');
    await user.type(screen.getByLabelText('Password'), 'defgh1');
    expect(rules).toHaveTextContent('✓ At least 8 characters');
    expect(rules).toHaveTextContent('✓ A number');
    await user.type(screen.getByLabelText('Confirm password'), 'different1');
    await user.click(screen.getByRole('checkbox', { name: /store my health information/i }));
    await user.type(screen.getByLabelText('Full name'), 'Rahul');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('shows a duplicate-account error against the email field', async () => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(409, 'ACCOUNT_EXISTS', 'An account with that email or phone already exists'));
    const user = userEvent.setup();
    renderPage(<Register />, { register });
    await fill(user);
    await user.click(screen.getByRole('checkbox', { name: /store my health information/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect((await screen.findAllByText(/already exists/i)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
