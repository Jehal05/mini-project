// The hospital search the SOS flow calls when a case is sent and again at every wider round (Daksh's `discovery` hook).
// Round 1 ranks and alerts the nearest cardiac-capable hospitals within 10 km. Rounds 2 and 3 look again within 20 and 30 km
// and alert up to 3 hospitals that have not been tried. All the accept, reject and no-answer rules stay in Phase 9.
import { notifyHospitals, widenSearch } from '../services/notifications.js';

export function createDiscovery() {
  return {
    async notify({ caseId, round, radiusKm }) {
      return round <= 1 ? notifyHospitals(caseId, { radiusKm }) : widenSearch(caseId, { radiusKm });
    },
  };
}
