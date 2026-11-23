import mongoose from 'mongoose';

const { Schema } = mongoose;

export const DOCUMENT_TYPES = Object.freeze(['ecg', 'lab_report', 'prescription', 'discharge_summary', 'imaging', 'insurance', 'other']);

/** Feature 19: metadata for an uploaded medical document. The file itself lives on disk under `storedName`. */
const documentSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    originalName: { type: String, required: true, maxlength: 120 }, // display only; never used in a path
    storedName: { type: String, required: true, unique: true }, // random; chosen by the server
    mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true },
  },
  { timestamps: { createdAt: 'uploadedAt', updatedAt: false } },
);

documentSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.storedName; // internal
    delete ret.__v;
    return ret;
  },
});

export const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
