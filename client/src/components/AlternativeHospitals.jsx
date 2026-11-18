// Feature 60: backup hospitals, excluded (rejected) chips with undo, a "Search wider" prompt, and not-suitable hospitals with reasons.
import { useState } from 'react';
import ScoreBar from './ScoreBar.jsx';
import { formatKm } from '../utils/distance.js';

export default function AlternativeHospitals({
  alternatives = [],
  notSuitable = [],
  excluded = [],
  suitableCount,
  radiusKm,
  suggestedRadiusKm,
  onWiden,
  onUndo,
  onSelect,
}) {
  const [showNotSuitable, setShowNotSuitable] = useState(false);

  return (
    <div className="space-y-3">
      {excluded.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Excluded hospitals">
          {excluded.map((h) => (
            <span key={h._id} className="badge gap-2 border border-white/15 bg-white/5 py-1 text-text-muted">
              Excluded: {h.name || 'Unknown hospital'} (rejected)
              <button
                type="button"
                onClick={() => onUndo(h._id)}
                className="text-primary hover:underline"
                aria-label={`Undo rejection of ${h.name}`}
              >
                Undo
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestedRadiusKm && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <span>
            Only {suitableCount} suitable {suitableCount === 1 ? 'hospital' : 'hospitals'} within {radiusKm} km
          </span>
          <button type="button" className="btn-ghost" onClick={() => onWiden(suggestedRadiusKm)}>
            Search {suggestedRadiusKm} km
          </button>
        </div>
      )}

      <section className="glass p-4" aria-labelledby="alternatives-heading">
        <h3 id="alternatives-heading" className="mb-2 text-sm font-semibold">
          Alternatives <span className="text-text-muted">({alternatives.length})</span>
        </h3>
        {alternatives.length === 0 ? (
          <p className="text-xs text-text-muted">No backup hospitals in this radius.</p>
        ) : (
          <ol className="space-y-2">
            {alternatives.map((item) => (
              <li key={item.hospital._id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.hospital)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-left hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 font-mono text-text-muted">#{item.rank}</span>
                      {item.hospital.name}
                    </span>
                    <span className="shrink-0 font-mono">
                      {item.score.total}
                      <span className="text-text-muted"> · {formatKm(item.hospital.distanceKm)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ScoreBar value={item.score.total} max={100} label={`${item.hospital.name} score`} size="sm" />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {notSuitable.length > 0 && (
        <section className="glass p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-semibold"
            aria-expanded={showNotSuitable}
            aria-controls="not-suitable-list"
            onClick={() => setShowNotSuitable((v) => !v)}
          >
            <span>
              Not suitable <span className="text-text-muted">({notSuitable.length})</span>
            </span>
            <span className="text-text-muted">{showNotSuitable ? 'Hide' : 'Show'}</span>
          </button>
          {showNotSuitable && (
            <ul id="not-suitable-list" className="mt-2 space-y-2">
              {notSuitable.map(({ hospital, reasons }) => (
                <li key={hospital._id} className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm">
                  <button type="button" onClick={() => onSelect(hospital)} className="w-full text-left">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-text-muted">{hospital.name}</span>
                      <span className="shrink-0 font-mono text-xs text-text-muted">{formatKm(hospital.distanceKm)}</span>
                    </div>
                    <ul className="mt-1 text-xs text-warn">
                      {reasons.map((r) => (
                        <li key={r}>✗ {r}</li>
                      ))}
                    </ul>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
