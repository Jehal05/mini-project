// Feature 96: summary for the admin dashboard.
import * as repo from './analyticsRepo.js';
import { buildMetrics, parseRange, parseTzOffset } from './analyticsMetrics.js';
import { httpError } from '../utils/httpError.js';
import { isObjectId } from '../utils/ids.js';

export async function getSummary(query = {}, now = Date.now()) {
  const range = parseRange(query, now);
  const tzOffsetMin = parseTzOffset(query.tzOffsetMinutes);
  const hospitalId = query.hospitalId || undefined;
  if (hospitalId && !isObjectId(hospitalId)) throw httpError(400, 'hospitalId must be a valid id');

  const cases = await repo.listCases({ ...range, hospitalId });
  const [trips, hospitals, ambulances] = await Promise.all([
    repo.listTrips(cases.map((c) => c._id)),
    repo.listHospitals(),
    repo.listAmbulances(hospitalId),
  ]);
  const summary = buildMetrics({ cases, trips, hospitals, ambulances, ...range, tzOffsetMin });
  return { ...summary, filter: { hospitalId: hospitalId || null } };
}
