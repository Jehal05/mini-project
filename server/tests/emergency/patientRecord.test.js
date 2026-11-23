import { describe, it, expect } from 'vitest';
import { emergencyRecord, emergencyContacts } from '../../src/emergency/patientRecord.js';
import { aspirinAdvice, buildFirstAid } from '../../../shared/firstaid.js';
import { S, ACTIVE, LIVE, PRE_ACCEPT, POST_ACCEPT } from '../../src/emergency/status.js';
import { locationView, timelineView } from '../../src/emergency/service.js';

const rahul = {
  _id: 'p1', patientId: 'HT-2026-0001', fullName: 'Rahul Sharma',
  allergies: [], medications: [], medicalConditions: [{ name: 'Hypertension' }],
  notificationPreferences: { email: false, whatsapp: true },
  emergencyContacts: [
    { name: 'B', relation: 'friend', phone: '+919800000002', email: 'b@x.test', priority: 2 },
    { name: 'A', relation: 'wife', phone: '+919800000001', email: 'a@x.test', priority: 1 },
  ],
};

describe('what the SOS code reads from our Patient', () => {
  it('maps the name and code', () => {
    const r = emergencyRecord(rahul);
    expect(r.name).toBe('Rahul Sharma');
    expect(r.patientCode).toBe('HT-2026-0001');
  });

  it('an empty allergy list on our schema is "unknown", so the aspirin step is never shown', () => {
    // A version that passed allergies: [] through would show aspirin to everyone who simply never filled the form in.
    expect(aspirinAdvice(emergencyRecord(rahul)).shown).toBe(false);
    expect(buildFirstAid(emergencyRecord(rahul)).steps.some((s) => s.id === 'aspirin')).toBe(false);
  });

  it('puts contacts in priority order and drops the email when the patient turned email off', () => {
    const c = emergencyContacts(rahul);
    expect(c.map((x) => x.name)).toEqual(['A', 'B']);
    expect(c[0].email).toBeUndefined();
    expect(c[0].whatsapp).toBe(true);
  });

  it('a missing patient gives no record and no contacts', () => {
    expect(emergencyRecord(null)).toBeNull();
    expect(emergencyContacts(null)).toEqual([]);
  });
});

describe('status mapping', () => {
  it("his 'searching' is our 'pending'", () => {
    expect(S.SEARCHING).toBe('pending');
  });
  it('a cancel is allowed up to the ambulance on its way, not once the patient arrived', () => {
    expect(ACTIVE).toContain('en_route');
    expect(ACTIVE).not.toContain('arrived');
    expect(LIVE).toContain('arrived');
    expect([...PRE_ACCEPT, ...POST_ACCEPT].sort()).toEqual([...ACTIVE].sort());
  });
});

describe('views', () => {
  it('locationView keeps the point and adds accuracy and source', () => {
    const v = locationView({ location: { type: 'Point', coordinates: [73.8, 18.5] }, locationInfo: { accuracyM: 20, source: 'gps' } });
    expect(v).toMatchObject({ point: { coordinates: [73.8, 18.5] }, accuracyM: 20, source: 'gps' });
    expect(locationView({})).toBeNull();
  });
  it('timelineView reads our entries the way the SOS screens expect', () => {
    expect(timelineView({ event: 'sent', at: 1, detail: 'Sent' })).toMatchObject({ type: 'sent', message: 'Sent' });
    expect(timelineView({ event: 'hospital_notified', at: 1 }).message).toBe('hospital notified');
  });
});
