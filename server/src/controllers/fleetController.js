import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { env } from '../config/env.js';
import * as fleet from '../services/fleetService.js';
import * as assignment from '../services/assignment.js';
import * as trips from '../services/tripService.js';
import * as ambulanceRepo from '../services/ambulanceRepo.js';
import { broadcastCase } from '../services/caseService.js';

const hid = (req) => req.staff.hospitalId;

export const register = asyncHandler(async (req, res) => res.status(201).json(await fleet.registerAmbulance(hid(req), req.body)));
export const list = asyncHandler(async (req, res) => res.json(await fleet.listAmbulances(hid(req), req.query)));
export const setStatus = asyncHandler(async (req, res) => res.json(await fleet.setStatus(hid(req), req.params.id, req.body?.status)));
export const summary = asyncHandler(async (req, res) => {
  if (req.params.id !== hid(req)) throw httpError(403, 'You can only view your own hospital fleet');
  res.json(await fleet.fleetSummary(hid(req)));
});

export const options = asyncHandler(async (req, res) => res.json(await assignment.assignmentOptions(req.params.caseId, hid(req))));
export const override = asyncHandler(async (req, res) => {
  const result = await assignment.overrideAssign(req.params.caseId, hid(req), req.body?.ambulanceId);
  await broadcastCase(req.params.caseId, hid(req));
  res.json(result);
});
export const dispatch = asyncHandler(async (req, res) => res.json(await trips.dispatch(req.params.caseId, hid(req))));
export const staffTrip = asyncHandler(async (req, res) => res.json(await trips.getTripForStaff(req.params.caseId, hid(req))));

export const publicTrip = asyncHandler(async (req, res) => res.json(await trips.getTripPublic(req.params.caseId)));
export const pickup = asyncHandler(async (req, res) => res.json(await trips.confirmPickup(req.params.caseId, req.crew.ambulanceId)));
export const arrive = asyncHandler(async (req, res) =>
  res.json(await trips.confirmArrival(req.params.caseId, { ambulanceId: req.crew?.ambulanceId, hospitalId: req.staff?.hospitalId })),
);
export const crewTrip = asyncHandler(async (req, res) => res.json(await trips.getTripForCrew(req.crew.ambulanceId)));

// Dev only: ambulances to choose from on the crew login screen.
export const crewOptions = asyncHandler(async (req, res) => {
  if (env.nodeEnv === 'production') throw httpError(404, 'Not found');
  const list = await ambulanceRepo.listForCrewLogin();
  res.json({
    results: list.map((a) => ({ id: String(a._id), vehicleNumber: a.vehicleNumber, type: a.type, hospital: a.homeHospital?.name ?? null, status: a.status })),
  });
});
