// Pure helpers that shape a case for the Hospital Portal (features 62, 64, 105).
import { computeGoldenHour } from './goldenHour.js';
export { severityRank } from './priority.js';

export const PREP_ITEMS = ['edBayReady', 'cathLabTeamAlerted', 'ccuBedReserved', 'ecgReady'];

export function normalizePreparation(prep = {}) {
  return Object.fromEntries(
    PREP_ITEMS.map((k) => [k, { done: Boolean(prep?.[k]?.done), at: prep?.[k]?.at ? new Date(prep[k].at).toISOString() : null }]),
  );
}

export function serializeCase(c, { hospitalId, patient, latestVitals, timeoutMs, now = Date.now() } = {}) {
  const mine = (c.notifiedHospitals || []).find((n) => String(n.hospital) === String(hospitalId));
  const respondBy =
    mine && c.status === 'pending' ? new Date(new Date(mine.notifiedAt).getTime() + timeoutMs).toISOString() : null;

  return {
    id: String(c._id),
    status: c.status,
    severity: c.severity,
    riskScore: c.riskScore ?? null,
    patient: { id: String(c.patient), fullName: patient?.fullName ?? null },
    location: c.location?.coordinates ? { lat: c.location.coordinates[1], lng: c.location.coordinates[0] } : null,
    detectedAt: c.detectedAt ? new Date(c.detectedAt).toISOString() : null,
    alertedAt: c.alertedAt ? new Date(c.alertedAt).toISOString() : null,
    acceptedAt: c.acceptedAt ? new Date(c.acceptedAt).toISOString() : null,
    acceptedBy: c.hospital ? String(c.hospital) : null,
    doctor: c.doctor ? String(c.doctor) : null,
    ambulance: c.ambulance ? String(c.ambulance) : null,
    allHospitalsBusy: Boolean(c.allHospitalsBusy),
    respondBy,
    latestVitals: latestVitals
      ? {
          heartRate: latestVitals.heartRate,
          systolic: latestVitals.systolic,
          diastolic: latestVitals.diastolic,
          spo2: latestVitals.spo2,
          temperature: latestVitals.temperature,
          respiratoryRate: latestVitals.respiratoryRate,
          recordedAt: latestVitals.recordedAt ? new Date(latestVitals.recordedAt).toISOString() : null,
        }
      : null,
    preparation: normalizePreparation(c.preparation),
    goldenHour: computeGoldenHour(c, now),
    notice: 'Simulated data for demonstration. Not a medical device.',
  };
}
