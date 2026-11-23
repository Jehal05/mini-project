// Where an auto-detected case is placed. The simulated patients have no GPS yet (the SOS phase adds the real location),
// so the case starts at a fixed demo point (Pune) that can be changed with SIM_CASE_LAT and SIM_CASE_LNG.
export const LIVE_STATUSES = Object.freeze(['pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived']);

export function simCaseLocation(env = process.env) {
  const lat = Number(env.SIM_CASE_LAT);
  const lng = Number(env.SIM_CASE_LNG);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : [73.8567, 18.5204];
}
