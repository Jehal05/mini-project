import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, setAccessToken, api } from '../api/http.js';
import { AuthProvider, useAuth } from '../auth/AuthContext.jsx';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const USER = { id: 'u1', name: 'Rahul Sharma', role: 'patient' };

function Probe() {
  const a = useAuth();
  return (
    <div>
      <p data-testid="status">{a.status}</p>
      <p data-testid="user">{a.user?.name ?? 'none'}</p>
      <p data-testid="notice">{a.notice ?? 'no-notice'}</p>
      <button onClick={() => a.login('/auth/login/patient', 'r@x.co', 'Heart1234').catch(() => {})}>login</button>
      <button onClick={() => a.logout()}>logout</button>
      <button onClick={() => api('/things').catch(() => {})}>call</button>
    </div>
  );
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const status = () => screen.getByTestId('status').textContent;

beforeEach(() => { setAccessToken(null); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

describe('AuthProvider', () => {
  it('restores a signed-in session from the refresh cookie on first load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { accessToken: 'tok', user: USER })));
    mount();
    expect(status()).toBe('loading');
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('Rahul Sharma');
    expect(getAccessToken()).toBe('tok');
  });

  it('becomes anonymous, without a notice, when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: { code: 'NO_REFRESH_TOKEN', message: 'Please sign in' } })));
    mount();
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(screen.getByTestId('notice')).toHaveTextContent('no-notice');
  });

  it('logs in, keeps the token in memory only, and uses it on later calls', async () => {
    const fetchMock = vi.fn((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(401, { error: { code: 'NO_REFRESH_TOKEN', message: '' } });
      if (url.endsWith('/auth/login/patient')) return json(200, { accessToken: 'abc', user: USER });
      return json(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(status()).toBe('anonymous'));
    await user.click(screen.getByText('login'));
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('call'));
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toMatch(/\/things$/));
    expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer abc');
    expect(JSON.stringify({ ...localStorage })).not.toContain('abc');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('abc');
  });

  it('logout tells the server and clears the local session even if the server cannot be reached', async () => {
    const fetchMock = vi.fn((url) => (url.endsWith('/auth/logout') ? Promise.reject(new TypeError('offline')) : json(200, { accessToken: 'tok', user: USER })));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(fetchMock.mock.calls.some(([u]) => u.endsWith('/auth/logout'))).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  it('signs out with an explanation when the session ends in the middle of use', async () => {
    let refreshes = 0;
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return refreshes === 1 ? json(200, { accessToken: 'tok', user: USER }) : json(401, { error: { code: 'REFRESH_TOKEN_REVOKED', message: 'ended' } });
      }
      return json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    }));
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('call'));
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(screen.getByTestId('notice')).toHaveTextContent(/session ended/i);
  });

  it('says it was the 30-minute idle rule when that is why the refresh failed', async () => {
    let refreshes = 0;
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return refreshes === 1 ? json(200, { accessToken: 'tok', user: USER }) : json(401, { error: { code: 'SESSION_IDLE', message: 'idle' } });
      }
      return json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    }));
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('call'));
    await waitFor(() => expect(screen.getByTestId('notice')).toHaveTextContent(/30 minutes of inactivity/));
  });
});
