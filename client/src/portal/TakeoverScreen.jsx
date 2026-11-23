import { useEffect, useRef, useState } from 'react';
import { startAlarm, stopAlarm } from '../lib/alarm.js';
import Countdown from './Countdown.jsx';
import Vitals from './Vitals.jsx';
import Button from '../ui/Button.jsx';
import { Select } from '../ui/Form.jsx';
import Icon from '../ui/icons.jsx';

const REASONS = [
  ['no_beds', 'No beds'],
  ['no_cardiologist', 'No cardiologist'],
  ['cath_lab_busy', 'Cath lab busy'],
  ['other', 'Other'],
];

// Feature 103: a critical case fills the screen in red, with an alarm, until staff accept, reject or acknowledge.
// The pulse is a CSS animation that stops under prefers-reduced-motion; the alarm sound can be muted.
export default function TakeoverScreen({ caseData, busy, error, onAccept, onReject, onAcknowledge }) {
  const [muted, setMuted] = useState(false);
  const [reason, setReason] = useState('no_beds');
  const accept = useRef(null);

  useEffect(() => {
    if (muted) stopAlarm();
    else startAlarm();
    return stopAlarm;
  }, [muted, caseData.id]);
  useEffect(() => { accept.current?.focus(); }, [caseData.id]);

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="takeover-title" className="alarm-pulse fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[rgb(179_38_30)] p-6 text-white">
      <p className="flex items-center gap-2 text-lg font-semibold"><Icon name="octagon-alert" size={24} />Critical cardiac emergency</p>
      <h2 id="takeover-title" className="font-title mt-2 text-center text-4xl font-semibold sm:text-5xl">{caseData.patient?.fullName || 'Patient'}</h2>
      <p className="tnum mt-1 text-lg">Risk score {caseData.riskScore ?? 'not available'}. Respond within <Countdown respondBy={caseData.respondBy} /></p>

      <div data-theme="light" className="mt-6 w-full max-w-xl rounded-ui bg-surface p-4 text-ink"><Vitals vitals={caseData.latestVitals} showNote={false} /></div>

      {error && <p role="alert" className="mt-3 rounded-ui bg-white px-3 py-2 text-sm font-semibold text-[rgb(179_38_30)]">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button ref={accept} type="button" disabled={busy} onClick={onAccept} className="min-h-[3.5rem] rounded-ui bg-white px-8 text-lg font-bold text-[rgb(179_38_30)] disabled:opacity-60">Accept emergency</button>
        <div className="flex items-center gap-2">
          <div data-theme="light"><Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for rejecting">
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select></div>
          <button type="button" disabled={busy} onClick={() => onReject(reason)} className="min-h-[3.5rem] rounded-ui border-2 border-white px-5 font-bold disabled:opacity-60">Reject</button>
        </div>
        <button type="button" onClick={onAcknowledge} className="min-h-[3.5rem] rounded-ui bg-black/30 px-5 font-semibold">Acknowledge and keep in queue</button>
        <button type="button" onClick={() => setMuted((m) => !m)} aria-pressed={muted} className="min-h-[3.5rem] rounded-ui bg-black/30 px-5 font-semibold">{muted ? 'Unmute alarm' : 'Mute alarm'}</button>
      </div>

      <p className="mt-6 text-xs">Simulated data for demonstration. Not a medical device.</p>
      <div className="mt-2 flex gap-2">
        <a href="tel:112" className="inline-flex min-h-touch items-center rounded-ui bg-white px-4 font-bold text-[rgb(179_38_30)]">Call 112</a>
        <a href="tel:108" className="inline-flex min-h-touch items-center rounded-ui bg-white px-4 font-bold text-[rgb(179_38_30)]">Call 108</a>
      </div>
    </div>
  );
}
