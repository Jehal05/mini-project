import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getAccessToken, refreshSession, setAccessToken, setAuthLostHandler } from '../api/http.js';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => { setAccessToken('old'); setAuthLostHandler(() => {}); });
afterEach(() => { vi.restoreAllMocks(); setAccessToken(null); });

describe('feature 100: silent refresh in the browser', () => {
  it('refreshes once and retries when the access token has expired', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      calls.push([url, init.headers.Authorization]);
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', user: {} });
      return init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    }));
    expect(await api('/things')).toEqual({ ok: true });
    expect(calls.map(([u]) => u.replace('/api', ''))).toEqual(['/things', '/auth/refresh', '/things']);
    expect(getAccessToken()).toBe('new');
  });

  it('runs a single refresh when several calls expire at the same time', async () => {
    let refreshes = 0;
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      if (url.endsWith('/auth/refresh')) { refreshes += 1; return json(200, { accessToken: 'new', user: {} }); }
      return init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    }));
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(refreshes).toBe(1);
  });

  it('tells the app the session is over when the refresh fails', async () => {
    const lost = vi.fn();
    setAuthLostHandler(lost);
    vi.stubGlobal('fetch', vi.fn((url) => (url.endsWith('/auth/refresh') ? json(401, { error: { code: 'SESSION_IDLE', message: 'idle' } }) : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))));
    await expect(api('/a')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(lost.mock.calls[0][0]).toMatchObject({ code: 'SESSION_IDLE' });
    expect(getAccessToken()).toBeNull();
  });

  it('does not try to refresh for other 401s', async () => {
    const fetchMock = vi.fn(() => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'nope' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/x')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('always sends credentials and the CSRF header, and keeps the token out of storage', async () => {
    const fetchMock = vi.fn(() => json(200, { accessToken: 'tok', user: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await refreshSession();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Requested-With']).toBe('healthtwin');
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('tok');
  });

  it('turns a dropped connection into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('failed'))));
    await expect(api('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
