// Pure hospital ranking logic (features 57, 59, 60): suitability rules, a transparent 0-100 score, and top/alternative lists.
// No database access here, so every rule can be unit-tested directly.
import { RANKING_WEIGHTS, RANKING_CAPS, TOP_N, RADIUS_STEPS } from '../config/ranking.js';

const round1 = (n) => Math.round(n * 10) / 10;
const count = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export function weightsTotal(weights = RANKING_WEIGHTS) {
  return Object.values(weights).reduce((sum, w) => sum + w, 0);
}

// Feature 57: can this hospital take a cardiac emergency right now?
export function assessSuitability(hospital) {
  const c = hospital.capabilities || {};
  const reasons = [];
  const warnings = [];

  if (!c.cathLab && !c.cardiologistOnDuty) {
    reasons.push('No cardiac care (no cath lab and no cardiologist on duty)');
  }
  if (count(c.ccuBedsFree) + count(c.icuBedsFree) === 0) {
    reasons.push('No critical-care beds free');
  }

  if (!c.cathLab && c.cardiologistOnDuty) warnings.push('No cath lab — may need transfer');
  if (c.cathLab && !c.cardiologistOnDuty) warnings.push('No cardiologist on duty');
  if (count(c.ccuBedsFree) === 0 && count(c.icuBedsFree) > 0) warnings.push('CCU full — ICU bed only');
  if (count(c.alsAmbulances) === 0) warnings.push('No ALS ambulance');

  return { suitable: reasons.length === 0, reasons, warnings };
}

// Feature 59: transparent score out of 100, one row per factor.
export function scoreHospital(hospital, distanceKm, radiusKm, weights = RANKING_WEIGHTS, caps = RANKING_CAPS) {
  const c = hospital.capabilities || {};
  const ccu = count(c.ccuBedsFree);
  const icu = count(c.icuBedsFree);
  const als = count(c.alsAmbulances);

  const breakdown = [
    {
      factor: 'distance',
      label: 'Distance',
      points: round1(weights.distance * Math.max(0, 1 - distanceKm / radiusKm)),
      max: weights.distance,
      detail: `${distanceKm.toFixed(1)} km of ${radiusKm} km`,
    },
    {
      factor: 'cathLab',
      label: 'Cath lab',
      points: c.cathLab ? weights.cathLab : 0,
      max: weights.cathLab,
      detail: c.cathLab ? 'Cath lab available' : 'No cath lab',
    },
    {
      factor: 'cardiologistOnDuty',
      label: 'Cardiologist',
      points: c.cardiologistOnDuty ? weights.cardiologistOnDuty : 0,
      max: weights.cardiologistOnDuty,
      detail: c.cardiologistOnDuty ? 'Cardiologist on duty' : 'No cardiologist on duty',
    },
    {
      factor: 'ccuBeds',
      label: 'CCU beds',
      points: round1((weights.ccuBeds * Math.min(ccu, caps.ccuBedsCap)) / caps.ccuBedsCap),
      max: weights.ccuBeds,
      detail: `${ccu} of ${caps.ccuBedsCap}+ CCU beds free`,
    },
    {
      factor: 'icuBeds',
      label: 'ICU beds',
      points: round1((weights.icuBeds * Math.min(icu, caps.icuBedsCap)) / caps.icuBedsCap),
      max: weights.icuBeds,
      detail: `${icu} of ${caps.icuBedsCap}+ ICU beds free`,
    },
    {
      factor: 'alsAmbulances',
      label: 'ALS ambulances',
      points: round1((weights.alsAmbulances * Math.min(als, caps.alsCap)) / caps.alsCap),
      max: weights.alsAmbulances,
      detail: `${als} of ${caps.alsCap}+ ALS ambulances`,
    },
  ];

  // The total is the sum of the rounded rows, so the breakdown always adds up exactly.
  const total = round1(breakdown.reduce((sum, row) => sum + row.points, 0));
  return { total, breakdown };
}

// Features 59-60: split candidates into top N, alternatives, not suitable and excluded.
// `hospitals` must each carry distanceKm. Ties are broken by shorter distance.
export function rankHospitals(hospitals, radiusKm, weights = RANKING_WEIGHTS, options = {}) {
  const { caps = RANKING_CAPS, topN = TOP_N, exclude = [] } = options;
  const excludeSet = new Set(exclude.map(String));

  const suitable = [];
  const notSuitable = [];
  const excluded = [];

  for (const hospital of hospitals) {
    if (excludeSet.has(String(hospital._id))) {
      excluded.push(hospital);
      continue;
    }
    const { suitable: ok, reasons, warnings } = assessSuitability(hospital);
    if (!ok) {
      notSuitable.push({ hospital, reasons });
      continue;
    }
    suitable.push({
      hospital,
      score: scoreHospital(hospital, hospital.distanceKm, radiusKm, weights, caps),
      warnings,
    });
  }

  suitable.sort(
    (a, b) => b.score.total - a.score.total || a.hospital.distanceKm - b.hospital.distanceKm
  );
  const ranked = suitable.map((item, i) => ({ rank: i + 1, ...item }));
  notSuitable.sort((a, b) => a.hospital.distanceKm - b.hospital.distanceKm);

  return {
    top: ranked.slice(0, topN),
    alternatives: ranked.slice(topN),
    notSuitable,
    excluded,
  };
}

// Next wider radius to try when fewer than TOP_N suitable hospitals are found.
export function nextRadius(radiusKm, steps = RADIUS_STEPS) {
  return steps.find((step) => step > radiusKm) ?? null;
}
