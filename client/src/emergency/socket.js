import { getSocket, joinRoom } from '../lib/socket.js';
import { EMERGENCY_EVENTS } from './constants.js';

/** Hears this patient's emergency events (room patient:<id>). `handler(payload)` runs for each. Returns a function that stops. */
export function followEmergency(patientId, handler, onReconnect) {
  const s = getSocket();
  const leave = joinRoom('patient', patientId);
  const names = Object.values(EMERGENCY_EVENTS);
  const on = (p) => { if (String(p?.patientId) === String(patientId)) handler(p); };
  names.forEach((n) => s.on(n, on));
  // Events sent while the connection was down are gone: the caller reads the case again when it comes back.
  if (onReconnect) s.on('connect', onReconnect);
  return () => { names.forEach((n) => s.off(n, on)); if (onReconnect) s.off('connect', onReconnect); leave(); };
}
