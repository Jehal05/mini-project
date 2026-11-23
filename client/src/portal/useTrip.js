import { useCallback, useEffect, useState } from 'react';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';

// Keeps one trip current. `load()` returns the trip (or null). Position events update the marker and ETA
// without another request; status events reload the full trip so stage times and legs stay right.
export function useTrip(caseId, load) {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!caseId && !load) return;
    try {
      setTrip(await load());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [caseId, load]);

  useEffect(() => {
    if (!caseId) { setTrip(null); return undefined; }
    reload();
    const socket = getSocket();
    const leave = joinRoom('case', caseId);
    const onPosition = (p) => {
      if (p.caseId !== caseId) return;
      setTrip((t) =>
        t && {
          ...t,
          stage: p.stage,
          position: p.position,
          atDestination: p.atDestination,
          remainingKm: p.remainingKm,
          etaMinutes: p.etaMinutes,
          etaHospitalMinutes: p.etaHospitalMinutes,
          activeLeg: p.leg === 'to_hospital' ? 1 : 0,
        },
      );
    };
    const onStatus = (p) => { if (p.caseId === caseId) reload(); };
    socket.on(EVENTS.AMBULANCE_POSITION, onPosition);
    socket.on(EVENTS.AMBULANCE_STATUS, onStatus);
    socket.on(EVENTS.EMERGENCY_ARRIVED, onStatus);
    socket.on('connect', reload);
    return () => {
      socket.off(EVENTS.AMBULANCE_POSITION, onPosition);
      socket.off(EVENTS.AMBULANCE_STATUS, onStatus);
      socket.off(EVENTS.EMERGENCY_ARRIVED, onStatus);
      socket.off('connect', reload);
      leave();
    };
  }, [caseId, reload]);

  return { trip, error, reload };
}
