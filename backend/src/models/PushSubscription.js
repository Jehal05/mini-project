import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A browser's Web Push subscription (features 47, 61). Two kinds:
 *   staff    a signed-in hospital user's device, so a closed tab still gets "a case needs a response"
 *   contact  an emergency contact's device, saved from the status link they were sent, so later alerts and
 *            updates reach them without opening anything
 * The endpoint is unique, so subscribing twice from one browser just updates the row.
 */
const pushSubscriptionSchema = new Schema(
  {
    kind: { type: String, enum: ['staff', 'contact'], required: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2000 },
    keys: { p256dh: { type: String, required: true, maxlength: 300 }, auth: { type: String, required: true, maxlength: 100 } },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    contactId: { type: Schema.Types.ObjectId },
    caseId: { type: Schema.Types.ObjectId, ref: 'EmergencyCase', index: true },
  },
  { timestamps: true },
);
pushSubscriptionSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; delete r.keys; return r; } });

export const PushSubscription = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
