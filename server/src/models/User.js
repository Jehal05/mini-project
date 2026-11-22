// OWNER: Jehal (auth and roles). Minimal stub: extend, don't rename existing fields.
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['patient', 'hospital', 'ambulance', 'admin'], default: 'patient' },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

export default mongoose.models.User || mongoose.model('User', userSchema);
