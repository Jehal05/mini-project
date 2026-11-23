import { useCallback, useEffect, useState } from 'react';
import { fetchMe } from '../lib/patientApi.js';

export function usePatient() {
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); fetchMe().then(setPatient).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  return { patient, setPatient, error, reload: load };
}

/** Runs a save, keeps the field errors the server returns, and hands the new record to the screen. */
export function useSaver(onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const run = useCallback(async (fn) => {
    setBusy(true); setError(''); setFields({});
    try { const out = await fn(); onSaved?.(out); return out; }
    catch (e) { setError(e.message); setFields(e.fields ?? {}); return null; }
    finally { setBusy(false); }
  }, [onSaved]);
  return { run, busy, error, fields, clear: () => { setError(''); setFields({}); } };
}
