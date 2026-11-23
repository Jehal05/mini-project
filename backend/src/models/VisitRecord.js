import mongoose from 'mongoose';

const { Schema } = mongoose;
export const VISIT_KINDS = ['note', 'vitals', 'ecg', 'lab'];

/** Feature 87: an entry in the hospital's record of the visit: a note, a set of in-hospital vitals, or an uploaded ECG / lab file. */
const visitRecordSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    admission: { type: Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    kind: { type: String, enum: VISIT_KINDS, required: true },
    text: { type: String, trim: true, maxlength: 4000 },
    vitals: {
      heartRate: Number, systolic: Number, diastolic: Number, spo2: Number, temperatureC: Number,
    },
    title: { type: String, trim: true, maxlength: 120 },
    storedName: { type: String, select: false },
    originalName: String,
    mimeType: String,
    size: Number,
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
  },
  { timestamps: true },
);
visitRecordSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; delete r.storedName; r.hasFile = Boolean(r.originalName); return r; } });

export const VisitRecord = mongoose.models.VisitRecord || mongoose.model('VisitRecord', visitRecordSchema);
