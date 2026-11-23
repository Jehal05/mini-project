import mongoose from 'mongoose';

// Web push subscription of a hospital staff browser (feature 61).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  },
  { timestamps: true },
);

export default mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
