import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));

import { requestReset, completeReset } from '../src/auth/reset.js';
import { createMailer } from '../src/services/mailer.js';
import { buildHealthSummary, trendOf } from '../src/services/healthSummary.js';
import { createDevNotifier } from '../src/emergency/notifier.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { addUser, resetAuth, resets, store } from './helpers/fakeAuthRepo.js';

const NEW = 'Brand#New2026x';
const quiet = { log() {}, error() {} };
let hash;
beforeAll(async () => { hash = await hashPassword('Old#Password1'); });
beforeEach(() => { resetAuth(); resets.length = 0; });
const sentTo = () => { const sent = []; return { sent, live: true, send: async (m) => { sent.push(m); } }; };
const tokenOf = (m) => /reset=([\w-]+)/.exec(m.text)[1];

describe('feature 7: forgot password', () => {
  it('sends a link, and the link changes the password once', async () => {
    const u = addUser({ email: 'a@x.test', passwordHash: hash });
    const mailer = sentTo();
    await requestReset('a@x.test', { mailer, logger: quiet });
    expect(mailer.sent).toHaveLength(1);
    expect(resets[0].tokenHash).not.toContain(tokenOf(mailer.sent[0])); // only a hash is stored
    await completeReset(tokenOf(mailer.sent[0]), NEW);
    expect(await verifyPassword(NEW, store.users.get(u._id).passwordHash)).toBe(true);
    await expect(completeReset(tokenOf(mailer.sent[0]), NEW)).rejects.toMatchObject({ code: 'RESET_INVALID' });
  });
  it('says nothing about unknown or inactive accounts', async () => {
    addUser({ email: 'off@x.test', isActive: false });
    const mailer = sentTo();
    await requestReset('nobody@x.test', { mailer, logger: quiet });
    await requestReset('off@x.test', { mailer, logger: quiet });
    await requestReset(42, { mailer, logger: quiet });
    expect(mailer.sent).toHaveLength(0);
  });
  it('a newer link replaces the older one', async () => {
    addUser({ email: 'a@x.test', passwordHash: hash });
    const mailer = sentTo();
    await requestReset('a@x.test', { mailer, logger: quiet });
    await requestReset('a@x.test', { mailer, logger: quiet });
    await expect(completeReset(tokenOf(mailer.sent[0]), NEW)).rejects.toMatchObject({ code: 'RESET_INVALID' });
    await completeReset(tokenOf(mailer.sent[1]), NEW);
  });
  it('expires after 15 minutes', async () => {
    addUser({ email: 'a@x.test', passwordHash: hash });
    const mailer = sentTo();
    const t0 = Date.now();
    await requestReset('a@x.test', { mailer, logger: quiet, now: t0 });
    await expect(completeReset(tokenOf(mailer.sent[0]), NEW, { now: t0 + 16 * 60000 })).rejects.toMatchObject({ code: 'RESET_INVALID' });
    await completeReset(tokenOf(mailer.sent[0]), NEW, { now: t0 + 14 * 60000 });
  });
  it('rejects a weak password without using up the link, and signs everyone out on success', async () => {
    const u = addUser({ email: 'a@x.test', passwordHash: hash });
    store.tokens.push({ _id: 't1', user: u._id, family: 'f', tokenHash: 'h' });
    const mailer = sentTo();
    await requestReset('a@x.test', { mailer, logger: quiet });
    await expect(completeReset(tokenOf(mailer.sent[0]), 'weak')).rejects.toThrow();
    await completeReset(tokenOf(mailer.sent[0]), NEW);
    expect(store.tokens[0].revokedAt).toBeTruthy();
  });
  it('prints the link when no email service is set up', async () => {
    addUser({ email: 'a@x.test', passwordHash: hash });
    const lines = [];
    await requestReset('a@x.test', { mailer: createMailer({ config: {}, logger: { log: (l) => lines.push(l) } }), logger: { log: (l) => lines.push(l) } });
    expect(lines.some((l) => l.includes('?reset='))).toBe(true);
  });
});

describe('feature 47: email through an HTTP API', () => {
  const spy = (impl = async () => ({ ok: true, status: 200 })) => { const calls = []; const fn = async (...a) => { calls.push(a); return impl(...a); }; fn.calls = calls; return fn; };
  it('only logs by default', async () => {
    const lines = []; const fetchImpl = spy();
    const r = await createMailer({ config: {}, fetchImpl, logger: { log: (l) => lines.push(l) } }).send({ to: 'a@x.test', subject: 's', text: 't' });
    expect(r.delivered).toBe(false); expect(fetchImpl.calls).toHaveLength(0); expect(lines[0]).toContain('nothing sent');
  });
  it('posts to the API with the key when configured, and fails loudly', async () => {
    const config = { emailApiUrl: 'https://mail.example/send', emailApiKey: 'k', emailFrom: 'HT <a@b.c>' };
    const fetchImpl = spy();
    expect((await createMailer({ config, fetchImpl }).send({ to: 'a@x.test', subject: 's', text: 't' })).delivered).toBe(true);
    const [url, init] = fetchImpl.calls[0];
    expect(url).toBe(config.emailApiUrl); expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('HT <a@b.c>'); expect(body.to).toEqual(['a@x.test']); expect(body.subject).toBe('s');
    await expect(createMailer({ config, fetchImpl: async () => ({ ok: false, status: 500 }) }).send({ to: 'a@x.test', subject: 's', text: 't' })).rejects.toThrow('500');
  });
  it('contact alerts use the mailer only when it is live', async () => {
    const live = spy(); const off = spy();
    await createDevNotifier({ logger: quiet, mailer: { live: true, send: live } }).email({ to: 'c@x.test', subject: 'S', text: 'T' });
    expect(live.calls[0][0]).toEqual({ to: 'c@x.test', subject: 'S', text: 'T' });
    await createDevNotifier({ logger: quiet, mailer: { live: false, send: off } }).email({ to: 'c@x.test', text: 'T' });
    expect(off.calls).toHaveLength(0);
  });
});

describe('feature 94: health summary', () => {
  const patient = { cardiacConditions: [{ type: 'stent', year: 2021 }], allergies: [{ allergen: 'Penicillin', severity: 'severe' }], medications: [{ drug: 'Warfarin', dose: '5 mg', isBloodThinner: true }] };
  it('flags abnormal vitals against the normal range and the patient baseline', () => {
    const s = buildHealthSummary({ patient, latest: { hr: 128, sys: 120, dia: 80, spo2: 97, temp: 36.8, rr: 16 }, baseline: { hr: 76 } });
    expect(s.text).toContain('Heart rate 128 BPM (critical');
    expect(s.text).toContain('+52 from the patient');
    expect(s.text).toContain('stent (2021)');
    expect(s.text).toContain('Penicillin (severe)');
    expect(s.text).toContain('Warfarin 5 mg [blood thinner]');
  });
  it('says so when everything is normal, or nothing is recorded', () => {
    expect(buildHealthSummary({ latest: { hr: 70, sys: 120, dia: 80, spo2: 98, temp: 36.8, rr: 16 } }).text).toContain('all in the normal range');
    const empty = buildHealthSummary({});
    expect(empty.text).toContain('No vital signs');
    expect(empty.text).toContain('Allergies: none recorded');
  });
  it('trend needs enough readings', () => {
    expect(trendOf([70, 71], 'hr')).toBeNull();
    expect(trendOf([70, 70, 70, 90, 92, 94], 'hr')).toBe('rising');
    expect(trendOf([90, 90, 90, 70, 70, 70], 'hr')).toBe('falling');
    expect(trendOf([70, 71, 70, 71, 70, 71], 'hr')).toBe('steady');
  });
});
