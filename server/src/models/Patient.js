// Patient record (features 1, 8-20). Phase 15 fills in the medical profile; the shape other phases use (fullName, dateOfBirth, phone, address) is unchanged.
import mongoose from 'mongoose';
import { BLOOD_GROUPS } from '../patients/constants.js';

export { BLOOD_GROUPS, CARDIAC_TYPES } from '../patients/constants.js';

const { Schema } = mongoose;

// Explicit sub-schemas: a literal `type` key inside an array would be read as a Mongoose type declaration.
const cardiacSchema = new Schema({ type: { type: String, trim: true }, year: Number, notes: String });
const contactSchema = new Schema({
  name: { type: String, required: true, trim: true },
  relation: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  priority: { type: Number, min: 1, max: 3, required: true },
});

const patientSchema = new Schema(
  {
    patientId: { type: String, match: /^HT-\d{4}-\d{4,}$/, unique: true, sparse: true }, // feature 10 (older demo rows may not have one yet)
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    phone: String,
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    photoFile: String, // stored name of the profile photo, never a client-chosen path
    bloodGroup: { type: String, enum: BLOOD_GROUPS },

    consent: { location: { type: Boolean, default: false }, dataUse: { type: Boolean, default: true }, givenAt: { type: Date, default: Date.now } },
    notificationPreferences: { email: { type: Boolean, default: true }, webPush: { type: Boolean, default: true }, whatsapp: { type: Boolean, default: true } },

    emergencyContacts: { type: [contactSchema], validate: [(v) => v.length <= 3, 'At most 3 emergency contacts'], default: [] },
    cardiacConditions: [cardiacSchema],
    medicalConditions: [{ name: { type: String, trim: true }, notes: String }],
    allergies: [{ allergen: { type: String, trim: true }, reaction: String, severity: { type: String, enum: ['mild', 'moderate', 'severe'] } }],
    medications: [{ drug: { type: String, trim: true }, dose: String, frequency: String, isBloodThinner: { type: Boolean, default: false } }],
    hospitalizations: [{ hospital: String, admittedOn: Date, dischargedOn: Date, reason: String, dischargeSummaryId: Schema.Types.ObjectId }],
    familyHistory: [{ relative: { type: String, trim: true }, condition: { type: String, trim: true }, ageAtDiagnosis: Number }],

    // Feature 20: the QR holds only a URL with this random token, never medical data.
    qrToken: { type: String, unique: true, sparse: true },
    qrRotatedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema);
