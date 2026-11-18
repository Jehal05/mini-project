// Feature 56: search hospitals by name or address (300 ms debounce), with distance from the patient.
import { useEffect, useState } from 'react';
import { searchHospitals, errorMessage } from '../api/hospitals.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatKm } from '../utils/distance.js';

export default function HospitalSearch({ origin, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);
  const debouncedQ = useDebouncedValue(q.trim(), 300);

  useEffect(() => {
    if (!debouncedQ) {
      setResults([]);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    searchHospitals({ q: debouncedQ, lat: origin?.lat, lng: origin?.lng, signal: controller.signal })
      .then((list) => {
        setResults(list);
        setStatus('done');
      })
      .catch((err) => {
        const msg = errorMessage(err);
        if (msg === null) return; // cancelled by a newer search
        setError(msg);
        setStatus('error');
      });
    return () => controller.abort();
  }, [debouncedQ, origin?.lat, origin?.lng]);

  return (
    <section className="glass p-4">
      <label htmlFor="hospital-search" className="mb-2 block text-sm font-semibold">
        Search hospitals
      </label>
      <input
        id="hospital-search"
        type="search"
        value={q}
        maxLength={50}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or area, e.g. heart, Kothrud"
        className="w-full rounded-lg border border-white/15 bg-ink-950/60 px-3 py-2 text-sm text-text placeholder:text-text-muted/70 focus:border-primary focus:outline-none"
      />

      {status === 'loading' && <p className="mt-2 text-xs text-text-muted">Searching…</p>}
      {status === 'error' && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {status === 'done' && results.length === 0 && (
        <p className="mt-2 text-xs text-text-muted">No hospitals match “{debouncedQ}”.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
          {results.map((h) => (
            <li key={h._id}>
              <button
                type="button"
                onClick={() => onSelect(h)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-text-muted">{h.address}</span>
                </span>
                {h.distanceKm !== undefined && (
                  <span className="shrink-0 font-mono text-xs text-primary">{formatKm(h.distanceKm)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
