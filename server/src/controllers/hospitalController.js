import { asyncHandler } from '../utils/asyncHandler.js';
import { parseCoords, parseRadiusKm, parseFilters, parseBool } from '../utils/query.js';
import { findNearby, searchHospitals, getCapability, rankNearby } from '../services/hospitalService.js';

export const nearby = asyncHandler(async (req, res) => {
  const { lat, lng } = parseCoords(req.query);
  const radiusKm = parseRadiusKm(req.query.radiusKm);
  const filters = parseFilters(req.query);
  const eta = parseBool(req.query.eta, false);
  res.json(await findNearby({ lat, lng, radiusKm, filters, eta }));
});

export const rank = asyncHandler(async (req, res) => {
  const { lat, lng } = parseCoords(req.query);
  const radiusKm = parseRadiusKm(req.query.radiusKm);
  const filters = parseFilters(req.query);
  const eta = parseBool(req.query.eta, false);
  res.json(await rankNearby({ lat, lng, radiusKm, filters, eta }));
});

export const search = asyncHandler(async (req, res) => {
  const filters = parseFilters(req.query);
  // lat/lng are optional here. When both are given, results include distance and sort by it.
  const origin = req.query.lat !== undefined || req.query.lng !== undefined ? parseCoords(req.query) : undefined;
  res.json(await searchHospitals({ filters, origin }));
});

export const capability = asyncHandler(async (req, res) => {
  res.json(await getCapability(req.params.id));
});
