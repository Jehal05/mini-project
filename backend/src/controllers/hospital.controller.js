import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Admission } from '../models/Admission.js';
import { Bed } from '../models/Bed.js';
import { Doctor } from '../models/Doctor.js';
import { EdBay } from '../models/EdBay.js';
import { Hospital } from '../models/Hospital.js';
import { HospitalCase } from '../models/HospitalCase.js';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorName } from '../utils/actorName.js';
import { writeAudit } from '../utils/audit.js';
import { randomToken } from '../utils/crypto.js';
import { inviteUser } from '../utils/invite.js';
import { releaseSlots, reserveSlots } from '../utils/slots.js';
import { announceBeds, getBedAvailability } from '../services/beds.js';
import { announceDuty, isCardiologistOnDuty } from '../services/doctors.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
export const MAX_BEDS = 300;
const MAX_BAYS = 40;

// ---- the hospital itself -------------------------------------------------------------------------------

export async function getMyHospital(req, res) {
  const h = await Hospital.findById(req.hospitalId);
  if (!h) throw ApiError.notFound('Hospital not found');
  const o = h.toJSON();
  res.json({ hospital: { ...o, location: { latitude: o.location.coordinates[1], longitude: o.location.coordinates[0] } } });
}

export async function updateMyHospital(req, res) {
  const set = {};
  if (req.valid.phone !== undefined) set.phone = req.valid.phone;
  for (const [k, v] of Object.entries(req.valid.capabilities ?? {})) set[`capabilities.${k}`] = v;
  await Hospital.updateOne({ _id: req.hospitalId }, { $set: set }, { runValidators: true });
  await writeAudit({ req, action: 'hospital.update', resourceType: 'hospital', resourceId: req.hospitalId, meta: { fields: Object.keys(req.valid) } });
  return getMyHospital(req, res);
}

// ---- feature 82: dashboard -----------------------------------------------------------------------------

export async function dashboard(req, res) {
  const hospital = oid(req.hospitalId);
  const [h, availability, doctorsOnDuty, cardiologist, incoming, admitted, response] = await Promise.all([
    Hospital.findById(hospital).select('capabilities name'),
    getBedAvailability(hospital),
    Doctor.countDocuments({ hospital, isActive: true, onDuty: true }),
    isCardiologistOnDuty(hospital),
    HospitalCase.countDocuments({ hospital, status: { $in: ['received', 'accepted', 'arrived'] } }),
    Admission.countDocuments({ hospital, status: 'admitted' }),
    HospitalCase.aggregate([
      { $match: { hospital, respondedAt: { $exists: true } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$respondedAt', '$receivedAt'] } }, n: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    kpis: {
      incomingEmergencies: incoming,
      freeBeds: availability.totalVacant,
      freeBedsByType: { general: availability.general.vacant, icu: availability.icu.vacant, ccu: availability.ccu.vacant },
      doctorsOnDuty,
      cardiologistOnDuty: cardiologist,
      ambulancesAvailable: h?.capabilities?.alsAmbulances ?? 0, // ALS ambulances the hospital lists; live dispatch data comes from the ambulance feature
      avgResponseSeconds: response[0] ? Math.round(response[0].avgMs / 1000) : null,
      respondedCases: response[0]?.n ?? 0,
      activeAdmissions: admitted,
    },
  });
}

// ---- feature 83: doctors -------------------------------------------------------------------------------

export async function listDoctors(req, res) {
  const doctors = await Doctor.find({ hospital: req.hospitalId }).sort({ isActive: -1, onDuty: -1, fullName: 1 }).populate('user', 'email isActive');
  res.json({ doctors: doctors.map((d) => ({ ...d.toJSON(), email: d.user?.email, hasLogin: Boolean(d.user) })) });
}

export async function createDoctor(req, res) {
  const { email, ...data } = req.valid;
  let user;
  if (email) {
    try {
      user = await User.create({ name: data.fullName, email, role: 'doctor', hospitalId: req.hospitalId, passwordHash: await bcrypt.hash(randomToken(24), config.bcryptRounds) });
    } catch (err) {
      if (err?.code === 11000) throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
      throw err;
    }
  }
  let doctor;
  try {
    doctor = await Doctor.create({ ...data, hospital: req.hospitalId, user: user?._id, dutyChangedAt: new Date() });
  } catch (err) {
    if (user) await User.deleteOne({ _id: user._id });
    throw err;
  }
  let invite = null;
  if (user) invite = await inviteUser(user, { inviter: await actorName(req), hospitalName: (await Hospital.findById(req.hospitalId).select('name'))?.name });
  await writeAudit({ req, action: 'doctor.create', resourceType: 'doctor', resourceId: doctor._id });
  await announceDuty(req.hospitalId);
  res.status(201).json({ doctor: doctor.toJSON(), invite });
}

export async function updateDoctor(req, res) {
  const set = { ...req.valid, ...(req.valid.onDuty !== undefined && { dutyChangedAt: new Date() }) };
  const doctor = await Doctor.findOneAndUpdate({ _id: req.params.id, hospital: req.hospitalId }, { $set: set }, { returnDocument: 'after', runValidators: true });
  if (!doctor) throw ApiError.notFound('Doctor not found');
  if (req.valid.isActive !== undefined && doctor.user) await User.updateOne({ _id: doctor.user, hospitalId: req.hospitalId }, { $set: { isActive: req.valid.isActive } });
  if (req.valid.isActive === false) await Doctor.updateOne({ _id: doctor._id }, { $set: { onDuty: false } });
  await writeAudit({ req, action: 'doctor.update', resourceType: 'doctor', resourceId: doctor._id, meta: { fields: Object.keys(req.valid) } });
  await announceDuty(req.hospitalId);
  res.json({ doctor: (await Doctor.findById(doctor._id)).toJSON() });
}

// ---- feature 85: beds ----------------------------------------------------------------------------------

export async function listBeds(req, res) {
  const [beds, availability] = await Promise.all([Bed.find({ hospital: req.hospitalId }).sort({ type: 1, label: 1 }), getBedAvailability(req.hospitalId)]);
  res.json({ beds: beds.map((b) => b.toJSON()), availability });
}

const bedKey = (hospitalId) => `beds:${hospitalId}`;
const FULL = `A hospital can have at most ${MAX_BEDS} beds`;

export async function createBed(req, res) {
  const release = await reserveSlots(bedKey(req.hospitalId), 1, MAX_BEDS, FULL, 'BED_LIMIT');
  try {
    await Bed.create({ ...req.valid, hospital: req.hospitalId });
  } catch (err) {
    await release();
    if (err?.code === 11000) throw ApiError.conflict('A bed with that label already exists', 'BED_EXISTS');
    throw err;
  }
  await writeAudit({ req, action: 'bed.create', resourceType: 'bed', resourceId: req.valid.label });
  await announceBeds(req.hospitalId);
  return listBeds(req, res.status(201));
}

export async function createBeds(req, res) {
  const { type, prefix, count } = req.valid;
  const labels = Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
  const release = await reserveSlots(bedKey(req.hospitalId), count, MAX_BEDS, FULL, 'BED_LIMIT');
  try {
    await Bed.insertMany(labels.map((label) => ({ hospital: req.hospitalId, type, label })), { ordered: true });
  } catch (err) {
    // ordered insert stops at the first clash: keep what was made, give back the rest of the reservation
    const made = err?.insertedDocs?.length ?? 0;
    await releaseSlots(bedKey(req.hospitalId), count - made);
    if (err?.code === 11000 || err?.writeErrors) throw ApiError.conflict('One of those labels is already used. Choose another prefix.', 'BED_EXISTS');
    await release().catch(() => {});
    throw err;
  }
  await writeAudit({ req, action: 'bed.create', resourceType: 'bed', resourceId: `${prefix}-*`, meta: { count } });
  await announceBeds(req.hospitalId);
  return listBeds(req, res.status(201));
}

// Allowed moves. A bed becomes occupied only through an admission, and is freed only by a discharge.
const BED_ALLOWED = { vacant: ['cleaning', 'reserved'], reserved: ['vacant', 'cleaning'], cleaning: ['vacant'] };

export async function setBedStatus(req, res) {
  const to = req.valid.status;
  const from = Object.keys(BED_ALLOWED).filter((f) => BED_ALLOWED[f].includes(to));
  const bed = await Bed.findOneAndUpdate({ _id: req.params.id, hospital: req.hospitalId, status: { $in: from } }, { $set: { status: to, statusChangedAt: new Date() } }, { returnDocument: 'after' });
  if (!bed) {
    const current = await Bed.findOne({ _id: req.params.id, hospital: req.hospitalId }).select('status');
    if (!current) throw ApiError.notFound('Bed not found');
    throw ApiError.conflict(current.status === 'occupied' ? 'This bed is occupied. It is freed when the patient is discharged.' : `A ${current.status} bed cannot be set to ${to}`, 'BED_STATE');
  }
  await writeAudit({ req, action: 'bed.update', resourceType: 'bed', resourceId: bed.label, meta: { status: to } });
  await announceBeds(req.hospitalId);
  res.json({ bed: bed.toJSON(), availability: await getBedAvailability(req.hospitalId) });
}

export async function deleteBed(req, res) {
  const bed = await Bed.findOneAndDelete({ _id: req.params.id, hospital: req.hospitalId, status: 'vacant' });
  if (!bed) {
    if (!(await Bed.exists({ _id: req.params.id, hospital: req.hospitalId }))) throw ApiError.notFound('Bed not found');
    throw ApiError.conflict('Only a vacant bed can be removed', 'BED_STATE');
  }
  await releaseSlots(bedKey(req.hospitalId));
  await writeAudit({ req, action: 'bed.delete', resourceType: 'bed', resourceId: bed.label });
  await announceBeds(req.hospitalId);
  return listBeds(req, res);
}

// ---- feature 86: emergency department ------------------------------------------------------------------

export async function edBoard(req, res) {
  const hospital = oid(req.hospitalId);
  const [bays, arriving] = await Promise.all([
    EdBay.find({ hospital }).sort({ label: 1 }),
    HospitalCase.find({ hospital, status: { $in: ['accepted', 'arrived'] } }).sort({ status: 1, etaMinutes: 1, receivedAt: 1 }),
  ]);
  res.json({ bays: bays.map((b) => b.toJSON()), arriving: arriving.map((c) => c.toJSON()) });
}

export async function createBay(req, res) {
  const key = `edbays:${req.hospitalId}`;
  const release = await reserveSlots(key, 1, MAX_BAYS, `An emergency department can have at most ${MAX_BAYS} bays`, 'BAY_LIMIT');
  try {
    await EdBay.create({ hospital: req.hospitalId, label: req.valid.label });
  } catch (err) {
    await release();
    if (err?.code === 11000) throw ApiError.conflict('A bay with that label already exists', 'BAY_EXISTS');
    throw err;
  }
  await writeAudit({ req, action: 'ed.bay_create', resourceType: 'ed_bay', resourceId: req.valid.label });
  return edBoard(req, res.status(201));
}

export async function bayAction(req, res) {
  const { action } = req.valid;
  const filter = { _id: req.params.id, hospital: req.hospitalId };
  let update;
  let from;
  if (action === 'occupy') {
    let patient;
    if (req.valid.patientId) {
      patient = await Patient.findOne({ patientId: req.valid.patientId }).select('patientId');
      if (!patient) throw new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', { patientId: 'No patient with that ID' });
    }
    from = 'vacant';
    update = { $set: { status: 'occupied', occupiedAt: new Date(), triageLevel: req.valid.triageLevel, ...(req.valid.complaint && { complaint: req.valid.complaint }), ...(patient && { patient: patient._id, patientId: patient.patientId }) } };
  } else if (action === 'clear') {
    from = 'occupied';
    update = { $set: { status: 'cleaning' }, $unset: { patient: '', patientId: '', triageLevel: '', complaint: '', occupiedAt: '' } };
  } else {
    from = 'cleaning';
    update = { $set: { status: 'vacant' } };
  }
  const bay = await EdBay.findOneAndUpdate({ ...filter, status: from }, update, { returnDocument: 'after' });
  if (!bay) {
    const current = await EdBay.findOne(filter).select('status');
    if (!current) throw ApiError.notFound('Bay not found');
    throw ApiError.conflict(`That bay is ${current.status}`, 'BAY_STATE');
  }
  await writeAudit({ req, action: `ed.bay_${action}`, resourceType: 'ed_bay', resourceId: bay.label, meta: action === 'occupy' ? { patientId: bay.patientId, triageLevel: bay.triageLevel } : undefined });
  return edBoard(req, res);
}

export async function deleteBay(req, res) {
  const bay = await EdBay.findOneAndDelete({ _id: req.params.id, hospital: req.hospitalId, status: 'vacant' });
  if (!bay) {
    if (!(await EdBay.exists({ _id: req.params.id, hospital: req.hospitalId }))) throw ApiError.notFound('Bay not found');
    throw ApiError.conflict('Only a vacant bay can be removed', 'BAY_STATE');
  }
  await releaseSlots(`edbays:${req.hospitalId}`);
  await writeAudit({ req, action: 'ed.bay_delete', resourceType: 'ed_bay', resourceId: bay.label });
  return edBoard(req, res);
}

// ---- feature 90: emergency history ---------------------------------------------------------------------

const secs = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 1000) : null);

export async function history(req, res) {
  const { status, page, limit } = req.valid;
  const filter = { hospital: oid(req.hospitalId), ...(status && { status }) };
  const [rows, total, counts] = await Promise.all([
    HospitalCase.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit),
    HospitalCase.countDocuments(filter),
    HospitalCase.aggregate([{ $match: { hospital: oid(req.hospitalId) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    cases: rows.map((c) => ({ ...c.toJSON(), respondedAfterSeconds: secs(c.receivedAt, c.respondedAt), arrivedAfterSeconds: secs(c.receivedAt, c.arrivedAt), openSeconds: secs(c.receivedAt, c.closedAt) })),
    total, page, limit, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}
