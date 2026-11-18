// Hospital routes: list, nearest-first, search, cardiac ranking (/rank), one hospital, and demo capacity updates.
import { Router } from 'express';
import mongoose from 'mongoose';
import { Hospital } from '../models/Hospital.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { haversineKm } from '../utils/distance.js';
import { rankHospitals, nextRadius } from '../services/ranking.js';
import { RANKING_WEIGHTS, RANKING_CAPS, TOP_N } from '../config/ranking.js';
import { getIO } from '../socket/index.js';

const router = Router();

const MAX_RADIUS_KM = 100;
const DEFAULT_RADIUS_KM = 10;
const MAX_QUERY_LENGTH = 50;
const MAX_EXCLUDE = 20;

// Hospitals that can handle a cardiac case: a cath lab OR a cardiologist on duty.
const CARDIAC_FILTER = {
  $or: [{ 'capabilities.cathLab': true }, { 'capabilities.cardiologistOnDuty': true }],
};

// ---------- input parsing ----------

function parseLatLng(query, { required }) {
  const hasLat = query.lat !== undefined && query.lat !== '';
  const hasLng = query.lng !== undefined && query.lng !== '';

  if (!hasLat && !hasLng) {
    if (required) throw new HttpError(400, 'InvalidQuery', 'lat and lng are required');
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

function parseExclude(value) {
  if (value === undefined || value === '') return [];
  const ids = String(value)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > MAX_EXCLUDE) {
    throw new HttpError(400, 'InvalidQuery', `exclude can list at most ${MAX_EXCLUDE} hospitals`);
  }
  const invalid = ids.filter((id) => !mongoose.isValidObjectId(id));
  if (invalid.length) {
    throw new HttpError(400, 'InvalidQuery', `exclude has invalid hospital ids: ${invalid.join(', ')}`);
  }
  return [...new Set(ids)];
}

function parseHospitalId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, 'InvalidId', 'Invalid hospital id');
  }
  return id;
}

const isTrue = (value) => value === 'true' || value === '1';

// Escape regex special characters so a search for "a.b" or "(" is plain text.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Active hospitals within the radius, nearest first, each with distanceKm.
// $geoNear is the aggregation form of $near: same nearest-first order on the
// 2dsphere index, and it also returns the distance.
function findNear({ lat, lng, radiusKm, extraQuery = {} }) {
  return Hospital.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] }, // GeoJSON is [lng, lat]
        key: 'location',
        distanceField: 'distanceKm',
        distanceMultiplier: 0.001, // metres -> km
        maxDistance: radiusKm * 1000, // km -> metres
        spherical: true,
        query: { isActive: true, ...extraQuery },
      },
    },
    { $addFields: { distanceKm: { $round: ['$distanceKm', 2] } } },
  ]);
}

// ---------- routes (fixed paths before "/:id") ----------

// GET /api/hospitals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json({ count: hospitals.length, hospitals });
  })
);

// GET /api/hospitals/near?lat=18.52&lng=73.85&radiusKm=10&cardiacOnly=true
router.get(
  '/near',
  asyncHandler(async (req, res) => {
    const { lat, lng } = parseLatLng(req.query, { required: true });
    const radiusKm = parseRadius(req.query.radiusKm);
    const cardiacOnly = isTrue(req.query.cardiacOnly);

    const hospitals = await findNear({
      lat,
      lng,
      radiusKm,
      extraQuery: cardiacOnly ? CARDIAC_FILTER : {},
    });

    res.json({ origin: { lat, lng }, radiusKm, cardiacOnly, count: hospitals.length, hospitals });
  })
);

// GET /api/hospitals/search?q=heart&lat=18.53&lng=73.84
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

// GET /api/hospitals/rank?lat=18.5308&lng=73.8475&radiusKm=10&exclude=<id>,<id>
// Features 57-60: suitable hospitals ranked by a transparent score, with alternatives.
router.get(
  '/rank',
  asyncHandler(async (req, res) => {
    const { lat, lng } = parseLatLng(req.query, { required: true });
    const radiusKm = parseRadius(req.query.radiusKm);
    const exclude = parseExclude(req.query.exclude);

    const candidates = await findNear({ lat, lng, radiusKm });
    const { top, alternatives, notSuitable, excluded } = rankHospitals(
      candidates,
      radiusKm,
      RANKING_WEIGHTS,
      { caps: RANKING_CAPS, topN: TOP_N, exclude }
    );

    // Excluded hospitals may lie outside the radius, so look up their names too.
    const known = new Map(excluded.map((h) => [String(h._id), h]));
    const missing = exclude.filter((id) => !known.has(id));
    if (missing.length) {
      const others = await Hospital.find({ _id: { $in: missing } }).select('name').lean();
      others.forEach((h) => known.set(String(h._id), h));
    }
    const excludedOut = exclude.map((id) => ({ _id: id, name: known.get(id)?.name ?? null }));

    const suitableCount = top.length + alternatives.length;
    const suggestedRadiusKm = suitableCount < TOP_N ? nextRadius(radiusKm) : null;

    res.json({
      origin: { lat, lng },
      radiusKm,
      weights: RANKING_WEIGHTS,
      suitableCount,
      top,
      alternatives,
      notSuitable,
      excluded: excludedOut,
      suggestedRadiusKm,
    });
  })
);

// GET /api/hospitals/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseHospitalId(req.params.id);
    const hospital = await Hospital.findById(id).lean();
    if (!hospital) throw new HttpError(404, 'NotFound', 'Hospital not found');
    res.json({ hospital });
  })
);

// PATCH /api/hospitals/:id/capabilities
// Demo only. Phase 2 auth will restrict this to hospital_admin and central_admin.
// Until Jehal's bed and doctor modules exist, this is how capacity changes during a demo.
const BOOLEAN_FIELDS = ['cathLab', 'cardiologistOnDuty'];
const COUNT_FIELDS = ['icuBedsFree', 'ccuBedsFree', 'alsAmbulances'];
const MAX_COUNT = 999;

function parseCapabilityChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'InvalidBody', 'Send a JSON object of capability changes');
  }
  const allowed = [...BOOLEAN_FIELDS, ...COUNT_FIELDS];
  const keys = Object.keys(body);
  if (keys.length === 0) {
    throw new HttpError(400, 'InvalidBody', `Send at least one of: ${allowed.join(', ')}`);
  }

  const set = {};
  for (const key of keys) {
    const value = body[key];
    if (BOOLEAN_FIELDS.includes(key)) {
      if (typeof value !== 'boolean') throw new HttpError(400, 'InvalidBody', `${key} must be true or false`);
    } else if (COUNT_FIELDS.includes(key)) {
      if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) {
        throw new HttpError(400, 'InvalidBody', `${key} must be a whole number from 0 to ${MAX_COUNT}`);
      }
    } else {
      throw new HttpError(400, 'InvalidBody', `Unknown field "${key}". Allowed: ${allowed.join(', ')}`);
    }
    set[`capabilities.${key}`] = value;
  }
  set['capabilities.updatedAt'] = new Date();
  return set;
}

router.patch(
  '/:id/capabilities',
  asyncHandler(async (req, res) => {
    const id = parseHospitalId(req.params.id);
    const set = parseCapabilityChanges(req.body);

    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true, runValidators: true }
    ).lean();
    if (!hospital) throw new HttpError(404, 'NotFound', 'Hospital not found');

    // Tell every open screen to refresh its ranking.
    try {
      getIO().emit('hospital:capabilities', {
        hospitalId: String(hospital._id),
        capabilities: hospital.capabilities,
        updatedAt: hospital.capabilities.updatedAt,
      });
    } catch (err) {
      console.warn('[hospitals] capabilities saved but not broadcast:', err.message);
    }

    res.json({ hospital });
  })
);

export default router;
