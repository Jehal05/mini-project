import { useState } from 'react';
import CapabilityCard from './CapabilityCard.jsx';

const PARTS = [
  ['distance', 'Distance'],
  ['capability', 'Capability'],
  ['load', 'Load'],
];

function Breakdown({ breakdown }) {
  return (
    <div className="mt-2 space-y-1 text-xs">
      {PARTS.map(([key, label]) => (
        <div key={key}>
          <div className="flex justify-between">
            <span>{label} (weight {Math.round(breakdown[key].weight * 100)}%)</span>
            <span>{breakdown[key].score} → {breakdown[key].points} pts</span>
          </div>
          <div className="h-1.5 rounded bg-slate-200">
            <div className="h-1.5 rounded bg-blue-600" style={{ width: `${breakdown[key].score}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Item({ h, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-lg bg-white p-3 shadow ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <button className="w-full text-left" onClick={() => { onSelect(h.id); setOpen((o) => !o); }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">#{h.rank} {h.name}</div>
            <div className="text-xs text-slate-600">
              {h.area} · {h.distanceKm} km
              {h.eta && ` · ~${Math.round(h.eta.durationMin)} min by road${h.eta.etaSource === 'estimate' ? ' (estimate)' : ''}`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{h.score}</div>
            <div className="text-[10px] uppercase text-slate-500">score</div>
          </div>
        </div>
      </button>
      {open && (
        <>
          <Breakdown breakdown={h.breakdown} />
          <CapabilityCard hospital={h} />
        </>
      )}
    </li>
  );
}

// Features 59 and 60: the top 3 are notified first, the rest are the alternatives used if one rejects or does not answer.
export default function RankingList({ results, selectedId, onSelect }) {
  const top = results.filter((r) => r.notifyFirst);
  const alternatives = results.filter((r) => !r.notifyFirst);

  if (!results.length) {
    return <p className="rounded bg-white p-4 text-sm text-slate-600 shadow">No hospitals match. Try a larger radius or fewer filters.</p>;
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-sm font-bold uppercase text-red-700">Notified first (top {top.length})</h3>
        <ul className="space-y-2">{top.map((h) => <Item key={h.id} h={h} selected={h.id === selectedId} onSelect={onSelect} />)}</ul>
      </section>
      {alternatives.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-bold uppercase text-slate-600">Alternatives (next in line if a hospital rejects or does not answer)</h3>
          <ul className="space-y-2">{alternatives.map((h) => <Item key={h.id} h={h} selected={h.id === selectedId} onSelect={onSelect} />)}</ul>
        </section>
      )}
    </div>
  );
}
