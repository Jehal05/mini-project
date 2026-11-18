// Features 51-52 in the UI: explains why location is needed, shows the current source, and offers GPS, manual and demo options.
function sourceLabel(location) {
  if (!location) return null;
  if (location.source === 'gps') return `GPS (±${location.accuracy ?? '?'} m)`;
  if (location.source === 'demo') return 'Demo location';
  return 'Manual pin';
}

export default function LocationStatus({ geo, location, manualMode, onUseGps, onManual, onDemo }) {
  const label = sourceLabel(location);

  return (
    <section className="glass p-4" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your location</h2>
        {label && (
          <span
            className={`badge ${
              location.source === 'gps' ? 'bg-good/15 text-good' : 'bg-primary/15 text-primary'
            }`}
          >
            {label}
          </span>
        )}
      </div>

      {!location && geo.status === 'idle' && (
        <p className="text-sm text-text-muted">
          We use your location to find the nearest hospitals in an emergency. It stays on this page.
        </p>
      )}

      {location && (
        <p className="font-mono text-xs text-text-muted">
          {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </p>
      )}

      {geo.status === 'locating' && <p className="mt-2 text-sm text-primary">Finding your location…</p>}

      {geo.error && (
        <p role="alert" className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          {geo.error}
        </p>
      )}

      {manualMode && !location && (
        <p className="mt-2 text-sm text-text-muted">Click anywhere on the map to place your pin.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onUseGps} disabled={geo.status === 'locating'}>
          {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
        </button>
        <button type="button" className="btn-ghost" onClick={onManual} aria-pressed={manualMode}>
          Set location manually
        </button>
        <button type="button" className="btn-ghost" onClick={onDemo}>
          Use demo location (Rahul, Shivajinagar)
        </button>
      </div>
    </section>
  );
}
