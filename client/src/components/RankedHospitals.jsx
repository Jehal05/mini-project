// Feature 59: top 3 suitable hospitals with score, warnings, capability card and an expandable "Why this rank?" breakdown.
import { useEffect, useRef, useState } from 'react';
import ScoreBar from './ScoreBar.jsx';
import CapabilityCard from './CapabilityCard.jsx';
import { formatKm } from '../utils/distance.js';

function Breakdown({ score, id }) {
  return (
    <div id={id} className="mt-3 rounded-xl border border-white/10 bg-ink-950/50 p-3">
      <table className="w-full text-xs">
        <caption className="sr-only">Score breakdown</caption>
        <thead>
          <tr className="text-left text-text-muted">
            <th className="pb-1 font-medium">Factor</th>
            <th className="pb-1 font-medium">Detail</th>
            <th className="pb-1 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {score.breakdown.map((row) => (
            <tr key={row.factor} className="align-top">
              <td className="py-1 pr-2 font-medium">{row.label}</td>
              <td className="py-1 pr-2 text-text-muted">
                {row.detail}
                <div className="mt-1">
                  <ScoreBar value={row.points} max={row.max} label={`${row.label} points`} size="sm" />
                </div>
              </td>
              <td className="whitespace-nowrap py-1 text-right font-mono">
                {row.points} / {row.max}
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/10 font-semibold">
            <td className="pt-2" colSpan={2}>
              Total
            </td>
            <td className="whitespace-nowrap pt-2 text-right font-mono text-primary">{score.total} / 100</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RankedCard({ item, selected, promoted, onSelect, onReject }) {
  const [open, setOpen] = useState(false);
  const { hospital, score, warnings, rank } = item;
  const breakdownId = `breakdown-${hospital._id}`;

  return (
    <li
      className={`glass p-4 transition ${selected ? 'ring-2 ring-primary/70' : ''} ${promoted ? 'promoted' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-base font-bold text-ink-950"
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>

        <button type="button" onClick={() => onSelect(hospital)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold hover:text-primary">{hospital.name}</p>
          <p className="truncate text-xs text-text-muted">
            {formatKm(hospital.distanceKm)} · {hospital.address}
          </p>
          {promoted && <p className="mt-0.5 text-[11px] font-semibold text-primary">Moved up</p>}
        </button>

        <div className="shrink-0 text-right">
          <p className="font-mono text-2xl font-bold leading-none text-text">{score.total}</p>
          <p className="text-[10px] text-text-muted">/ 100</p>
        </div>
      </div>

      <div className="mt-3">
        <ScoreBar value={score.total} max={100} label={`${hospital.name} total score`} />
      </div>

      {warnings.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {warnings.map((w) => (
            <li key={w} className="badge bg-warn/15 text-warn">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <CapabilityCard hospital={hospital} compact showName={false} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          aria-expanded={open}
          aria-controls={breakdownId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide breakdown' : 'Why this rank?'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onReject(hospital)}
          title="Demo of a hospital rejecting the emergency (real accept/reject comes in Phase 4)"
        >
          Simulate rejection
        </button>
      </div>

      {open && <Breakdown score={score} id={breakdownId} />}
    </li>
  );
}

function Skeleton() {
  return (
    <ul className="space-y-3" aria-label="Ranking hospitals">
      {[0, 1, 2].map((i) => (
        <li key={i} className="glass p-4">
          <div className="flex gap-3">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="flex-1">
              <div className="skeleton mb-2 h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
          <div className="skeleton mt-3 h-2.5 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export default function RankedHospitals({ top, loading, selectedId, onSelect, onReject }) {
  // Highlight hospitals that moved up or into the top 3 (e.g. after a rejection).
  const previousRanks = useRef(null);
  const [promotedIds, setPromotedIds] = useState([]);

  useEffect(() => {
    if (!top) return undefined;
    const ranks = Object.fromEntries(top.map((t) => [String(t.hospital._id), t.rank]));
    const before = previousRanks.current;
    previousRanks.current = ranks;
    if (!before) return undefined;
    const fresh = Object.keys(ranks).filter((id) => before[id] === undefined || ranks[id] < before[id]);
    if (!fresh.length) return undefined;
    setPromotedIds(fresh);
    const timer = setTimeout(() => setPromotedIds([]), 2500);
    return () => clearTimeout(timer);
  }, [top]);

  if (loading && !top) return <Skeleton />;
  if (!top || top.length === 0) return null;

  return (
    <ol className="space-y-3" aria-label="Top hospitals for a cardiac emergency">
      {top.map((item) => (
        <RankedCard
          key={item.hospital._id}
          item={item}
          selected={selectedId === item.hospital._id}
          promoted={promotedIds.includes(String(item.hospital._id))}
          onSelect={onSelect}
          onReject={onReject}
        />
      ))}
    </ol>
  );
}
