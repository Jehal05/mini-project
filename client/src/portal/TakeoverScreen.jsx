import { useEffect, useState } from 'react';
import { startAlarm, stopAlarm } from '../lib/alarm.js';
import Countdown from './Countdown.jsx';
import Vitals from './Vitals.jsx';

const REASONS = [
  ['no_beds', 'No beds'],
  ['no_cardiologist', 'No cardiologist'],
  ['cath_lab_busy', 'Cath lab busy'],
  ['other', 'Other'],
];
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Feature 103: a critical case fills the screen in red, with an alarm, until staff accept, reject or acknowledge.
export default function TakeoverScreen({ caseData, busy, error, onAccept, onReject, onAcknowledge }) {
  const [muted, setMuted] = useState(false);
  const [reason, setReason] = useState('no_beds');
  const calm = prefersReducedMotion();

  useEffect(() => {
    if (muted) stopAlarm();
    else startAlarm();
    return stopAlarm;
  }, [muted, caseData.id]);

  return (
    <div role="alertdialog" aria-label="Critical emergency" className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-700 p-6 text-white ${calm ? '' : 'animate-pulse'}`}>
      <p className="text-sm font-semibold uppercase tracking-widest">Critical cardiac emergency</p>
      <h2 className="mt-2 text-4xl font-extrabold">{caseData.patient?.fullName || 'Patient'}</h2>
      <p className="mt-1 text-lg">Risk score {caseData.riskScore ?? '–'} · respond within <Countdown respondBy={caseData.respondBy} /></p>

      <div className="mt-6 w-full max-w-xl rounded-lg bg-white p-4 text-slate-900">
        <Vitals vitals={caseData.latestVitals} />
      </div>

      {error && <p className="mt-3 rounded bg-white px-3 py-1 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button disabled={busy} onClick={onAccept} className="rounded bg-white px-6 py-3 text-lg font-bold text-red-700 disabled:opacity-60">Accept</button>
        <div className="flex items-center gap-2">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded px-2 py-3 text-slate-900" aria-label="Rejection reason">
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button disabled={busy} onClick={() => onReject(reason)} className="rounded border-2 border-white px-4 py-3 font-bold disabled:opacity-60">Reject</button>
        </div>
        <button onClick={onAcknowledge} className="rounded bg-red-900 px-4 py-3 font-semibold">Acknowledge (keep in queue)</button>
        <button onClick={() => setMuted((m) => !m)} className="rounded bg-red-900 px-4 py-3 font-semibold">{muted ? 'Unmute alarm' : 'Mute alarm'}</button>
      </div>

      <p className="mt-6 text-xs">Simulated data for demonstration. Not a medical device.</p>
      <div className="mt-2 flex gap-2">
        <a href="tel:112" className="rounded bg-white px-3 py-1 text-sm font-bold text-red-700">Call 112</a>
        <a href="tel:108" className="rounded bg-white px-3 py-1 text-sm font-bold text-red-700">Call 108</a>
      </div>
    </div>
  );
}
