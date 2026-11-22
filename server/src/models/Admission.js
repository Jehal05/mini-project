import mongoose from 'mongoose';

const admissionSchema = new mongoose.Schema(
  {
    emergencyCase: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    admittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.models.Admission || mongoose.model('Admission', admissionSchema);
