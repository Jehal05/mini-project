// Pure capability logic (no database imports) so it is easy to unit test.

// `agg` holds live counts from the database: see hospitalRepo.getAggregates().
export function toCapability(hospital, agg = {}) {
  const a = {
    icuFree: 0, icuTotal: 0, ccuFree: 0, ccuTotal: 0, bedsFree: 0, bedsTotal: 0,
    cardiologists: 0, alsFree: 0, activeCases: 0,
    ...agg,
  };
  const occupiedRatio = a.bedsTotal > 0 ? (a.bedsTotal - a.bedsFree) / a.bedsTotal : 0;
  const cap = {
    cathLab: Boolean(hospital.capabilities?.cathLab),
    cardiologistsOnDuty: a.cardiologists,
    icuFree: a.icuFree,
    icuTotal: a.icuTotal,
    ccuFree: a.ccuFree,
    ccuTotal: a.ccuTotal,
    alsAmbulancesFree: a.alsFree,
    activeCases: a.activeCases,
    occupiedRatio: Math.round(occupiedRatio * 100) / 100,
  };
  cap.level = capabilityLevel(cap);
  return cap;
}

export function isCardiacCapable(cap) {
  return cap.cathLab || cap.cardiologistsOnDuty > 0 || cap.ccuFree > 0;
}

// full = cath lab + cardiologist + free CCU bed, partial = some of them, limited = none.
export function capabilityLevel(cap) {
  const n = Number(cap.cathLab) + Number(cap.cardiologistsOnDuty > 0) + Number(cap.ccuFree > 0);
  if (n === 3) return 'full';
  return n > 0 ? 'partial' : 'limited';
}

const has = (text, needle) => (text || '').toLowerCase().includes(needle.toLowerCase());

// Items look like { name, area, capability }.
export function applyFilters(items, f = {}) {
  return items.filter((item) => {
    const cap = item.capability;
    if (f.q && !(has(item.name, f.q) || has(item.area, f.q))) return false;
    if (f.area && !has(item.area, f.area)) return false;
    if (f.cathLab !== undefined && cap.cathLab !== f.cathLab) return false;
    if (f.cardiologist !== undefined && cap.cardiologistsOnDuty > 0 !== f.cardiologist) return false;
    if (f.minCcuBeds !== undefined && cap.ccuFree < f.minCcuBeds) return false;
    if (f.cardiacOnly && !isCardiacCapable(cap)) return false;
    return true;
  });
}
