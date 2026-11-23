// Pure fleet logic: nearest-ambulance choice (feature 73) and availability counts (feature 72).
import { haversineKm, round } from './geo.js';

// Free = available and not reserved for a case. ALS first (nearest first), then BLS (nearest first).
// BLS only comes up when no ALS is free, because every ALS sorts ahead of every BLS.
export function rankAmbulances(free, point) {
  const withDistance = free.map((a) => {
    const [lng, lat] = a.location?.coordinates || [0, 0];
    return { ...a, distanceKm: round(haversineKm(point, { lat, lng })) };
  });
  const byDistance = (a, b) => a.distanceKm - b.distanceKm || String(a.vehicleNumber).localeCompare(String(b.vehicleNumber));
  return [
    ...withDistance.filter((a) => a.type === 'ALS').sort(byDistance),
    ...withDistance.filter((a) => a.type !== 'ALS').sort(byDistance),
  ];
}

export const chooseAmbulance = (free, point) => rankAmbulances(free, point)[0] ?? null;

export const isFree = (a) => a.status === 'available' && !a.currentCase;

export function summarizeFleet(ambulances) {
  const byStatus = { available: 0, reserved: 0, dispatched: 0, on_trip: 0, maintenance: 0 };
  const byType = { ALS: { total: 0, available: 0 }, BLS: { total: 0, available: 0 } };
  for (const a of ambulances) {
    if (a.status === 'available' && a.currentCase) byStatus.reserved += 1;
    else byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const t = byType[a.type] || (byType[a.type] = { total: 0, available: 0 });
    t.total += 1;
    if (isFree(a)) t.available += 1;
  }
  return { total: ambulances.length, byStatus, byType };
}
