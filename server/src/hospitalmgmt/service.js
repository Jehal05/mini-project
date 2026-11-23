// The hospital's own management screens (features 81, 82, 83, 86, 90). Every function takes the signed-in `actor` and only
// ever touches that actor's own hospital: the id comes from the token, never from the request.
import { httpError } from '../utils/httpError.js';
import { invalid } from '../inpatient/fields.js';
import * as repo from './repo.js';
import { BAY_MOVES, averageResponse, historyFilter, outcomeOf, secondsBetween, summariseBeds } from './logic.js';

const err = (status, message, code) => Object.assign(httpError(status, message), { code });
const sid = (v) => String(v);
export const MAX_BAYS = 40;

const hospitalOf = (actor) => { if (!actor.hospitalId) throw err(403, 'This account is not linked to a hospital', 'NO_HOSPITAL'); return actor.hospitalId; };
const audit = (actor, action, ref, meta) => repo.writeAudit({ actor: actor.id, action, resourceType: 'hospital', resourceRef: ref, meta: { role: actor.role, hospitalId: actor.hospitalId, ...meta } });

// ---- 81: the hospital's profile ----
const presentHospital = (h, live) => ({
  id: sid(h._id), code: h.code, name: h.name, address: h.address ?? '', area: h.area ?? '', phone: h.phone ?? '',
  location: { latitude: h.location?.coordinates?.[1], longitude: h.location?.coordinates?.[0] },
  capabilities: { cathLab: Boolean(h.capabilities?.cathLab), cardiologistOnDuty: live.cardiologistOnDuty },
  simulated: Boolean(h.simulated),
});

export async function getProfile(actor) {
  const id = hospitalOf(actor);
  const h = await repo.getHospital(id);
  if (!h) throw err(404, 'Hospital not found', 'NOT_FOUND');
  return presentHospital(h, { cardiologistOnDuty: await repo.cardiologistOnDuty(id) });
}

/** A hospital admin can change the phone number and whether there is a cath lab. Name and place are set by the central admin. */
export async function updateProfile(actor, v) {
  const id = hospitalOf(actor);
  const set = {};
  if (v.phone !== undefined) set.phone = v.phone;
  if (v.cathLab !== undefined) set['capabilities.cathLab'] = v.cathLab;
  const h = await repo.updateHospital(id, set);
  if (!h) throw err(404, 'Hospital not found', 'NOT_FOUND');
  await audit(actor, 'hospital.update', sid(id), { fields: Object.keys(v) });
  return presentHospital(h, { cardiologistOnDuty: await repo.cardiologistOnDuty(id) });
}

// ---- 82: the dashboard ----
export async function dashboard(actor) {
  const id = hospitalOf(actor);
  const [beds, doctorsOnDuty, cardiologist, ambulances, admissions, incoming, handling, accepted] = await Promise.all([
    repo.bedCounts(id), repo.countDoctorsOnDuty(id), repo.cardiologistOnDuty(id), repo.countAvailableAmbulances(id),
    repo.countActiveAdmissions(id), repo.countIncoming(id), repo.countHandling(id), repo.recentAccepted(id),
  ]);
  const b = summariseBeds(beds);
  const response = averageResponse(accepted, id);
  return {
    kpis: {
      incomingEmergencies: incoming,
      handlingEmergencies: handling,
      freeBeds: b.free,
      freeBedsByWard: Object.fromEntries(Object.entries(b.wards).map(([w, c]) => [w, c.free])),
      doctorsOnDuty,
      cardiologistOnDuty: cardiologist,
      ambulancesAvailable: ambulances,
      avgResponseSeconds: response.seconds,
      respondedCases: response.cases,
      activeAdmissions: admissions,
    },
    simulated: true,
  };
}

// ---- 83: doctors ----
const presentDoctor = (d) => ({ id: sid(d._id), name: d.name, specialty: d.specialty, phone: d.phone ?? '', onDuty: Boolean(d.onDuty), isActive: d.isActive !== false, dutyChangedAt: d.dutyChangedAt ?? null, hasLogin: false });

export async function listDoctors(actor) { return (await repo.listDoctors(hospitalOf(actor))).map(presentDoctor); }

/** The hospital's "cardiologist on duty" flag (used when ranking hospitals) follows the roster. */
async function syncCardiologistFlag(hospitalId) { await repo.setCardiologistFlag(hospitalId, await repo.cardiologistOnDuty(hospitalId)); }

export async function addDoctor(actor, v) {
  const h = hospitalOf(actor);
  let d;
  try { d = await repo.createDoctor({ hospital: h, name: v.name, specialty: v.specialty, phone: v.phone, onDuty: v.onDuty ?? false, dutyChangedAt: new Date(), isActive: true }); } catch (e) {
    if (e?.code === 11000) throw invalid({ name: 'A doctor with this name already exists at this hospital' });
    throw e;
  }
  await syncCardiologistFlag(h);
  await audit(actor, 'doctor.create', sid(d._id), {});
  return presentDoctor(d);
}

export async function changeDoctor(actor, doctorId, v) {
  const h = hospitalOf(actor);
  const set = { ...v };
  if (v.onDuty !== undefined) set.dutyChangedAt = new Date();
  if (v.isActive === false) set.onDuty = false; // someone who has left is never on duty
  let d;
  try { d = await repo.updateDoctor(h, doctorId, set); } catch (e) {
    if (e?.code === 11000) throw invalid({ name: 'A doctor with this name already exists at this hospital' });
    throw e;
  }
  if (!d) throw err(404, 'Doctor not found', 'NOT_FOUND');
  await syncCardiologistFlag(h);
  await audit(actor, 'doctor.update', sid(d._id), { fields: Object.keys(v) });
  return presentDoctor(d);
}

// ---- 86: emergency department ----
const presentBay = (b) => ({ id: sid(b._id), label: b.label, status: b.status, patientId: b.patientId ?? null, triageLevel: b.triageLevel ?? null, complaint: b.complaint ?? '', occupiedAt: b.occupiedAt ?? null });

export async function edBoard(actor) {
  const h = hospitalOf(actor);
  const [bays, arriving] = await Promise.all([repo.listBays(h), repo.listArriving(h)]);
  const people = new Map((await repo.patientsByIds(arriving.map((c) => c.patient))).map((p) => [sid(p._id), p]));
  return {
    bays: bays.map(presentBay),
    arriving: arriving.map((c) => ({ caseId: sid(c._id), patientId: people.get(sid(c.patient))?.patientId ?? null, patientName: people.get(sid(c.patient))?.fullName ?? null, severity: c.severity, status: c.status, acceptedAt: c.acceptedAt ?? null, hasAmbulance: Boolean(c.ambulance) })),
  };
}

export async function addBay(actor, v) {
  const h = hospitalOf(actor);
  if ((await repo.countBays(h)) >= MAX_BAYS) throw err(409, `An emergency department can have at most ${MAX_BAYS} bays`, 'BAY_LIMIT');
  try { await repo.createBay({ hospital: h, label: v.label }); } catch (e) {
    if (e?.code === 11000) throw invalid({ label: 'A bay with this label already exists' });
    throw e;
  }
  await audit(actor, 'ed.bay_create', v.label, {});
  return edBoard(actor);
}

export async function bayAction(actor, bayId, v) {
  const h = hospitalOf(actor);
  let update;
  let patient;
  if (v.action === 'occupy') {
    if (v.patientId) {
      patient = await repo.findPatientByPatientId(v.patientId);
      if (!patient) throw invalid({ patientId: 'No patient with that ID' });
    }
    update = { $set: { status: 'occupied', occupiedAt: new Date(), triageLevel: v.triageLevel, ...(v.complaint && { complaint: v.complaint }), ...(patient && { patient: patient._id, patientId: patient.patientId }) } };
  } else if (v.action === 'clear') {
    update = { $set: { status: 'cleaning' }, $unset: { patient: '', patientId: '', triageLevel: '', complaint: '', occupiedAt: '' } };
  } else {
    update = { $set: { status: 'vacant' } };
  }
  const bay = await repo.moveBay(h, bayId, BAY_MOVES[v.action], update);
  if (!bay) {
    const current = await repo.findBay(h, bayId);
    if (!current) throw err(404, 'Bay not found', 'NOT_FOUND');
    throw err(409, `That bay is ${current.status}`, 'BAY_STATE');
  }
  await audit(actor, `ed.bay_${v.action}`, bay.label, v.action === 'occupy' ? { patientId: bay.patientId, triageLevel: bay.triageLevel } : {});
  return edBoard(actor);
}

export async function removeBay(actor, bayId) {
  const h = hospitalOf(actor);
  if (!(await repo.deleteBay(h, bayId))) {
    if (!(await repo.findBay(h, bayId))) throw err(404, 'Bay not found', 'NOT_FOUND');
    throw err(409, 'Only a vacant bay can be removed', 'BAY_STATE');
  }
  await audit(actor, 'ed.bay_delete', sid(bayId), {});
  return edBoard(actor);
}

// ---- 90: emergency history ----
/**
 * Cases this hospital was alerted about, with how each ended for it. The patient's name is shown only for cases this hospital
 * accepted: a hospital that declined or never answered does not learn who the patient was.
 */
export async function history(actor, { status, page, limit }) {
  const h = hospitalOf(actor);
  const filter = historyFilter(h, status);
  const [rows, total] = await Promise.all([repo.listCases(filter, { skip: (page - 1) * limit, limit }), repo.countCases(filter)]);
  const mine = rows.filter((c) => c.hospital && sid(c.hospital) === sid(h));
  const people = new Map((await repo.patientsByIds(mine.map((c) => c.patient))).map((p) => [sid(p._id), p]));
  const items = rows.map((c) => {
    const note = (c.notifiedHospitals ?? []).find((n) => sid(n.hospital) === sid(h));
    const outcome = outcomeOf(c, h);
    const p = outcome === 'accepted' ? people.get(sid(c.patient)) : null;
    return {
      caseId: sid(c._id), outcome, severity: c.severity, source: c.source ?? null, status: c.status,
      patientId: p?.patientId ?? null, patientName: p?.fullName ?? null,
      alertedAt: note?.notifiedAt ?? null,
      respondedAfterSeconds: outcome === 'accepted' ? secondsBetween(note?.notifiedAt, c.acceptedAt) : null,
      openSeconds: secondsBetween(c.detectedAt, c.closedAt),
      cancellation: c.status === 'cancelled' ? (c.cancellation?.reason ?? null) : null,
    };
  });
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), simulated: true };
}
