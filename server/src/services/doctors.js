import { EVENTS, appEvents } from '../events.js';
import { Doctor } from '../models/Doctor.js';

/** Feature 83, for hospital ranking (59) and doctor assignment (68): is a cardiologist on duty here right now? */
export async function isCardiologistOnDuty(hospitalId) {
  return Boolean(await Doctor.exists({ hospital: hospitalId, isActive: true, onDuty: true, isCardiologist: true }));
}

/** Doctors on duty at a hospital, cardiologists first. For assignment (68). */
export async function getDoctorsOnDuty(hospitalId) {
  return Doctor.find({ hospital: hospitalId, isActive: true, onDuty: true }).sort({ isCardiologist: -1, fullName: 1 });
}

export async function announceDuty(hospitalId) {
  try {
    const [cardio, count] = await Promise.all([isCardiologistOnDuty(hospitalId), Doctor.countDocuments({ hospital: hospitalId, isActive: true, onDuty: true })]);
    appEvents.emit(EVENTS.DOCTOR_DUTY_CHANGED, { hospitalId: String(hospitalId), cardiologistOnDuty: cardio, doctorsOnDuty: count });
  } catch (err) {
    console.error('[doctors] announce failed', err.message);
  }
}
