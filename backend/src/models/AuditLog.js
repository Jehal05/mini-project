import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 98. Append-only: model-level hooks reject every update and delete path. */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' }, // absent for failed logins by unknown users
    actorLabel: String, // email/phone used, or the user's name
    role: String,
    action: { type: String, required: true, index: true }, // e.g. auth.login, record.view, threshold.update
    resourceType: { type: String, index: true },
    resourceId: { type: String, index: true },
    hospitalId: { type: Schema.Types.ObjectId, index: true },
    outcome: { type: String, enum: ['success', 'failure', 'denied'], default: 'success' },
    ip: String,
    meta: Schema.Types.Mixed, // small, non-sensitive context only (never passwords or tokens)
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: true },
);

auditLogSchema.index({ createdAt: -1 });

const IMMUTABLE_MESSAGE = 'Audit logs are append-only';
const blocked = () => { throw new Error(IMMUTABLE_MESSAGE); };

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(op, blocked);
}
auditLogSchema.pre('save', function onlyNew() {
  if (!this.isNew) throw new Error(IMMUTABLE_MESSAGE);
});
auditLogSchema.pre('bulkWrite', blocked);

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
