// Pure generator for SIMULATED case history (feature 96 demo data). Deterministic: the same seed gives the same history,
// so re-running the seed script replaces the old history with identical data instead of adding more.
const MIN = 60000;
const DAY = 86400000;

// Small seeded random number generator (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);
const REASONS = ['no_beds', 'no_cardiologist', 'cath_lab_busy', 'other'];

// hospitals: [{ _id, coords }], ambulances: [{ _id, homeHospital }]. Ids are passed through untouched.
export function buildHistory({ hospitals, ambulances, patientId, now = Date.now(), count = 60, days = 30, seed = 20261123, newId }) {
  const r = rng(seed);
  const cases = [];
  const trips = [];

  for (let i = 0; i < count; i += 1) {
    const caseId = newId();
    const detected = now - days * DAY + Math.floor(((i + r()) / count) * days * DAY);
    const sevRoll = r();
    const severity = sevRoll < 0.35 ? 'critical' : sevRoll < 0.7 ? 'high' : sevRoll < 0.9 ? 'moderate' : 'low';
    const riskScore = Math.round({ critical: between(r, 75, 98), high: between(r, 55, 80), moderate: between(r, 30, 60), low: between(r, 10, 35) }[severity]);

    const ranked = [...hospitals].sort(() => r() - 0.5);
    const notifiedList = ranked.slice(0, 3);
    const timeline = [{ event: 'detected', at: new Date(detected) }];
    const notifiedHospitals = [];
    const rejectedHospitals = [];
    const timedOutHospitals = [];
    let t = detected + 5000;
    let accepter = null;
    let acceptedAt = null;
    let allHospitalsBusy = false;

    for (const h of notifiedList) {
      notifiedHospitals.push({ hospital: h._id, notifiedAt: new Date(t) });
      timeline.push({ event: 'hospital_notified', hospital: h._id, at: new Date(t) });
      const roll = r();
      if (roll < 0.62) {
        t += Math.floor(between(r, 20, 110) * 1000);
        accepter = h;
        acceptedAt = t;
        timeline.push({ event: 'accepted', hospital: h._id, at: new Date(t) });
        break;
      }
      if (roll < 0.87) {
        t += Math.floor(between(r, 15, 90) * 1000);
        rejectedHospitals.push(h._id);
        timeline.push({ event: 'rejected', hospital: h._id, detail: pick(r, REASONS), at: new Date(t) });
      } else {
        t += 120000;
        timedOutHospitals.push(h._id);
        timeline.push({ event: 'no_answer', hospital: h._id, at: new Date(t) });
      }
    }

    const c = {
      _id: caseId, patient: patientId, status: 'closed', severity, riskScore,
      location: { type: 'Point', coordinates: [73.8 + r() * 0.15, 18.45 + r() * 0.18] },
      detectedAt: new Date(detected), alertedAt: new Date(detected + 5000), notifiedHospitals, rejectedHospitals, timedOutHospitals,
      candidateHospitals: ranked.map((h) => h._id), timeline, allHospitalsBusy: false, simulatedHistory: true,
    };

    if (!accepter) {
      allHospitalsBusy = true;
      c.allHospitalsBusy = true;
      timeline.push({ event: 'all_hospitals_busy', at: new Date(t) });
      c.closedAt = new Date(t + MIN);
      cases.push(c);
      continue;
    }

    c.hospital = accepter._id;
    c.acceptedAt = new Date(acceptedAt);
    const free = ambulances.filter((a) => String(a.homeHospital) === String(accepter._id));
    if (!free.length || r() < 0.06) {
      timeline.push({ event: 'no_ambulance_available', hospital: accepter._id, at: new Date(acceptedAt + 1000) });
      c.closedAt = new Date(acceptedAt + 30 * MIN);
      cases.push(c);
      continue;
    }

    const amb = pick(r, free);
    const dispatch = acceptedAt + Math.floor(between(r, 30, 150) * 1000);
    const atPatient = dispatch + Math.floor(between(r, 4, 14) * MIN);
    const onBoard = atPatient + Math.floor(between(r, 4, 14) * MIN); // some scenes run over the 10 minute target
    const atHospital = onBoard + Math.floor(between(r, 6, 20) * MIN);
    const contact = atHospital + Math.floor(between(r, 2, 35) * MIN);
    const treatment = contact + Math.floor(between(r, 15, 100) * MIN);

    c.ambulance = amb._id;
    c.ambulanceAtPatientAt = new Date(atPatient);
    c.patientOnBoardAt = new Date(onBoard);
    c.firstMedicalContactAt = new Date(contact);
    c.treatmentStartedAt = new Date(treatment);
    c.preparation = { cathLabTeamAlerted: { done: true, at: new Date(acceptedAt + Math.floor(between(r, 3, 40) * MIN)) } };
    c.closedAt = new Date(treatment + 30 * MIN);
    timeline.push(
      { event: 'ambulance_dispatched', hospital: accepter._id, at: new Date(dispatch) },
      { event: 'patient_on_board', hospital: accepter._id, at: new Date(onBoard) },
      { event: 'arrived_at_hospital', hospital: accepter._id, at: new Date(atHospital) },
    );
    cases.push(c);

    trips.push({
      emergencyCase: caseId, patient: patientId, ambulance: amb._id, hospital: accepter._id, stage: 'at_hospital',
      stageTimes: {
        en_route: new Date(dispatch), at_patient: new Date(atPatient), patient_on_board: new Date(onBoard),
        en_route_to_hospital: new Date(onBoard + 1000), at_hospital: new Date(atHospital),
      },
      legs: [], endedAt: new Date(atHospital),
    });
  }
  return { cases, trips };
}
