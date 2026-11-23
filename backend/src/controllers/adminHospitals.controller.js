import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { Hospital } from '../models/Hospital.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorName } from '../utils/actorName.js';
import { writeAudit } from '../utils/audit.js';
import { randomToken } from '../utils/crypto.js';
import { inviteUser } from '../utils/invite.js';
import { getBedAvailability } from '../services/beds.js';

const toGeo = ({ latitude, longitude }) => ({ type: 'Point', coordinates: [longitude, latitude] });
const present = (h) => {
  const o = h.toJSON();
  return { ...o, location: { latitude: o.location.coordinates[1], longitude: o.location.coordinates[0] } };
};
const dupName = (err) => err?.code === 11000 && (err.keyPattern?.name || /name/.test(err.message));

/** Feature 81: central admin registers a hospital and its hospital-admin account in one go. */
export async function createHospital(req, res) {
  const { admin, location, ...rest } = req.valid;
  if (await User.exists({ email: admin.email })) throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');

  let hospital;
  try {
    hospital = await Hospital.create({ ...rest, location: toGeo(location) });
  } catch (err) {
    if (dupName(err)) throw ApiError.conflict('A hospital with that name already exists', 'HOSPITAL_EXISTS');
    throw err;
  }
  let user;
  try {
    // The password is random and unknown; the admin chooses theirs from the invite link.
    user = await User.create({ name: admin.name, email: admin.email, role: 'hospital_admin', hospitalId: hospital._id, passwordHash: await bcrypt.hash(randomToken(24), config.bcryptRounds) });
  } catch (err) {
    await Hospital.deleteOne({ _id: hospital._id }); // no half-registered hospital without an admin
    if (err?.code === 11000) throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
    throw err;
  }
  const invite = await inviteUser(user, { inviter: await actorName(req), hospitalName: hospital.name });
  await writeAudit({ req, action: 'hospital.create', resourceType: 'hospital', resourceId: hospital._id, hospitalId: hospital._id, meta: { adminUser: String(user._id) } });
  res.status(201).json({ hospital: present(hospital), admin: { id: user._id, name: user.name, email: user.email }, invite });
}

export async function listHospitals(req, res) {
  const hospitals = await Hospital.find().sort({ name: 1 });
  const rows = await Promise.all(hospitals.map(async (h) => ({ ...present(h), beds: (await getBedAvailability(h._id)).totalVacant })));
  res.json({ hospitals: rows });
}

export async function getHospital(req, res) {
  const h = await Hospital.findById(req.params.id);
  if (!h) throw ApiError.notFound('Hospital not found');
  const admins = await User.find({ hospitalId: h._id, role: 'hospital_admin' }).select('name email isActive');
  res.json({ hospital: present(h), admins, availability: await getBedAvailability(h._id) });
}

export async function updateHospital(req, res) {
  const { location, capabilities, ...rest } = req.valid;
  const set = { ...rest, ...(location && { location: toGeo(location) }) };
  for (const [k, v] of Object.entries(capabilities ?? {})) set[`capabilities.${k}`] = v;
  let h;
  try {
    h = await Hospital.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after', runValidators: true });
  } catch (err) {
    if (dupName(err)) throw ApiError.conflict('A hospital with that name already exists', 'HOSPITAL_EXISTS');
    throw err;
  }
  if (!h) throw ApiError.notFound('Hospital not found');
  if (rest.isActive === false) {
    // A closed hospital's staff cannot keep working: their accounts are switched off and their sessions end on the next request.
    await User.updateMany({ hospitalId: h._id }, { $set: { isActive: false } });
  } else if (rest.isActive === true) {
    await User.updateMany({ hospitalId: h._id, role: 'hospital_admin' }, { $set: { isActive: true } });
  }
  await writeAudit({ req, action: 'hospital.update', resourceType: 'hospital', resourceId: h._id, hospitalId: h._id, meta: { fields: Object.keys(req.valid) } });
  res.json({ hospital: present(h) });
}
