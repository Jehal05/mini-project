import { Admission } from '../models/Admission.js';
import { DischargeSummary } from '../models/DischargeSummary.js';
import { Hospital } from '../models/Hospital.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';

/** A patient reads a discharge summary that is on their own history (feature 17 + 89). Scoped to the patient in the token. */
export async function ownDischargeSummary(req, res) {
  const summary = await DischargeSummary.findOne({ _id: req.params.summaryId, patient: req.patient._id });
  if (!summary) throw ApiError.notFound('Summary not found');
  const [admission, hospital] = await Promise.all([Admission.findById(summary.admission), Hospital.findById(summary.hospital).select('name address phone')]);
  await writeAudit({ req, action: 'record.view', resourceType: 'discharge_summary', resourceId: req.patient.patientId });
  res.json({
    summary: summary.toJSON(), finalized: true,
    context: { admittedAt: admission?.admittedAt, dischargedAt: admission?.dischargedAt, ward: admission?.ward, reason: admission?.reason, hospital: hospital?.toJSON(), patient: { fullName: req.patient.fullName, patientId: req.patient.patientId, bloodGroup: req.patient.bloodGroup } },
  });
}
