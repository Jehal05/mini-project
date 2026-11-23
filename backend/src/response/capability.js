import { getBedAvailability } from '../services/beds.js'
import { isCardiologistOnDuty } from '../services/doctors.js'
import { Ambulance } from '../models/Ambulance.js'
import { HospitalCase } from '../models/HospitalCase.js'

/**
 * Feature 58: the live capability card of one hospital, from Jehal's beds and duty roster and the ambulance fleet.
 * Falls back to the registered capability numbers when a hospital has not entered beds or vehicles yet.
 */
export async function capabilityCard(hospital) {
  const id = hospital._id
  const [beds, cardiologistOnDuty, fleet, alsFreeCount, openCases] = await Promise.all([
    getBedAvailability(id),
    isCardiologistOnDuty(id),
    Ambulance.countDocuments({ hospital: id }),
    Ambulance.countDocuments({ hospital: id, type: 'ALS', status: 'available' }),
    HospitalCase.countDocuments({ hospital: id, status: { $in: ['received', 'accepted', 'arrived'] } }),
  ])
  const caps = hospital.capabilities ?? {}
  const hasBeds = beds.icu.total + beds.ccu.total > 0
  return {
    cathLab: Boolean(caps.cathLab),
    cardiologistOnDuty,
    freeIcu: hasBeds ? beds.icu.vacant : caps.icuBeds ?? 0,
    freeCcu: hasBeds ? beds.ccu.vacant : caps.ccuBeds ?? 0,
    alsFree: fleet > 0 ? alsFreeCount : caps.alsAmbulances ?? 0,
    openCases,
  }
}
