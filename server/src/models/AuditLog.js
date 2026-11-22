import mongoose from 'mongoose';

// Used for access logging, e.g. which hospital viewed a patient's record during a case (feature 63).
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resourceType: String,
    resourceId: mongoose.Schema.Types.ObjectId,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
