import { io } from 'socket.io-client';
import { getToken } from './session.js';

// Follows one patient's live readings. The sign-in token goes in the handshake (read again on every reconnect), and the server
// only lets a patient follow themselves. Returns a function that stops following. `on.status` gets 'connecting' | 'server' | 'failed'.
export function followVitals(patientId, on) {
  const socket = io({ transports: ['websocket', 'polling'], auth: (cb) => cb({ token: getToken() }) });
  const subscribe = () => socket.emit('vitals:subscribe', { patientId }, (ack) => on.status(ack?.ok ? 'server' : 'failed', ack?.snapshot));
  on.status('connecting');
  socket.on('connect', subscribe);
  socket.on('connect_error', () => on.status('failed'));
  socket.on('vitals:update', (m) => { if (String(m?.patientId) === String(patientId)) on.vitals(m); });
  socket.on('detection:update', (d) => { if (String(d?.patientId) === String(patientId)) on.detection(d); });
  socket.on('detection:cleared', (d) => { if (String(d?.patientId) === String(patientId)) on.detection(null); });
  return () => { socket.emit('vitals:unsubscribe', { patientId }); socket.close(); };
}
