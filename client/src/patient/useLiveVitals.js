import { useEffect, useReducer, useState } from 'react';
import { EMPTY_LIVE, applyVitals } from '../lib/liveVitals.js';
import { followVitals } from '../lib/monitorSocket.js';
import useSimulatedVitals from './useSimulatedVitals.js';

// Readings for the patient's home. A signed-in patient follows the server's simulator. Otherwise (demo mode, or the server
// is not streaming) a labelled browser stand-in is used. `source` says which, and the screen shows it.
export default function useLiveVitals({ patientId, mode = 'calm' }) {
  const fallback = useSimulatedVitals(mode);
  const [live, push] = useReducer(applyVitals, EMPTY_LIVE);
  const [link, setLink] = useState(patientId ? 'connecting' : 'none');
  const [detection, setDetection] = useState(null);

  useEffect(() => {
    if (!patientId) { setLink('none'); return undefined; }
    return followVitals(patientId, { status: setLink, vitals: push, detection: setDetection });
  }, [patientId]);

  const streaming = link === 'server' && live.bpm != null;
  const source = streaming ? 'server' : link === 'connecting' ? 'connecting' : 'browser';
  return streaming
    ? { source, bpm: live.bpm, history: live.history, vitals: live.vitals, statuses: live.statuses, scenario: live.scenario, detection }
    : { source, bpm: fallback.bpm, history: fallback.history, vitals: null, statuses: {}, scenario: null, detection };
}
