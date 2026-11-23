// Thin database layer. All MongoDB access for hospital discovery lives here so the logic
// in hospitalService.js can be tested with this module mocked.
import mongoose from 'mongoose';
import { Hospital, Bed, Doctor, Ambulance, EmergencyCase } from '../models/index.js';
import { escapeRegex } from '../utils/query.js';

export const isValidId = (id) => mongoose.isValidObjectId(id);

// $near on the 2dsphere index returns results nearest-first (feature 53).
export function findNear(lat, lng, maxMeters) {
  return Hospital.find({
    location: {
      $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: maxMeters },
    },
  }).lean();
}

export function findMany({ q, area } = {}) {
  const filter = {};
  const ors = [];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    ors.push({ name: rx }, { area: rx });
  }
  if (ors.length) filter.$or = ors;
  if (area) filter.area = new RegExp(escapeRegex(area), 'i');
  return Hospital.find(filter).limit(200).lean();
}

export function findById(id) {
  return Hospital.findById(id).lean();
}

// Live counts per hospital, straight from the Bed, Doctor, Ambulance and EmergencyCase collections.
export async function getAggregates(hospitalIds) {
  const ids = hospitalIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const result = {};
  for (const id of hospitalIds) {
    result[String(id)] = {
      icuFree: 0, icuTotal: 0, ccuFree: 0, ccuTotal: 0, bedsFree: 0, bedsTotal: 0,
      cardiologists: 0, alsFree: 0, activeCases: 0,
    };
  }
  if (!ids.length) return result;

  const [beds, doctors, ambulances, cases] = await Promise.all([
    Bed.aggregate([
      { $match: { hospital: { $in: ids } } },
      { $group: { _id: { h: '$hospital', ward: '$ward', status: '$status' }, n: { $sum: 1 } } },
    ]),
    Doctor.aggregate([
      { $match: { hospital: { $in: ids }, specialty: 'cardiologist', onDuty: true } },
      { $group: { _id: '$hospital', n: { $sum: 1 } } },
    ]),
    Ambulance.aggregate([
      { $match: { homeHospital: { $in: ids }, type: 'ALS', status: 'available' } },
      { $group: { _id: '$homeHospital', n: { $sum: 1 } } },
    ]),
    EmergencyCase.aggregate([
      { $match: { hospital: { $in: ids }, status: { $in: ['accepted', 'ambulance_assigned', 'en_route'] } } },
      { $group: { _id: '$hospital', n: { $sum: 1 } } },
    ]),
  ]);

  for (const row of beds) {
    const a = result[String(row._id.h)];
    if (!a) continue;
    a.bedsTotal += row.n;
    if (row._id.status === 'free') a.bedsFree += row.n;
    if (row._id.ward === 'ICU') {
      a.icuTotal += row.n;
      if (row._id.status === 'free') a.icuFree += row.n;
    }
    if (row._id.ward === 'CCU') {
      a.ccuTotal += row.n;
      if (row._id.status === 'free') a.ccuFree += row.n;
    }
  }
  for (const row of doctors) if (result[String(row._id)]) result[String(row._id)].cardiologists = row.n;
  for (const row of ambulances) if (result[String(row._id)]) result[String(row._id)].alsFree = row.n;
  for (const row of cases) if (result[String(row._id)]) result[String(row._id)].activeCases = row.n;

  return result;
}
