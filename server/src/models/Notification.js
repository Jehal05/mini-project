import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ['user', 'hospital', 'patient'], required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    event: { type: String, required: true },
    message: String,
    emergencyCase: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase' },
    readAt: Date,
  },
  { timestamps: true },
);

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
