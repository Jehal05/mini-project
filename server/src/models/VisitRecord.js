import mongoose from 'mongoose';

const { Schema } = mongoose;

// An entry in the hospital's record of a stay: a note, or one set of in-hospital vitals.
const visitRecordSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    admission: { type: Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    kind: { type: String, enum: ['note', 'vitals'], required: true },
    text: { type: String, trim: true, maxlength: 4000 },
    vitals: { heartRate: Number, systolic: Number, diastolic: Number, spo2: Number, temperatureC: Number },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
  },
  { timestamps: true },
);

export default mongoose.models.VisitRecord || mongoose.model('VisitRecord', visitRecordSchema);
