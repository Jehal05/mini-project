// Hospital routes: list active hospitals, and find hospitals nearest-first around a point.
import { Router } from 'express';
import { Hospital } from '../models/Hospital.js';
import { HttpError, asyncHandler } from '../utils/http.js';

const router = Router();

const MAX_RADIUS_KM = 100;
const DEFAULT_RADIUS_KM = 10;

function parseNearQuery(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radiusKm = query.radiusKm === undefined ? DEFAULT_RADIUS_KM : Number(query.radiusKm);

  if (query.lat === undefined || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new HttpError(400, 'InvalidQuery', 'lat is required and must be a number between -90 and 90');
  }
  if (query.lng === undefined || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new HttpError(400, 'InvalidQuery', 'lng is required and must be a number between -180 and 180');
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    throw new HttpError(400, 'InvalidQuery', `radiusKm must be a number greater than 0 and at most ${MAX_RADIUS_KM}`);
  }
  return { lat, lng, radiusKm };
}

// GET /api/hospitals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json({ count: hospitals.length, hospitals });
  })
);

// GET /api/hospitals/near?lat=18.52&lng=73.85&radiusKm=10
// $geoNear is the aggregation form of $near: same nearest-first ordering on the
// 2dsphere index, and it also returns each hospital's distance.
router.get(
  '/near',
  asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm } = parseNearQuery(req.query);

    const hospitals = await Hospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] }, // GeoJSON is [lng, lat]
          key: 'location',
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001, // metres -> km
          maxDistance: radiusKm * 1000, // km -> metres
          spherical: true,
          query: { isActive: true },
        },
      },
      { $addFields: { distanceKm: { $round: ['$distanceKm', 2] } } },
    ]);

    res.json({
      origin: { lat, lng },
      radiusKm,
      count: hospitals.length,
      hospitals,
    });
  })
);

export default router;
