import { useCallback, useEffect, useState } from 'react';

/** Loads data from an async function and lets the screen reload it after a change. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    run().then((data) => live && setState({ data, error: '', loading: false })).catch((e) => live && setState({ data: null, error: e.message ?? 'Could not load', loading: false }));
    return () => { live = false; };
  }, [run, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const set = useCallback((data) => setState({ data, error: '', loading: false }), []);
  return { ...state, reload, set };
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtSeconds = (s) => (s == null ? '—' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
