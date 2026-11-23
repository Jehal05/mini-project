import mongoose from 'mongoose';

const { Schema } = mongoose;
export const BED_TYPES = ['general', 'icu', 'ccu'];
export const BED_STATUSES = ['vacant', 'occupied', 'cleaning', 'reserved'];

/** Feature 85: one physical bed. Status changes are conditional updates, so two staff cannot take the same bed. */
const bedSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    type: { type: String, enum: BED_TYPES, required: true },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    status: { type: String, enum: BED_STATUSES, default: 'vacant' },
    admission: { type: Schema.Types.ObjectId, ref: 'Admission' },
    statusChangedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
bedSchema.index({ hospital: 1, label: 1 }, { unique: true });
bedSchema.index({ hospital: 1, type: 1, status: 1 });
bedSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const Bed = mongoose.models.Bed || mongoose.model('Bed', bedSchema);
