import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, post, refreshSession, setAccessToken, setAuthLostHandler } from '../api/http.js';
import { useActivityMonitor } from './useActivityMonitor.js';

export const AuthContext = createContext(null);

export const IDLE_MS = 30 * 60 * 1000;

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, notice: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  const signedOut = useCallback((notice = null) => {
    setAccessToken(null);
    setState({ status: 'anonymous', user: null, notice });
  }, []);

  // On first load, trust the httpOnly cookie: a successful refresh means we are still signed in.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((data) => active && setState({ status: 'authenticated', user: data.user, notice: null }))
      .catch(() => active && setState({ status: 'anonymous', user: null, notice: null }));
    return () => { active = false; };
  }, []);

  // If a silent refresh fails mid-session, the session is over.
  useEffect(() => {
    setAuthLostHandler((err) => {
      if (stateRef.current.status !== 'authenticated') return;
      const idle = err instanceof ApiRequestError && err.code === 'SESSION_IDLE';
      signedOut(idle ? 'You were signed out after 30 minutes of inactivity.' : 'Your session ended. Please sign in again.');
    });
  }, [signedOut]);

  const start = useCallback((data) => {
    setAccessToken(data.accessToken);
    setState({ status: 'authenticated', user: data.user, notice: null });
    return data.user;
  }, []);

  const login = useCallback(async (endpoint, identifier, password) => start(await post(endpoint, { identifier, password }, { auth: false })), [start]);
  const register = useCallback(async (payload) => start(await post('/auth/register', payload, { auth: false })), [start]);

  const logout = useCallback(async (notice = null) => {
    try { await post('/auth/logout', undefined, { auth: false }); } catch { /* the local session ends either way */ }
    signedOut(notice);
  }, [signedOut]);

  const idleLogout = useCallback(() => logout('You were signed out after 30 minutes of inactivity.'), [logout]);
  const idle = useActivityMonitor({ enabled: state.status === 'authenticated', idleMs: IDLE_MS, onIdle: idleLogout });

  const clearNotice = useCallback(() => setState((s) => ({ ...s, notice: null })), []);

  const value = useMemo(
    () => ({ ...state, login, register, logout, clearNotice, idleWarning: idle.warning, secondsLeft: idle.secondsLeft, stayActive: idle.stayActive }),
    [state, login, register, logout, clearNotice, idle.warning, idle.secondsLeft, idle.stayActive],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
