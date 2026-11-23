import { AuditLog, Ambulance, Bed, EmergencyCase, Hospital, User } from '../models/index.js';
import { LIVE_STATUSES } from '../monitoring/caseLocation.js';

const lean = (q) => q.lean();
export const findHospitalByCode = (code) => lean(Hospital.findOne({ code }).select('_id'));
export const findUserByEmail = (email) => lean(User.findOne({ email }).select('_id'));
export const createHospital = (d) => Hospital.create(d).then((x) => x.toObject());
export const createUser = (d) => User.create(d).then((x) => x.toObject());
export const deleteHospital = (id) => Hospital.deleteOne({ _id: id });
export const writeAudit = (d) => AuditLog.create(d);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function listAudit({ action, q, from, to, page, limit }) {
  const f = {};
  if (action) f.action = { $regex: escape(action), $options: 'i' };
  if (q) f.$or = [{ action: { $regex: escape(q), $options: 'i' } }, { resourceRef: { $regex: escape(q), $options: 'i' } }];
  if (from || to) f.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [items, total] = await Promise.all([
    lean(AuditLog.find(f).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('actor', 'name role')),
    AuditLog.countDocuments(f),
  ]);
  return { items, total };
}

export const mapHospitals = async () => {
  const hospitals = await lean(Hospital.find().select('name code capabilities location'));
  const free = await Bed.aggregate([{ $match: { status: 'free' } }, { $group: { _id: '$hospital', n: { $sum: 1 } } }]);
  const by = new Map(free.map((r) => [String(r._id), r.n]));
  return hospitals.map((h) => ({ ...h, freeBeds: by.get(String(h._id)) ?? 0 }));
};
export const mapAmbulances = () => lean(Ambulance.find().select('vehicleNumber type status location'));
export const mapLiveCases = () => lean(EmergencyCase.find({ status: { $in: LIVE_STATUSES } }).select('caseNumber status severity location').limit(200));
