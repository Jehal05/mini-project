import mongoose from 'mongoose';

import { DOCUMENT_TYPES } from '../patients/constants.js';

export { DOCUMENT_TYPES };

// Feature 19: metadata for an uploaded medical document. The file lives on disk under `storedName` (random, server-chosen).
const documentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    originalName: { type: String, required: true, maxlength: 120 }, // display only, never used in a path
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true },
  },
  { timestamps: { createdAt: 'uploadedAt', updatedAt: false } },
);

export default mongoose.models.Document || mongoose.model('Document', documentSchema);
