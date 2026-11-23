import { useEffect, useState } from 'react';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { fetchPublicTrip } from '../lib/crewApi.js';
import { formatEta } from '../lib/stages.js';
import PatientStepper from '../patient/PatientStepper.jsx';
import { PATIENT_STEPS, patientStep } from '../lib/patientStages.js';
import Icon from '../ui/icons.jsx';
import { Card, Panel } from '../ui/Surface.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import TrackingMap from './TrackingMap.jsx';
import HeartDashboard from '../patient/HeartDashboard.jsx';

// Feature 67: what the patient (or family) sees. Joins the patient room and shows live status.
export default function PatientStatus({ account = null }) {
  const [storedId, setPatientId] = useState(() => localStorage.getItem('ht.demoPatientId') || '');
  const patientId = account ? account.patientId || '' : storedId;
  const [status, setStatus] = useState({ kind: 'waiting', text: 'Waiting for a hospital to respond…' });
  const [trip, setTrip] = useState(null);

  useEffect(() => {
    if (!patientId) return undefined;
    const socket = getSocket();
    const leave = joinRoom('patient', patientId);
    const loadTrip = (caseId) => fetchPublicTrip(caseId).then((t) => t && setTrip(t)).catch(() => {});
    const onAccepted = (p) => { setStatus({ kind: 'accepted', text: p.message }); loadTrip(p.caseId); };
    // Position updates for this patient's ambulance arrive in the patient room.
    const onPosition = (p) => setTrip((t) => (t ? { ...t, stage: p.stage, position: p.position, remainingKm: p.remainingKm, etaMinutes: p.etaMinutes, etaHospitalMinutes: p.etaHospitalMinutes, activeLeg: p.leg === 'to_hospital' ? 1 : 0 } : t));
    const onTripStatus = (p) => { setStatus({ kind: 'accepted', text: p.message }); loadTrip(p.caseId); };
    const onRejected = (p) =>
      setStatus(
        p.allHospitalsBusy
          ? { kind: 'busy', text: p.message }
          : { kind: 'waiting', text: 'A hospital could not take your case. Contacting the next one…' },
      );
    socket.on(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
    socket.on(EVENTS.EMERGENCY_REJECTED, onRejected);
    socket.on(EVENTS.AMBULANCE_POSITION, onPosition);
    socket.on(EVENTS.AMBULANCE_STATUS, onTripStatus);
    socket.on(EVENTS.EMERGENCY_ARRIVED, onTripStatus);
    return () => {
      socket.off(EVENTS.AMBULANCE_POSITION, onPosition);
      socket.off(EVENTS.AMBULANCE_STATUS, onTripStatus);
      socket.off(EVENTS.EMERGENCY_ARRIVED, onTripStatus);
      socket.off(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
      socket.off(EVENTS.EMERGENCY_REJECTED, onRejected);
      leave();
    };
  }, [patientId]);

  const step = patientStep({ caseStatus: status.kind === 'accepted' ? 'accepted' : 'pending', tripStage: trip?.stage });
  const say = status.kind === 'busy' ? status.text : status.kind === 'accepted' && status.text ? status.text : PATIENT_STEPS[step].say;
  const done = trip?.stage === 'at_hospital';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <HeartDashboard mode={status.kind === 'accepted' ? 'emergency' : 'calm'} signedIn={Boolean(account)} />
      {!patientId ? (
        <Card><EmptyState icon="heart-pulse" title="No emergency in progress">
          When an alert is raised for you, its progress shows here. For this demo, ask the hospital screen to create a demo emergency.
        </EmptyState></Card>
      ) : (
        <>
          <Card className={`p-5 ${status.kind === 'busy' ? 'border-critical bg-critical-soft' : ''}`}>
            <p role="status" aria-live="polite" className="font-title text-2xl leading-snug text-ink sm:text-3xl">{say}</p>
            {trip && !done && (
              <p className="tnum mt-4 flex items-baseline gap-2 text-ink">
                <span className="text-4xl font-semibold text-accent">{formatEta(trip.etaMinutes)}</span>
                <span className="text-sm text-muted">until the ambulance reaches {trip.activeLeg === 1 ? 'the hospital' : 'you'}</span>
              </p>
            )}
            {trip && <p className="mt-1 text-sm text-muted">Ambulance {trip.ambulance?.vehicleNumber}{done ? ' has reached the hospital' : ''}</p>}
          </Card>

          <Panel title="Where things stand"><PatientStepper step={step} /></Panel>

          {trip && <Panel title="Ambulance on the map"><TrackingMap trip={trip} /></Panel>}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href="tel:112" className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-ui bg-critical px-4 text-lg font-bold text-white"><Icon name="phone" size={20} />Call 112</a>
        <a href="tel:108" className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-ui bg-critical px-4 text-lg font-bold text-white"><Icon name="phone" size={20} />Call 108</a>
      </div>

      {!account && <details className="rounded-ui border border-line bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-muted">Demo details</summary>
        <label className="mt-2 block text-muted">Patient id (filled in by the demo emergency)
          <input className="mt-1 min-h-touch w-full rounded-ui border border-line bg-surface px-2 text-xs text-ink" value={patientId} onChange={(e) => setPatientId(e.target.value.trim())} />
        </label>
      </details>}
    </div>
  );
}
