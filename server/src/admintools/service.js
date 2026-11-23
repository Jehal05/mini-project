// Central admin tools: the audit log viewer (feature 98) and registering a hospital (feature 81).
import { httpError } from '../utils/httpError.js';
import { invalid } from '../inpatient/fields.js';
import { hashPassword } from '../auth/password.js';
import * as defaultRepo from './repo.js';

const conflict = (message, code) => Object.assign(httpError(409, message), { code });
const present = (e) => ({
  id: String(e._id), at: e.createdAt, action: e.action, actorName: e.actor?.name ?? null, actorRole: e.actor?.role ?? e.meta?.role ?? null,
  resourceType: e.resourceType ?? null, resourceRef: e.resourceRef ?? null, meta: e.meta ?? null,
});

export async function listAudit(query, repo = defaultRepo) {
  const { items, total } = await repo.listAudit(query);
  return { items: items.map(present), total, page: query.page, limit: query.limit };
}

export async function registerHospital(body, actor, repo = defaultRepo) {
  const b = body;
  const fields = {};
  if (await repo.findHospitalByCode(b.code)) fields.code = 'A hospital with this code already exists';
  if (await repo.findUserByEmail(b.adminEmail)) fields.adminEmail = 'This email already has an account';
  if (Object.keys(fields).length) throw invalid(fields);
  const hospital = await repo.createHospital({
    code: b.code, name: b.name, address: b.address, area: b.area, phone: b.phone,
    location: { type: 'Point', coordinates: [b.longitude, b.latitude] },
    capabilities: { cathLab: Boolean(b.cathLab), cardiologistOnDuty: false }, simulated: true,
  });
  let user;
  try {
    user = await repo.createUser({ name: b.adminName, email: b.adminEmail, role: 'hospital_admin', hospital: hospital._id, passwordHash: await hashPassword(b.adminPassword), isActive: true });
  } catch (e) {
    await repo.deleteHospital(hospital._id); // no hospital without an administrator
    if (e?.code === 11000) throw conflict('This email already has an account', 'EMAIL_TAKEN');
    throw e;
  }
  await repo.writeAudit({ actor: actor?.userId, action: 'admin_register_hospital', resourceType: 'hospital', resourceId: hospital._id, resourceRef: b.code, meta: { name: b.name, adminEmail: b.adminEmail } });
  return { hospital: { id: String(hospital._id), code: hospital.code, name: hospital.name }, admin: { id: String(user._id), email: b.adminEmail } };
}

/** Feature 36 on the central side: the command-centre map reads the whole system in one call. */
export async function overview(repo = defaultRepo) {
  const [hospitals, ambulances, cases] = await Promise.all([repo.mapHospitals(), repo.mapAmbulances(), repo.mapLiveCases()]);
  const pt = (loc) => (Array.isArray(loc?.coordinates) && loc.coordinates.length === 2 && !(loc.coordinates[0] === 0 && loc.coordinates[1] === 0) ? { latitude: loc.coordinates[1], longitude: loc.coordinates[0] } : null);
  const pick = (list, f) => list.map(f).filter((x) => x.location);
  return {
    hospitals: pick(hospitals, (h) => ({ id: String(h._id), name: h.name, code: h.code, cathLab: Boolean(h.capabilities?.cathLab), freeBeds: h.freeBeds ?? 0, location: pt(h.location) })),
    ambulances: pick(ambulances, (a) => ({ id: String(a._id), vehicleNumber: a.vehicleNumber, type: a.type, status: a.status, location: pt(a.location) })),
    cases: pick(cases, (c) => ({ id: String(c._id), caseNumber: c.caseNumber ?? null, status: c.status, severity: c.severity, location: pt(c.location) })),
  };
}
