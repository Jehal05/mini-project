// Feature 42: an automatic alert, with sound, when detection reaches Level 2 or Level 3. The banner is always shown (sound is
// never the only signal); the sound plays when the level RISES, only after the person has tapped the page once (browsers block
// it before), and can be muted on this device. The level comes from the live detection stream the dashboard already follows.
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from './kit.jsx';
import { playAlert, shouldBeep, soundPref, unlockAudio } from './alertSound.js';

const COPY = {
  2: { tone: 'high', badge: 'Level 2 Urgent', head: 'Urgent: your readings need attention.', body: 'Sit down and rest. If you feel unwell, press SOS or call 112.' },
  3: { tone: 'critical', badge: 'Level 3 Critical', head: 'Critical cardiac pattern detected.', body: 'Answer the question below. If you do not answer, help is sent automatically.' },
};

export function LevelAlert({ level = 0, message = '' }) {
  const [dismissed, setDismissed] = useState(0);
  const [soundOn, setSoundOn] = useState(() => soundPref.get());
  const [needsTap, setNeedsTap] = useState(false);
  const prev = useRef(null); // null until the first level is known, so opening the page never beeps
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    const before = prev.current;
    prev.current = level;
    if (before === null) return; // the first value is a snapshot, not a rise
    if (shouldBeep(before, level, true)) {
      setDismissed(0);
      if (soundRef.current) setNeedsTap(!playAlert(level));
      // Browsers refuse to vibrate until the person has touched the page, and log a console error if asked.
      if (level >= 3 && globalThis.navigator?.userActivation?.hasBeenActive) globalThis.navigator.vibrate?.([200, 100, 200]);
    }
  }, [level]);

  useEffect(() => {
    const unlock = () => { unlockAudio(); setNeedsTap(false); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next); soundPref.set(next);
    if (next) unlockAudio();
  }

  const copy = COPY[level];
  const show = copy && dismissed !== level;
  return (
    <div>
      <div className="flex justify-end">
        <button type="button" onClick={toggleSound} aria-pressed={soundOn} className="text-xs text-muted underline">Alert sound: {soundOn ? 'On' : 'Off'}</button>
      </div>
      {show && (
        <Card status={copy.tone} className="mt-2" role="alert" aria-label="Automatic alert">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge tone={copy.tone}>{copy.badge}</Badge>
              <p className="mt-2 text-lg font-semibold">{copy.head}</p>
              <p className="mt-1 text-sm">{copy.body}</p>
              {message && <p className="mt-1 text-xs text-muted">Why: {message}</p>}
              {soundOn && needsTap && <p className="mt-1 text-xs text-muted">Tap anywhere on the page to switch the alert sound on.</p>}
            </div>
            {level === 2 && <Button variant="secondary" size="sm" onClick={() => setDismissed(level)}>Dismiss</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}
