// Ambulance registry and availability (features 71, 72).
import * as repo from './ambulanceRepo.js';
import * as caseRepo from './caseRepo.js';
import { summarizeFleet } from './fleetLogic.js';
import { httpError } from '../utils/httpError.js';
import { isObjectId } from '../utils/ids.js';

const TYPES = ['BLS', 'ALS'];
const view = (a) => ({
  id: String(a._id),
  vehicleNumber: a.vehicleNumber,
  type: a.type,
  homeHospital: String(a.homeHospital),
  status: a.status,
  reserved: a.status === 'available' && Boolean(a.currentCase),
  crew: a.crew || [],
  equipment: a.equipment || [],
  location: a.location?.coordinates ? { lat: a.location.coordinates[1], lng: a.location.coordinates[0] } : null,
});
export { view as ambulanceView };

const cleanList = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

// Feature 71: a hospital registers its own ambulances only.
export async function registerAmbulance(hospitalId, body = {}) {
  const vehicleNumber = typeof body.vehicleNumber === 'string' ? body.vehicleNumber.trim().toUpperCase() : '';
  if (vehicleNumber.length < 3 || vehicleNumber.length > 20) throw httpError(400, 'vehicleNumber must be 3 to 20 characters');
  if (!TYPES.includes(body.type)) throw httpError(400, 'type must be BLS or ALS');
  if (body.homeHospital && String(body.homeHospital) !== String(hospitalId)) {
    throw httpError(403, 'You can only register ambulances for your own hospital');
  }

  const hospital = await caseRepo.getHospital(hospitalId);
  if (!hospital) throw httpError(404, 'Hospital not found');

  const crew = cleanList(body.crew, 6).map((c) => ({ name: String(c?.name || '').trim().slice(0, 60), role: String(c?.role || '').trim().slice(0, 30) }));
  if (crew.some((c) => !c.name)) throw httpError(400, 'Every crew member needs a name');
  const equipment = cleanList(body.equipment, 20).map((e) => String(e).trim().slice(0, 40)).filter(Boolean);

  try {
    const created = await repo.createAmbulance({
      vehicleNumber,
      type: body.type,
      homeHospital: hospitalId,
      crew,
      equipment,
      location: { type: 'Point', coordinates: hospital.location.coordinates }, // starts at its home hospital
      simulated: true,
    });
    return view(created);
  } catch (err) {
    if (err.code === 11000) throw httpError(409, `An ambulance with number ${vehicleNumber} already exists`);
    throw err;
  }
}

export async function listAmbulances(hospitalId, query = {}) {
  if (query.hospital && String(query.hospital) !== String(hospitalId)) {
    throw httpError(403, 'You can only list your own hospital ambulances');
  }
  if (query.type && !TYPES.includes(query.type)) throw httpError(400, 'type must be BLS or ALS');
  const STATUSES = ['available', 'dispatched', 'on_trip', 'maintenance'];
  if (query.status && !STATUSES.includes(query.status)) throw httpError(400, `status must be one of: ${STATUSES.join(', ')}`);
  const list = await repo.listAmbulances({ hospitalId, type: query.type, status: query.status });
  return { count: list.length, results: list.map(view) };
}

// Feature 72: staff can switch between available and maintenance. dispatched and on_trip are set by the system.
export async function setStatus(hospitalId, ambulanceId, to) {
  if (!isObjectId(ambulanceId)) throw httpError(400, 'Invalid ambulance id');
  if (!['available', 'maintenance'].includes(to)) {
    throw httpError(400, 'Staff can set available or maintenance. dispatched and on_trip are set automatically.');
  }
  const a = await repo.getAmbulance(ambulanceId);
  if (!a) throw httpError(404, 'Ambulance not found');
  if (String(a.homeHospital) !== String(hospitalId)) throw httpError(403, 'This ambulance belongs to another hospital');
  if (a.status === to) return view(a);

  const from = to === 'maintenance' ? ['available'] : ['maintenance'];
  const updated = await repo.setAmbulanceStatus(ambulanceId, hospitalId, from, to);
  if (!updated) {
    throw httpError(
      409,
      a.status === 'dispatched' || a.status === 'on_trip' || a.currentCase
        ? 'This ambulance is dispatched, on a trip or reserved for a case, so its status cannot be changed now'
        : `Cannot change status from ${a.status} to ${to}`,
    );
  }
  return view(updated);
}

// Feature 72: live counts per status and per type.
export async function fleetSummary(hospitalId) {
  const list = await repo.listAmbulances({ hospitalId });
  return { hospitalId: String(hospitalId), ...summarizeFleet(list), updatedAt: new Date().toISOString() };
}
