import { z } from 'zod';
import { normalizePhone } from './phone.js';

const text = (max, label = 'This field') => z.string().trim().min(1, `${label} is required`).max(max, `Use at most ${max} characters`);
const optText = (max) => z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().max(max, `Use at most ${max} characters`).optional());
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const optPhone = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().transform((v, ctx) => { const n = normalizePhone(v); if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' }); return n; }).optional(),
);
// Hospital lines are often landlines written with an STD code (020 2000 0000), so those are accepted too.
const hospitalPhone = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().transform((v, ctx) => {
    const compact = v.replace(/[\s().-]/g, '');
    const n = /^0\d{9,10}$/.test(compact) ? `+91${compact.slice(1)}` : normalizePhone(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
    return n;
  }).optional(),
);
const count = z.coerce.number({ error: 'Enter a number' }).int('Enter a whole number').min(0, 'Cannot be negative').max(500, 'Too large');
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const location = z.object({
  latitude: z.number({ error: 'Latitude must be a number' }).min(-90).max(90),
  longitude: z.number({ error: 'Longitude must be a number' }).min(-180).max(180),
}).strict();

const capabilities = z.object({
  cathLab: z.boolean(), cardiologist24x7: z.boolean(), icuBeds: count, ccuBeds: count, alsAmbulances: count,
}).partial().strict();

// ---- feature 81: hospital registration (central admin) ----
export const hospitalCreateSchema = z.object({
  name: text(160, 'Name'),
  address: text(300, 'Address'),
  city: optText(80),
  phone: hospitalPhone,
  location,
  capabilities: capabilities.optional(),
  admin: z.object({ name: text(120, 'Admin name'), email }).strict(),
}).strict();

export const hospitalUpdateSchema = z.object({
  name: text(160, 'Name'), address: text(300, 'Address'), city: optText(80), phone: hospitalPhone,
  location, capabilities, isActive: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to change');

/** What a hospital admin may change about their own hospital. */
export const ownHospitalUpdateSchema = z.object({ phone: hospitalPhone, capabilities }).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to change');

// ---- feature 83: doctors ----
export const doctorCreateSchema = z.object({
  fullName: text(120, 'Name'), specialization: text(80, 'Specialization'), isCardiologist: z.boolean().default(false),
  phone: optPhone, email: z.preprocess((v) => (v === '' ? undefined : v), email.optional()), onDuty: z.boolean().default(false),
}).strict();
export const doctorUpdateSchema = z.object({
  fullName: text(120, 'Name'), specialization: text(80, 'Specialization'), isCardiologist: z.boolean(), phone: optPhone, onDuty: z.boolean(), isActive: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to change');

// ---- feature 85: beds ----
const bedType = z.enum(['general', 'icu', 'ccu'], { error: 'Choose general, icu or ccu' });
export const bedCreateSchema = z.object({ type: bedType, label: text(30, 'Label') }).strict();
export const bedBulkSchema = z.object({ type: bedType, prefix: text(20, 'Prefix'), count: z.coerce.number().int().min(1, 'At least 1').max(50, 'At most 50 at a time') }).strict();
export const bedStatusSchema = z.object({ status: z.enum(['vacant', 'cleaning', 'reserved'], { error: 'Choose vacant, cleaning or reserved' }) }).strict();

// ---- feature 86: ED ----
export const edBayCreateSchema = z.object({ label: text(30, 'Label') }).strict();
export const edBayActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('occupy'),
    patientId: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toUpperCase().regex(/^HT-\d{4}-\d{4,}$/, 'Enter a patient ID like HT-2026-0001').optional()),
    triageLevel: z.coerce.number().int().min(1, 'Triage level is 1 to 5').max(5, 'Triage level is 1 to 5'),
    complaint: optText(200),
  }).strict(),
  z.object({ action: z.literal('clear') }).strict(),
  z.object({ action: z.literal('ready') }).strict(),
]);

// ---- feature 84: admission ----
export const admissionCreateSchema = z.object({
  patientId: z.string().trim().toUpperCase().regex(/^HT-\d{4}-\d{4,}$/, 'Enter a patient ID like HT-2026-0001'),
  bedId: objectId, doctorId: objectId, reason: optText(300), caseId: objectId.optional(),
}).strict();

// ---- feature 87: visit records ----
const vitalNum = (min, max, label) => z.coerce.number({ error: `${label} must be a number` }).min(min, `${label} looks too low`).max(max, `${label} looks too high`).optional();
export const noteSchema = z.object({ kind: z.literal('note'), text: text(4000, 'Note') }).strict();
export const vitalsSchema = z.object({
  kind: z.literal('vitals'),
  heartRate: vitalNum(20, 300, 'Heart rate'), systolic: vitalNum(40, 300, 'Systolic'), diastolic: vitalNum(20, 200, 'Diastolic'),
  spo2: vitalNum(30, 100, 'SpO2'), temperatureC: vitalNum(30, 45, 'Temperature'),
}).strict().refine((v) => ['heartRate', 'systolic', 'diastolic', 'spo2', 'temperatureC'].some((k) => v[k] !== undefined), { message: 'Enter at least one value' })
  .refine((v) => (v.systolic === undefined) === (v.diastolic === undefined), { path: ['diastolic'], message: 'Enter both blood pressure numbers' });
export const visitRecordSchema = z.discriminatedUnion('kind', [noteSchema, vitalsSchema]);
export const visitFileSchema = z.object({ kind: z.enum(['ecg', 'lab'], { error: 'Choose ecg or lab' }), title: optText(120) }).strict();

// ---- feature 88: prescriptions ----
export const prescriptionSchema = z.object({
  drug: text(120, 'Drug'), dose: text(60, 'Dose'), frequency: text(60, 'Frequency'), duration: text(60, 'Duration'),
  acknowledgeAllergy: z.boolean().default(false),
}).strict();

// ---- feature 89: discharge ----
export const dischargeSchema = z.object({
  diagnosis: text(500, 'Diagnosis'), treatment: text(2000, 'Treatment'), followUp: optText(500),
  medicines: z.array(z.object({ drug: text(120), dose: text(60), frequency: text(60), duration: text(60) }).strict()).max(30).default([]),
}).strict();

// ---- feature 90: history ----
export const historyQuerySchema = z.object({
  status: z.enum(['received', 'accepted', 'rejected', 'arrived', 'admitted', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
