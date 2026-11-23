import { useState } from 'react';
import CapabilityCard from './CapabilityCard.jsx';
import { Card } from '../ui/Surface.jsx';
import { EmptyState } from '../ui/Feedback.jsx';

const PARTS = [['distance', 'Distance'], ['capability', 'Capability'], ['load', 'Load']];

function Breakdown({ breakdown }) {
  return (
    <div className="mt-3 space-y-2 text-xs">
      {PARTS.map(([key, label]) => (
        <div key={key}>
          <div className="tnum flex justify-between text-muted">
            <span>{label}, weighted {Math.round(breakdown[key].weight * 100)}%</span>
            <span>{breakdown[key].score} of 100 gives {breakdown[key].points} pts</span>
          </div>
          <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${breakdown[key].score}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Item({ h, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <Card as="div" className={`p-3 ${selected ? 'ring-2 ring-accent' : ''}`}>
        <button type="button" aria-expanded={open} className="w-full min-h-touch text-left" onClick={() => { onSelect(h.id); setOpen((o) => !o); }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink"><span className="tnum text-accent">{h.rank}.</span> {h.name}</p>
              <p className="tnum text-xs text-muted">
                {h.area}, {h.distanceKm} km away
                {h.eta && `, about ${Math.round(h.eta.durationMin)} min by road${h.eta.etaSource === 'estimate' ? ' (estimate)' : ''}`}
              </p>
            </div>
            <p className="tnum text-right"><span className="block text-xl font-semibold text-ink">{h.score}</span><span className="text-xs text-muted">match score</span></p>
          </div>
        </button>
        {open && (<><Breakdown breakdown={h.breakdown} /><CapabilityCard hospital={h} /></>)}
      </Card>
    </li>
  );
}

// Features 59 and 60: the top 3 are notified first, the rest are the alternatives used if one rejects or does not answer.
export default function RankingList({ results, selectedId, onSelect }) {
  const top = results.filter((r) => r.notifyFirst);
  const alternatives = results.filter((r) => !r.notifyFirst);

  if (!results.length) {
    return <Card><EmptyState icon="map-pin" title="No hospitals match">Try a larger radius or turn off some filters.</EmptyState></Card>;
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="notified-first">
        <h3 id="notified-first" className="font-title mb-2 text-lg font-semibold text-critical">Alerted first ({top.length})</h3>
        <ul className="space-y-2">{top.map((h) => <Item key={h.id} h={h} selected={h.id === selectedId} onSelect={onSelect} />)}</ul>
      </section>
      {alternatives.length > 0 && (
        <section aria-labelledby="alternatives">
          <h3 id="alternatives" className="font-title mb-1 text-lg font-semibold text-ink">Next in line</h3>
          <p className="mb-2 text-xs text-muted">These are alerted if a hospital says no or does not answer.</p>
          <ul className="space-y-2">{alternatives.map((h) => <Item key={h.id} h={h} selected={h.id === selectedId} onSelect={onSelect} />)}</ul>
        </section>
      )}
    </div>
  );
}
