// OWNER: Daksh (case creation). Minimal stub. Puneet's modules (hospital notification, ambulance)
// read and update `status`, `hospital`, `ambulance` and `timeline`, so keep those names stable.
import mongoose from 'mongoose';

const emergencyCaseSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    status: {
      type: String,
      // 'pending' = hospitals are being searched for (Daksh's "searching"). Phase 7 adds the three around it.
      enum: ['awaiting_confirmation', 'pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived', 'closed', 'unresolved', 'cancelled'],
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
        actorRole: String, // Phase 7: who did it (patient, system, ...)
        data: mongoose.Schema.Types.Mixed, // Phase 7: small extra facts for the entry
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
    // Phase 5-6: how the case started, and the detection that opened it (Daksh's detection engine).
    source: { type: String, enum: ['demo', 'auto_detection', 'manual_sos', 'bystander_qr'] },
    detectionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Detection' },
    // ---- Phase 7 (SOS, Daksh's emergency module) ----
    escalation: {
      _id: false,
      confirmDeadline: Date, // the 10 s "Are you okay?" deadline; the server owns this clock
      round: Number, // 1..3 search rounds once sent
      radiusKm: Number,
      roundStartedAt: Date,
      autoSent: Boolean,
      centralAdminAlertedAt: Date,
    },
    symptoms: {
      _id: false,
      chestPain: Boolean,
      upperBodyPain: Boolean,
      shortnessOfBreath: Boolean,
      nauseaOrLightheaded: Boolean,
      answeredAt: Date,
      noResponse: Boolean,
    },
    // Where the patient is. `location` (above) stays the GeoJSON point the hospital ranking reads; this is its detail.
    locationInfo: { _id: false, accuracyM: Number, source: { type: String, enum: ['gps', 'manual', 'registered_address', 'bystander', 'demo_default'] }, address: String, updatedAt: Date },
    cancellation: { _id: false, reason: String, note: String, cancelledAt: Date, afterAcceptance: Boolean },
    acknowledgements: [{ _id: false, recipientType: String, recipientId: String, name: String, seenAt: Date }],
    contactAlerts: [
      {
        _id: false,
        name: String,
        relation: String,
        phone: String,
        email: String,
        channels: [String],
        statusLinkToken: String, // 128-bit random; the family status link is the only credential
        whatsappLink: String,
        sentAt: Date,
      },
    ],
    // Phase 12: true for the generated demo history (npm run seed:demo-history). Never set for real cases.
    simulatedHistory: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

emergencyCaseSchema.index({ 'contactAlerts.statusLinkToken': 1 }, { sparse: true });

// One live case per patient (Phase 7). Two SOS presses, or an SOS during a Level 3, race on this index and the loser reads the winner.
// Demo cases (source 'demo') are left out so the demo button can still be pressed repeatedly. `$in` inside a partial index needs MongoDB 6.0+;
// if the index cannot be built (older MongoDB, or existing duplicates) the app still starts and the single-process atomic upsert still holds.
export const ONE_LIVE_CASE_INDEX = 'one_live_case_per_patient';
emergencyCaseSchema.index(
  { patient: 1 },
  {
    unique: true,
    name: ONE_LIVE_CASE_INDEX,
    partialFilterExpression: {
      status: { $in: ['awaiting_confirmation', 'pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived', 'unresolved'] },
      source: { $in: ['auto_detection', 'manual_sos', 'bystander_qr'] },
    },
  },
);

export default mongoose.models.EmergencyCase || mongoose.model('EmergencyCase', emergencyCaseSchema);
