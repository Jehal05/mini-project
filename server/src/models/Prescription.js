import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    medicines: [{ name: String, dose: String, frequency: String }],
    notes: String,
  },
  { timestamps: true },
);

export default mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
