import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Hospital, User } from '../src/models/index.js';
import { drainBackground } from '../src/utils/background.js';
import { outbox } from '../src/utils/mailer.js';

export const app = createApp();
export const PASSWORD = 'Heart1234';
export const CSRF = { 'X-Requested-With': 'healthtwin' };

export const agent = () => request.agent(app);

export async function makeHospital(name = 'Test Heart Hospital') {
  return Hospital.create({ name, location: { type: 'Point', coordinates: [73.85, 18.52] } });
}

let counter = 0;
export async function makeUser({ role = 'patient', hospital, password = PASSWORD, email, ...rest } = {}) {
  counter += 1;
  return User.create({
    name: `Test ${role} ${counter}`,
    email: email ?? `${role}${counter}@test.example`,
    role,
    passwordHash: await bcrypt.hash(password, 4),
    ...(hospital && { hospitalId: hospital._id }),
    ...rest,
  });
}

export const portalFor = { patient: 'patient', doctor: 'doctor', hospital_staff: 'staff', hospital_admin: 'staff', central_admin: 'admin' };

export async function loginAs(user, password = PASSWORD, ag = agent()) {
  const res = await ag.post(`/api/auth/login/${portalFor[user.role]}`).send({ identifier: user.email, password });
  return { res, agent: ag, token: res.body.accessToken };
}

export const validRegistration = (over = {}) => ({
  fullName: 'Rahul Test',
  email: 'rahul.test@example.com',
  password: PASSWORD,
  consent: { dataUse: true, location: true },
  ...over,
});

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** forgot-password replies first and sends the email afterwards; wait for that work to finish. */
export async function settleBackground() {
  await drainBackground();
}

export async function lastMailToken() {
  await drainBackground();
  return new URL(outbox.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
}
