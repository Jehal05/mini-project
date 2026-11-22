import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 88: a prescription written by a doctor during an admission. */
const prescriptionSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    admission: { type: Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    drug: { type: String, required: true, trim: true, maxlength: 120 },
    dose: { type: String, required: true, trim: true, maxlength: 60 },
    frequency: { type: String, required: true, trim: true, maxlength: 60 },
    duration: { type: String, required: true, trim: true, maxlength: 60 },
    prescribedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prescriberName: String,
    // Set when the drug matched a recorded allergy and the doctor chose to prescribe anyway.
    allergyOverride: { type: new Schema({ allergens: [String], acknowledgedAt: Date }, { _id: false }) },
  },
  { timestamps: true },
);
prescriptionSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const Prescription = mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
