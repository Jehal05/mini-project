// Hospital ranking (feature 59): score = weighted distance + capability + current load.
// Every part is 0-100 (higher is better). All tuning lives in this one config object.
export const RANKING_CONFIG = Object.freeze({
  weights: { distance: 0.5, capability: 0.3, load: 0.2 },
  distanceHorizonKm: 15, // at or beyond this distance the distance score is 0
  capabilityPoints: { cathLab: 35, cardiologist: 25, ccuBed: 20, icuBed: 10, alsAmbulance: 10 },
  load: { activeCasesCap: 5, activeCasesShare: 0.6, occupiedShare: 0.4 },
  notifyFirstCount: 3,
});

const r2 = (n) => Math.round(n * 100) / 100;

// item: { distanceKm, capability } (capability as built by capability.toCapability)
export function scoreHospital(item, config = RANKING_CONFIG) {
  const { weights, distanceHorizonKm, capabilityPoints: p, load } = config;
  const cap = item.capability;

  const distanceScore = Math.max(0, 1 - item.distanceKm / distanceHorizonKm) * 100;

  const capabilityScore =
    (cap.cathLab ? p.cathLab : 0) +
    (cap.cardiologistsOnDuty > 0 ? p.cardiologist : 0) +
    (cap.ccuFree > 0 ? p.ccuBed : 0) +
    (cap.icuFree > 0 ? p.icuBed : 0) +
    (cap.alsAmbulancesFree > 0 ? p.alsAmbulance : 0);

  const casePressure = Math.min(1, cap.activeCases / load.activeCasesCap);
  const loadPressure = load.activeCasesShare * casePressure + load.occupiedShare * cap.occupiedRatio;
  const loadScore = (1 - Math.min(1, loadPressure)) * 100;

  const parts = {
    distance: { score: r2(distanceScore), weight: weights.distance },
    capability: { score: r2(capabilityScore), weight: weights.capability },
    load: { score: r2(loadScore), weight: weights.load },
  };
  for (const part of Object.values(parts)) part.points = r2(part.score * part.weight);

  const total = r2(parts.distance.points + parts.capability.points + parts.load.points);
  return { total, breakdown: parts };
}

// Returns a new array, best first. Ties: closer hospital first, then name, then id (stable and deterministic).
export function rankHospitals(items, config = RANKING_CONFIG) {
  const scored = items.map((item) => {
    const { total, breakdown } = scoreHospital(item, config);
    return { ...item, score: total, breakdown };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.distanceKm - b.distanceKm ||
      String(a.name).localeCompare(String(b.name)) ||
      String(a.id).localeCompare(String(b.id)),
  );

  return scored.map((item, i) => ({ ...item, rank: i + 1, notifyFirst: i < config.notifyFirstCount }));
}
