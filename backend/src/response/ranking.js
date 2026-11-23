// Feature 59: hospital ranking. Score out of 100 = distance (40) + capability (40) + current load (20).
// The breakdown is returned with every score so the screen can show why a hospital is where it is.

export const DISTANCE_REF_KM = 30 // distance points reach zero at the widest search radius, so scores compare across rounds

export function rankScore({ distanceKm, cap }) {
  const distance = Math.round(40 * Math.max(0, 1 - distanceKm / DISTANCE_REF_KM))
  const capability = (cap.cathLab ? 15 : 0) + (cap.cardiologistOnDuty ? 10 : 0) + (cap.freeCcu > 0 ? 10 : 0) + (cap.alsFree > 0 ? 5 : 0)
  const load = Math.round(20 * (1 - Math.min(1, (cap.openCases ?? 0) / 3)))
  return { score: distance + capability + load, breakdown: { distance, capability, load } }
}

/** Feature 57: the cardiac-care filter. A hospital passes with a cath lab, a cardiologist on duty or a free CCU bed. */
export const isCardiacCapable = (cap) => Boolean(cap.cathLab || cap.cardiologistOnDuty || cap.freeCcu > 0)
