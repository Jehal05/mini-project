import * as repo from './hospitalRepo.js';
import { haversineKm, round } from './geo.js';
import { getRoadRoute } from './routing.js';
import { rankHospitals } from './ranking.js';
import { toCapability, applyFilters } from './capability.js';
import { httpError } from '../utils/httpError.js';

const toPoint = (h) => ({ lat: h.location.coordinates[1], lng: h.location.coordinates[0] });
const ETA_LIMIT = 5; // road ETA is looked up only for the first few results to keep requests fast

async function buildItems(hospitals, origin) {
  const aggs = await repo.getAggregates(hospitals.map((h) => String(h._id)));
  return hospitals.map((h) => {
    const location = toPoint(h);
    return {
      id: String(h._id),
      code: h.code,
      name: h.name,
      area: h.area,
      address: h.address,
      phone: h.phone,
      location,
      ...(origin ? { distanceKm: round(haversineKm(origin, location)) } : {}),
      capability: toCapability(h, aggs[String(h._id)]),
    };
  });
}

async function attachEta(items, origin) {
  await Promise.all(
    items.slice(0, ETA_LIMIT).map(async (item) => {
      item.eta = await getRoadRoute(origin, item.location);
    }),
  );
  return items;
}

// Feature 53 (+54, 57): nearest first, Haversine distance on each, optional road ETA.
export async function findNearby({ lat, lng, radiusKm, filters = {}, eta = false }) {
  const origin = { lat, lng };
  const hospitals = await repo.findNear(lat, lng, radiusKm * 1000);
  const items = applyFilters(await buildItems(hospitals, origin), filters);
  if (eta) await attachEta(items, origin);
  return { origin, radiusKm, count: items.length, results: items };
}

// Feature 56 (+57): search by name or area with filters. Sorted by distance when an origin is given.
export async function searchHospitals({ filters = {}, origin, limit = 50 }) {
  const hospitals = await repo.findMany({ q: filters.q, area: filters.area });
  let items = applyFilters(await buildItems(hospitals, origin), filters);
  items = origin
    ? items.sort((a, b) => a.distanceKm - b.distanceKm)
    : items.sort((a, b) => a.name.localeCompare(b.name));
  items = items.slice(0, Math.min(limit, 100));
  return { count: items.length, results: items };
}

// Feature 58: live capability card.
export async function getCapability(id) {
  if (!repo.isValidId(id)) throw httpError(400, 'Invalid hospital id');
  const hospital = await repo.findById(id);
  if (!hospital) throw httpError(404, 'Hospital not found');
  const aggs = await repo.getAggregates([String(hospital._id)]);
  return {
    hospitalId: String(hospital._id),
    name: hospital.name,
    area: hospital.area,
    ...toCapability(hospital, aggs[String(hospital._id)]),
    updatedAt: new Date().toISOString(),
    notice: 'Simulated data for demonstration. Not a medical device.',
  };
}

// Feature 59: ranked list, top 3 flagged notifyFirst. ETA is informational and does not change the rank.
export async function rankNearby({ lat, lng, radiusKm, filters = {}, eta = false }) {
  const origin = { lat, lng };
  const { results } = await findNearby({ lat, lng, radiusKm, filters });
  const ranked = rankHospitals(results);
  if (eta) await attachEta(ranked, origin);
  return { origin, radiusKm, count: ranked.length, results: ranked };
}
