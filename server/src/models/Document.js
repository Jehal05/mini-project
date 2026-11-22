import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    title: { type: String, required: true },
    filePath: String,
    mimeType: String,
  },
  { timestamps: true },
);

export default mongoose.models.Document || mongoose.model('Document', documentSchema);
