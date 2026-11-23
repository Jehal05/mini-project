import HeartHero from './HeartHero.jsx';
import Button from './Button.jsx';
import { LOGIN_PORTALS } from '../lib/authHeaders.js';

const STEPS = [
  ['Watch', 'A simulated heart monitor notices a dangerous change, or the patient presses SOS.'],
  ['Alert', 'The nearest hospitals with a cath lab are asked, closest first, until one accepts.'],
  ['Respond', 'An ambulance is assigned and tracked to the door while the hospital prepares.'],
];

// The first page. Pick who you are; the sign-in page follows.
export default function Landing({ onChoose }) {
  return (
    <div className="paper-bg min-h-screen text-ink">
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2 md:items-center md:py-16">
        <div className="space-y-5">
          <h1 className="font-title text-4xl font-semibold leading-tight md:text-5xl">Faster help when a heart emergency starts.</h1>
          <p className="max-w-prose text-lg text-muted">HealthTwin AI links a patient, the hospitals around them and an ambulance, so the first minutes are not lost to phone calls.</p>
          <div>
            <p className="mb-2 text-sm font-semibold">Sign in as</p>
            <div className="flex flex-wrap gap-2">
              {LOGIN_PORTALS.map((p, i) => <Button key={p.id} size="lg" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => onChoose(p.id)}>{p.label}</Button>)}
            </div>
          </div>
        </div>
        <HeartHero bpm={72} className="mx-auto aspect-square w-full max-w-sm" />
      </main>
      <section aria-label="How it works" className="mx-auto max-w-5xl px-4 pb-10">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-ui border border-line bg-surface p-4">
              <p className="font-title text-lg font-semibold"><span aria-hidden="true" className="mr-2 text-accent">{i + 1}</span>{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <footer className="px-4 pb-8 text-center text-xs text-muted">Simulated data for demonstration. Not a medical device.</footer>
    </div>
  );
}
