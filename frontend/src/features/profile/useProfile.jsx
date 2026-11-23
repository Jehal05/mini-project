import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { profileApi } from './api.js';

const ProfileContext = createContext(null);

/** Holds the patient's record. Every change is replaced with what the server returned, so the screen shows what is really saved. */
export function ProfileProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    profileApi.get().then((r) => live && setPatient(r.patient)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [attempt]);

  const apply = useCallback((response) => { if (response?.patient) setPatient(response.patient); return response; }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo(() => ({ patient, error, apply, retry }), [patient, error, apply, retry]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}

/** Runs a save and keeps its busy / error / saved state, with field errors from the server. */
export function useSave() {
  const [state, setState] = useState({ busy: false, error: '', fields: {}, saved: false });
  const run = useCallback(async (fn) => {
    setState({ busy: true, error: '', fields: {}, saved: false });
    try {
      const result = await fn();
      setState({ busy: false, error: '', fields: {}, saved: true });
      return result;
    } catch (err) {
      setState({ busy: false, error: err.message, fields: err.details ?? {}, saved: false });
      return null;
    }
  }, []);
  const reset = useCallback(() => setState({ busy: false, error: '', fields: {}, saved: false }), []);
  return { ...state, run, reset };
}
