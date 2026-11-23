import mongoose from 'mongoose';

const { Schema } = mongoose;

// Written by a doctor during an admission. `allergyOverride` is set when the drug matched a recorded allergy and the doctor confirmed.
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
    allergyOverride: { type: new Schema({ allergens: [String], acknowledgedAt: Date }, { _id: false }) },
  },
  { timestamps: true },
);

export default mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
