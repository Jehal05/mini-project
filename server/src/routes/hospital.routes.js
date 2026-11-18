// Hospital routes: list active hospitals, find hospitals nearest-first, and search by name or address.
import { Router } from 'express';
import { Hospital } from '../models/Hospital.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { haversineKm } from '../utils/distance.js';

const router = Router();

const MAX_RADIUS_KM = 100;
const DEFAULT_RADIUS_KM = 10;
const MAX_QUERY_LENGTH = 50;

// Hospitals that can handle a cardiac case: a cath lab OR a cardiologist on duty.
const CARDIAC_FILTER = {
  $or: [{ 'capabilities.cathLab': true }, { 'capabilities.cardiologistOnDuty': true }],
};

function parseLatLng(query, { required }) {
  const hasLat = query.lat !== undefined && query.lat !== '';
  const hasLng = query.lng !== undefined && query.lng !== '';

  if (!hasLat && !hasLng) {
    if (required) {
      throw new HttpError(400, 'InvalidQuery', 'lat and lng are required');
    }
    return null;
  }
  if (hasLat !== hasLng) {
    throw new HttpError(400, 'InvalidQuery', 'lat and lng must be given together');
  }

  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new HttpError(400, 'InvalidQuery', 'lat must be a number between -90 and 90');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new HttpError(400, 'InvalidQuery', 'lng must be a number between -180 and 180');
  }
  return { lat, lng };
}

function parseRadius(value) {
  const radiusKm = value === undefined || value === '' ? DEFAULT_RADIUS_KM : Number(value);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    throw new HttpError(400, 'InvalidQuery', `radiusKm must be a number greater than 0 and at most ${MAX_RADIUS_KM}`);
  }
  return radiusKm;
}

const isTrue = (value) => value === 'true' || value === '1';

// Escape characters that have a special meaning in regular expressions,
// so a search for "a.b" or "(" is treated as plain text.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/hospitals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json({ count: hospitals.length, hospitals });
  })
);

// GET /api/hospitals/near?lat=18.52&lng=73.85&radiusKm=10&cardiacOnly=true
// $geoNear is the aggregation form of $near: same nearest-first ordering on the
// 2dsphere index, and it also returns each hospital's distance.
router.get(
  '/near',
  asyncHandler(async (req, res) => {
    const { lat, lng } = parseLatLng(req.query, { required: true });
    const radiusKm = parseRadius(req.query.radiusKm);
    const cardiacOnly = isTrue(req.query.cardiacOnly);

    const query = { isActive: true, ...(cardiacOnly ? CARDIAC_FILTER : {}) };

    const hospitals = await Hospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] }, // GeoJSON is [lng, lat]
          key: 'location',
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001, // metres -> km
          maxDistance: radiusKm * 1000, // km -> metres
          spherical: true,
          query,
        },
      },
      { $addFields: { distanceKm: { $round: ['$distanceKm', 2] } } },
    ]);

    res.json({
      origin: { lat, lng },
      radiusKm,
      cardiacOnly,
      count: hospitals.length,
      hospitals,
    });
  })
);

// GET /api/hospitals/search?q=heart&lat=18.53&lng=73.84
// Case-insensitive match on name or address. With lat/lng: distance added, nearest first.
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length > MAX_QUERY_LENGTH) {
      throw new HttpError(400, 'InvalidQuery', `q must be at most ${MAX_QUERY_LENGTH} characters`);
    }
    const origin = parseLatLng(req.query, { required: false });

    const filter = { isActive: true };
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: pattern }, { address: pattern }];
    }

    let hospitals = await Hospital.find(filter).sort({ name: 1 }).lean();

    if (origin) {
      hospitals = hospitals
        .map((h) => {
          const [hLng, hLat] = h.location.coordinates;
          return { ...h, distanceKm: haversineKm(origin.lat, origin.lng, hLat, hLng) };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    res.json({ q, origin, count: hospitals.length, hospitals });
  })
);

export default router;
