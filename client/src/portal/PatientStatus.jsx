import { useEffect, useState } from 'react';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';

// Feature 67: what the patient (or family) sees. Joins the patient room and shows live status.
export default function PatientStatus() {
  const [patientId, setPatientId] = useState(() => localStorage.getItem('ht.demoPatientId') || '');
  const [status, setStatus] = useState({ kind: 'waiting', text: 'Waiting for a hospital to respond…' });

  useEffect(() => {
    if (!patientId) return undefined;
    const socket = getSocket();
    const leave = joinRoom('patient', patientId);
    const onAccepted = (p) => setStatus({ kind: 'accepted', text: p.message });
    const onRejected = (p) =>
      setStatus(
        p.allHospitalsBusy
          ? { kind: 'busy', text: p.message }
          : { kind: 'waiting', text: 'A hospital could not take your case. Contacting the next one…' },
      );
    socket.on(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
    socket.on(EVENTS.EMERGENCY_REJECTED, onRejected);
    return () => {
      socket.off(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
      socket.off(EVENTS.EMERGENCY_REJECTED, onRejected);
      leave();
    };
  }, [patientId]);

  const colors = { waiting: 'bg-amber-100 text-amber-900', accepted: 'bg-green-100 text-green-900', busy: 'bg-red-100 text-red-900' };

  return (
    <div className="mx-auto mt-6 max-w-lg space-y-3 rounded-lg bg-white p-4 shadow">
      <h2 className="text-lg font-bold">Emergency status</h2>
      <label className="block text-sm">
        Patient id (filled in by the demo emergency)
        <input className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" value={patientId} onChange={(e) => setPatientId(e.target.value.trim())} />
      </label>
      {patientId && (
        <div role="status" className={`rounded p-3 font-medium ${colors[status.kind]}`}>{status.text}</div>
      )}
      <div className="flex gap-2">
        <a href="tel:112" className="rounded bg-red-700 px-3 py-1 font-bold text-white">Call 112</a>
        <a href="tel:108" className="rounded bg-red-700 px-3 py-1 font-bold text-white">Call 108</a>
      </div>
    </div>
  );
}
