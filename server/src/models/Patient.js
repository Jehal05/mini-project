// OWNER: Jehal (registration, medical profile). Minimal stub: add fields as features 8-20 land.
import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: Date,
    phone: String,
    address: String,
  },
  { timestamps: true },
);

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema);
