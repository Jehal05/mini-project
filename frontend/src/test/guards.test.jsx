import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../auth/AuthContext.jsx';
import { PublicOnly, RequireAuth } from '../auth/guards.jsx';

const ctx = (status, role) => ({ status, user: role ? { id: '1', name: 'Test User', role } : null, logout: () => {} });

function renderAt(path, value) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route element={<PublicOnly />}><Route path="/public" element={<p>public page</p>} /></Route>
          <Route element={<RequireAuth roles={['central_admin']} />}><Route path="/admin" element={<p>admin page</p>} /></Route>
          <Route element={<RequireAuth />}><Route path="/any" element={<p>any signed-in page</p>} /></Route>
          <Route path="/patient" element={<p>patient home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('feature 6: route guards', () => {
  it('sends signed-out visitors to the login page', () => {
    renderAt('/admin', ctx('anonymous'));
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('waits while the session is being checked instead of flashing the login page', () => {
    renderAt('/admin', ctx('loading'));
    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('shows the 403 page, with the reason, to the wrong role', () => {
    renderAt('/admin', ctx('authenticated', 'patient'));
    expect(screen.getByRole('heading', { name: /don.t have access/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toHaveTextContent('Patient');
    expect(screen.getByText(/only for/i)).toHaveTextContent('Central admin');
    expect(screen.queryByText('admin page')).not.toBeInTheDocument();
  });

  it('lets the right role in', () => {
    renderAt('/admin', ctx('authenticated', 'central_admin'));
    expect(screen.getByText('admin page')).toBeInTheDocument();
  });

  it('lets any signed-in user into a page with no role list', () => {
    renderAt('/any', ctx('authenticated', 'doctor'));
    expect(screen.getByText('any signed-in page')).toBeInTheDocument();
  });

  it('sends signed-in users away from the public pages to their own portal', () => {
    renderAt('/public', ctx('authenticated', 'patient'));
    expect(screen.getByText('patient home')).toBeInTheDocument();
  });

  it('shows public pages to signed-out visitors', () => {
    renderAt('/public', ctx('anonymous'));
    expect(screen.getByText('public page')).toBeInTheDocument();
  });
});
