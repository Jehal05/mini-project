import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 84: a patient admitted to a bed under a doctor. Links to the emergency case when there is one. */
const admissionSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientId: { type: String, required: true },
    bed: { type: Schema.Types.ObjectId, ref: 'Bed', required: true },
    ward: { type: String, enum: ['general', 'icu', 'ccu'], required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospitalCase: { type: Schema.Types.ObjectId, ref: 'HospitalCase' },
    emergencyCaseId: String,
    reason: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: ['admitted', 'discharged'], default: 'admitted' },
    admittedAt: { type: Date, default: Date.now },
    admittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dischargedAt: Date,
  },
  { timestamps: true },
);
// A patient can be in only one hospital bed at a time; this index makes a double admission impossible even under parallel requests.
admissionSchema.index({ patient: 1 }, { unique: true, partialFilterExpression: { status: 'admitted' } });
admissionSchema.index({ hospital: 1, status: 1, admittedAt: -1 });
admissionSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const Admission = mongoose.models.Admission || mongoose.model('Admission', admissionSchema);
