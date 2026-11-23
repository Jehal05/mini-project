import mongoose from 'mongoose';

// One stay in a hospital. The trip code creates a row when an ambulance arrives (no bed yet); staff then give it a bed and a doctor.
const admissionSchema = new mongoose.Schema(
  {
    emergencyCase: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase' },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientId: String, // readable id such as HT-2026-0001
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    ward: { type: String, enum: ['ICU', 'CCU', 'ED', 'GENERAL'] },
    reason: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: ['admitted', 'discharged'], default: 'admitted' },
    admittedAt: { type: Date, default: Date.now },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dischargedAt: Date,
  },
  { timestamps: true },
);
// One open stay per patient, even if two requests arrive together.
admissionSchema.index({ patient: 1 }, { unique: true, partialFilterExpression: { status: 'admitted' } });
admissionSchema.index({ hospital: 1, status: 1, admittedAt: -1 });

export default mongoose.models.Admission || mongoose.model('Admission', admissionSchema);
