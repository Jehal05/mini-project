import { useEffect, useRef, useState } from 'react';
import { nextHeartRate, rrInterval, seedHistory, signalQuality } from '../lib/vitalsSim.js';

// Browser-made readings, SIMULATED. Every screen that shows them says so. Replaced by the real stream when server monitoring lands.
// Updates every 2 s, and stops while the tab is hidden.
export default function useSimulatedVitals(mode = 'calm') {
  const [state, setState] = useState(() => { const history = seedHistory(); return { bpm: history[history.length - 1], history, quality: 98 }; });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      setState((s) => {
        const bpm = nextHeartRate(s.bpm, modeRef.current);
        return { bpm, history: [...s.history.slice(-23), bpm], quality: signalQuality(bpm) };
      });
    };
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);
  return { ...state, rr: rrInterval(state.bpm) };
}
