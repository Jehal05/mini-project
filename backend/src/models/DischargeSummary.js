import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 89: one summary per admission. Once finalized it is never changed. */
const medicineSchema = new Schema({ drug: String, dose: String, frequency: String, duration: String }, { _id: false });

const dischargeSummarySchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    admission: { type: Schema.Types.ObjectId, ref: 'Admission', required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    diagnosis: { type: String, required: true, trim: true, maxlength: 500 },
    treatment: { type: String, required: true, trim: true, maxlength: 2000 },
    medicines: { type: [medicineSchema], default: [] },
    followUp: { type: String, trim: true, maxlength: 500 },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finalizedByName: String,
    finalizedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
dischargeSummarySchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const DischargeSummary = mongoose.models.DischargeSummary || mongoose.model('DischargeSummary', dischargeSummarySchema);
