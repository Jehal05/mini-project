import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Resolves the patient record of the signed-in patient from the TOKEN. Nothing in the URL, query or
 * body can pick a different patient, so one patient can never reach another's record.
 */
export async function loadOwnPatient(req, _res, next) {
  try {
    const patient = req.user.patientId ? await Patient.findById(req.user.patientId) : null;
    if (!patient) return next(ApiError.notFound('Patient record not found'));
    if (String(patient.user) !== String(req.user.id)) return next(ApiError.forbidden()); // belt and braces
    req.patient = patient;
    return next();
  } catch (err) {
    return next(err);
  }
}
