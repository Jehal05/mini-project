// Database layer for patient records. The service talks only to this file, so tests swap it for an in-memory copy.
import { Patient, Document, BystanderReport, AuditLog, User } from '../models/index.js';
import { nextSequence } from '../models/Counter.js';

export const nextPatientSeq = (year) => nextSequence(`patientId:${year}`);
export const createPatient = async (data) => (await Patient.create(data)).toObject();
export const findPatient = (id) => Patient.findById(id).lean();
export const findByQrToken = (token) => Patient.findOne({ qrToken: token }).lean();
export const linkUser = (userId, patientId) => User.updateOne({ _id: userId }, { $set: { patient: patientId } });
export const removeUser = (userId) => User.deleteOne({ _id: userId });

/** Optimistic save: only applies if the record is still the version the caller read (same updatedAt). Returns the new record, or null if it changed. */
export function savePatient(id, expectedUpdatedAt, { set = {}, unset = {} } = {}) {
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = Object.fromEntries(Object.keys(unset).map((k) => [k, 1]));
  return Patient.findOneAndUpdate({ _id: id, updatedAt: expectedUpdatedAt }, update, { new: true, runValidators: true }).lean();
}

export const countDocuments = (patient) => Document.countDocuments({ patient });
export const createDocument = async (data) => (await Document.create(data)).toObject();
export const listDocuments = (patient) => Document.find({ patient }).sort({ uploadedAt: -1 }).lean();
export const findDocument = (patient, id) => Document.findOne({ _id: id, patient }).lean();
export const deleteDocument = (patient, id) => Document.findOneAndDelete({ _id: id, patient }).lean();

export const createReport = async (data) => (await BystanderReport.create(data)).toObject();
export const writeAudit = (entry) => AuditLog.create(entry);
