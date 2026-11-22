// OWNER: Daksh (case creation). Minimal stub. Puneet's modules (hospital notification, ambulance)
// read and update `status`, `hospital`, `ambulance` and `timeline`, so keep those names stable.
import mongoose from 'mongoose';

const emergencyCaseSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived', 'closed'],
      default: 'pending',
      index: true,
    },
    severity: { type: String, enum: ['low', 'moderate', 'high', 'critical'], default: 'high' },
    riskScore: Number,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance' },
    timeline: [
      {
        _id: false,
        event: String,
        at: { type: Date, default: Date.now },
        hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }, // Phase 9: which hospital
        detail: String, // Phase 9: e.g. a rejection reason
      },
    ],
    // Added for Phase 8 hospital alternatives (feature 60, see services/alternatives.js).
    candidateHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }], // ranked order
    notifiedHospitals: [
      {
        _id: false,
        hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
        notifiedAt: { type: Date, default: Date.now },
      },
    ],
    rejectedHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],

    // ---- Added for Phase 9 (hospital notification, services/notifications.js and caseService.js) ----
    detectedAt: { type: Date, default: Date.now }, // when the case was created
    alertedAt: Date, // first hospital notified; starts the 30 min cath lab target (feature 105)
    timedOutHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }], // notified, no answer in time, each handled once
    allHospitalsBusy: { type: Boolean, default: false }, // every candidate rejected or silent
    acceptedAt: Date,
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }, // feature 68
    preparation: {
      // feature 69 checklist, each item timestamped when toggled
      edBayReady: { _id: false, done: { type: Boolean, default: false }, at: Date },
      cathLabTeamAlerted: { _id: false, done: { type: Boolean, default: false }, at: Date },
      ccuBedReserved: { _id: false, done: { type: Boolean, default: false }, at: Date },
      ecgReady: { _id: false, done: { type: Boolean, default: false }, at: Date },
    },
    // Golden-hour milestones (feature 105). Phase 10 sets the two ambulance ones.
    ambulanceAtPatientAt: Date,
    patientOnBoardAt: Date,
    firstMedicalContactAt: Date,
    treatmentStartedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.models.EmergencyCase || mongoose.model('EmergencyCase', emergencyCaseSchema);
