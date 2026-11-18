import { z } from 'zod';
import { normalizePhone } from './phone.js';

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');


export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Enter a valid email').max(254).optional()),
    phone: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().transform((v, ctx) => {
        const n = normalizePhone(v);
        if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
        return n;
      }).optional(),
    ),
    password: passwordSchema,
    consent: z.object({
      dataUse: z.literal(true, { error: 'You must agree to data use to create an account' }),
      location: z.boolean().default(false),
    }),
  })
  .refine((v) => v.email || v.phone, { path: ['email'], message: 'Enter an email or a phone number' });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});

export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') });

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const auditQuerySchema = z.object({
  actor: z.string().trim().max(100).optional(),
  role: z.enum(['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'central_admin']).optional(),
  action: z.string().trim().max(100).optional(),
  resourceType: z.string().trim().max(60).optional(),
  resourceId: z.string().trim().max(100).optional(),
  hospitalId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid hospital id').optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
