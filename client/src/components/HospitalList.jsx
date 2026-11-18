// Features 53-54 in the UI: hospitals nearest-first with rank, distance and capability badges, plus loading, empty and error states.
import { formatKm } from '../utils/distance.js';

function Badges({ capabilities = {} }) {
  const c = capabilities;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {c.cathLab && <span className="badge bg-good/15 text-good">Cath lab</span>}
      {c.cardiologistOnDuty && <span className="badge bg-blue-500/15 text-blue-300">Cardiologist</span>}
      <span className="badge bg-white/10 text-text-muted">ICU {c.icuBedsFree ?? 0}</span>
      <span className={`badge ${c.ccuBedsFree ? 'bg-white/10 text-text-muted' : 'bg-warn/15 text-warn'}`}>
        {c.ccuBedsFree ? `CCU ${c.ccuBedsFree}` : 'CCU full'}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="space-y-2" aria-label="Loading hospitals">
      {[0, 1, 2].map((i) => (
        <li key={i} className="glass p-3">
          <div className="skeleton mb-2 h-4 w-2/3 rounded" />
          <div className="skeleton mb-3 h-3 w-1/2 rounded" />
          <div className="skeleton h-4 w-1/3 rounded" />
        </li>
      ))}
    </ul>
  );
}

export default function HospitalList({
  hospitals,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  radiusKm,
  hasLocation,
}) {
  let body;

  if (!hasLocation) {
    body = (
      <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-text-muted">
        Set your location to see the nearest hospitals.
      </p>
    );
  } else if (error) {
    body = (
      <div role="alert" className="rounded-xl border border-critical/40 bg-critical/10 p-4 text-sm">
        <p className="font-semibold text-red-300">Could not load hospitals</p>
        <p className="mt-1 text-text-muted">{error}</p>
        <button type="button" className="btn-primary mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  } else if (loading && hospitals.length === 0) {
    body = <Skeleton />;
  } else if (hospitals.length === 0) {
    body = (
      <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-text-muted">
        No hospitals within {radiusKm} km — try a larger radius.
      </p>
    );
  } else {
    body = (
      <ol className="space-y-2">
        {hospitals.map((h, i) => {
          const selected = h._id === selectedId;
          return (
            <li key={h._id}>
              <button
                type="button"
                onClick={() => onSelect(h)}
                className={`glass w-full p-3 text-left transition hover:bg-white/10 ${
                  selected ? 'ring-2 ring-primary/70' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{h.name}</p>
                      <span className="shrink-0 font-mono text-sm text-primary">{formatKm(h.distanceKm)}</span>
                    </div>
                    <p className="truncate text-xs text-text-muted">{h.address}</p>
                    <Badges capabilities={h.capabilities} />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className="glass p-4" aria-labelledby="nearby-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="nearby-heading" className="text-sm font-semibold">
          Nearby hospitals
          {hasLocation && !error && hospitals.length > 0 && (
            <span className="ml-2 text-text-muted">({hospitals.length})</span>
          )}
        </h2>
        {loading && hospitals.length > 0 && <span className="text-xs text-text-muted">Updating…</span>}
      </div>
      {body}
    </section>
  );
}
