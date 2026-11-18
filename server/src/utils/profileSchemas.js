import { z } from 'zod';
import { BLOOD_GROUPS, CARDIAC_CONDITION_TYPES } from '../models/Patient.js';
import { DOCUMENT_TYPES } from '../models/Document.js';
import { normalizePhone } from './phone.js';

// Every body schema is strict: unknown keys (qrToken, consent, user, _id ...) are rejected, not ignored.
const text = (max, label = 'This field') => z.string().trim().min(1, `${label} is required`).max(max, `Use at most ${max} characters`);
const optText = (max) => z.string().trim().max(max, `Use at most ${max} characters`).optional().transform((v) => v || undefined);
const dateOnly = z.coerce.date({ error: 'Enter a valid date' }).refine((d) => d.getTime() <= Date.now() + 24 * 3600 * 1000, 'Date cannot be in the future').refine((d) => d.getFullYear() >= 1900, 'Enter a valid date');
const year = z.coerce.number({ error: 'Enter a year' }).int().min(1900, 'Enter a valid year').max(new Date().getFullYear(), 'Year cannot be in the future');

export const personalSchema = z.object({
  fullName: text(120, 'Name').min(2, 'Enter your full name').optional(),
  dateOfBirth: dateOnly.optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS, { error: `Choose one of: ${BLOOD_GROUPS.join(', ')}` }).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const preferencesSchema = z.object({
  email: z.boolean().optional(),
  webPush: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  locationConsent: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---- medical sections (features 13-18). `create` requires the key fields; `update` allows any subset.
const sectionShapes = {
  cardiacConditions: {
    type: z.enum(CARDIAC_CONDITION_TYPES, { error: `Choose one of: ${CARDIAC_CONDITION_TYPES.join(', ')}` }),
    year,
    notes: optText(300),
  },
  medicalConditions: { name: text(100, 'Condition'), notes: optText(300) },
  allergies: {
    allergen: text(100, 'Allergen'),
    reaction: optText(200),
    severity: z.enum(['mild', 'moderate', 'severe'], { error: 'Choose mild, moderate or severe' }),
  },
  medications: {
    drug: text(100, 'Drug'),
    dose: optText(50),
    frequency: optText(50),
    isBloodThinner: z.boolean().optional(),
  },
  hospitalizations: {
    hospital: text(120, 'Hospital'),
    admittedOn: dateOnly,
    dischargedOn: dateOnly.optional(),
    reason: optText(200),
  },
  familyHistory: {
    relative: text(60, 'Relative'),
    condition: text(100, 'Condition'),
    ageAtDiagnosis: z.coerce.number().int().min(0).max(120).optional(),
  },
};

export const SECTION_LIMIT = 50;
export const SECTIONS = Object.keys(sectionShapes);

const dischargeOrder = (v) => !v.admittedOn || !v.dischargedOn || v.dischargedOn >= v.admittedOn;
const dischargeMessage = { path: ['dischargedOn'], message: 'Discharge cannot be before admission' };

export const sectionCreateSchema = (section) => {
  const schema = z.object(sectionShapes[section]).strict();
  return section === 'hospitalizations' ? schema.refine(dischargeOrder, dischargeMessage) : schema;
};

export const sectionUpdateSchema = (section) => {
  const shape = Object.fromEntries(Object.entries(sectionShapes[section]).map(([k, v]) => [k, v.optional()]));
  const schema = z.object(shape).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
  return section === 'hospitalizations' ? schema.refine(dischargeOrder, dischargeMessage) : schema;
};

// ---- emergency contacts (feature 9)
const phone = z.string().trim().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
  return n;
});
const contactEmail = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Enter a valid email').max(254).optional());

export const contactCreateSchema = z.object({
  name: text(100, 'Name'),
  relation: text(60, 'Relation'),
  phone,
  email: contactEmail,
  priority: z.coerce.number().int().min(1).max(3).optional(),
}).strict();

export const contactUpdateSchema = z.object({
  name: text(100, 'Name').optional(),
  relation: text(60, 'Relation').optional(),
  phone: phone.optional(),
  email: contactEmail,
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const contactOrderSchema = z.object({
  order: z.array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid contact id')).min(1).max(3),
}).strict().refine((v) => new Set(v.order).size === v.order.length, { path: ['order'], message: 'Each contact once' });

// ---- documents and bystander report
export const documentUploadSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: `Choose one of: ${DOCUMENT_TYPES.join(', ')}` }),
}).strict();

export const bystanderReportSchema = z.object({
  latitude: z.number({ error: 'Location is required' }).min(-90).max(90),
  longitude: z.number({ error: 'Location is required' }).min(-180).max(180),
  accuracyMeters: z.number().min(0).max(1_000_000).optional(),
}).strict();

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
