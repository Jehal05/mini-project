import mongoose from 'mongoose';

const { Schema } = mongoose;

export const BLOOD_GROUPS = Object.freeze(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
export const CARDIAC_CONDITION_TYPES = Object.freeze(['heart_attack', 'stent', 'bypass', 'arrhythmia', 'heart_failure', 'other']);

// Explicit sub-schema: a literal object with a `type` key inside an array would be read as a type declaration.
const cardiacConditionSchema = new Schema({ type: { type: String, trim: true }, year: Number, notes: String });

const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    relation: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    priority: { type: Number, min: 1, max: 3, required: true },
  },
  { _id: true },
);

/**
 * Patient record (Jehal owns this contract; Daksh's VitalReading/EmergencyCase and Puneet's hospital
 * flow reference it by _id or patientId). Phase 1 fills identity + consent; the medical arrays are
 * defined now so the shape never changes under teammates, and Phase 2 builds their screens.
 */
const patientSchema = new Schema(
  {
    patientId: { type: String, required: true, unique: true, match: /^HT-\d{4}-\d{4,}$/ }, // feature 10
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },

    // Module 2 - personal information (Phase 2)
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    photoUrl: String,
    bloodGroup: { type: String, enum: BLOOD_GROUPS },

    // Feature 1: consent captured at sign-up.
    consent: {
      location: { type: Boolean, default: false },
      dataUse: { type: Boolean, required: true },
      givenAt: { type: Date, default: Date.now },
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      webPush: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
    },

    emergencyContacts: {
      type: [emergencyContactSchema],
      validate: [(v) => v.length <= 3, 'A patient can have at most 3 emergency contacts'],
      default: [],
    },

    // Module 2 - medical profile (Phase 2)
    cardiacConditions: [cardiacConditionSchema],
    medicalConditions: [{ name: { type: String, trim: true }, notes: String }],
    allergies: [{ allergen: { type: String, trim: true }, reaction: String, severity: { type: String, enum: ['mild', 'moderate', 'severe'] } }],
    medications: [{ drug: { type: String, trim: true }, dose: String, frequency: String, isBloodThinner: { type: Boolean, default: false } }],
    hospitalizations: [{ hospital: String, admittedOn: Date, dischargedOn: Date, reason: String, dischargeSummaryId: Schema.Types.ObjectId }],
    familyHistory: [{ relative: { type: String, trim: true }, condition: { type: String, trim: true }, ageAtDiagnosis: Number }],

    // Monitoring and first aid need to tell "no allergies" apart from "never filled in". An empty list alone
    // cannot, so a list counts as known only once the patient added something or confirmed "none".
    listsConfirmed: { allergies: { type: Boolean, default: false }, medications: { type: Boolean, default: false } },
    fitnessLevel: { type: String, enum: ['low', 'normal', 'high'] },

    // Feature 20: the QR holds only a URL with this random token, never medical data.
    qrToken: { type: String, unique: true, sparse: true },
    qrRotatedAt: Date,
  },
  { timestamps: true },
);

patientSchema.virtual('age').get(function age() {
  if (!this.dateOfBirth) return undefined;
  const now = new Date();
  let years = now.getFullYear() - this.dateOfBirth.getFullYear();
  const beforeBirthday =
    now.getMonth() < this.dateOfBirth.getMonth() ||
    (now.getMonth() === this.dateOfBirth.getMonth() && now.getDate() < this.dateOfBirth.getDate());
  if (beforeBirthday) years -= 1;
  return years;
});

patientSchema.set('toJSON', { virtuals: true, transform: (_d, ret) => { delete ret.__v; delete ret.id; return ret; } });

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
