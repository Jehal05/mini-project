import { describe, expect, it } from 'vitest';
import { SECTIONS, fileProblem, passportTokenFrom, phoneForDisplay, toBody, toValues } from './patientRecord.js';

const TOKEN = 'a'.repeat(64);

describe('passportTokenFrom', () => {
  it('reads a token from a full link, a bare token and a link with a query', () => {
    expect(passportTokenFrom(`http://localhost:5173/p/${TOKEN}`)).toBe(TOKEN);
    expect(passportTokenFrom(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(passportTokenFrom(` https://x.test/p/${TOKEN}/?a=1 `)).toBe(TOKEN);
  });
  it('rejects anything else', () => {
    expect(passportTokenFrom('hello')).toBe(null);
    expect(passportTokenFrom(`${TOKEN}zz`)).toBe(null);
    expect(passportTokenFrom('')).toBe(null);
  });
});

describe('toBody and toValues', () => {
  const f = SECTIONS.medications.fields;
  it('drops blank optional fields on create and clears them on update', () => {
    expect(toBody(f, { drug: ' Aspirin ', dose: '', frequency: '', isBloodThinner: false })).toEqual({ drug: 'Aspirin', isBloodThinner: false });
    expect(toBody(f, { drug: 'Aspirin', dose: '', frequency: '5', isBloodThinner: true }, { forUpdate: true })).toEqual({ drug: 'Aspirin', dose: '', frequency: '5', isBloodThinner: true });
  });
  it('turns numbers and dates into what the server expects', () => {
    expect(toBody(SECTIONS.cardiacConditions.fields, { type: 'stent', year: '2021', notes: '' })).toEqual({ type: 'stent', year: 2021 });
    expect(toBody(SECTIONS.hospitalizations.fields, { hospital: 'City', admittedOn: '2024-05-01T00:00:00.000Z' }).admittedOn).toBe('2024-05-01');
  });
  it('fills a form from a saved row', () => {
    expect(toValues(SECTIONS.allergies.fields, { allergen: 'Dust', severity: 'mild' })).toEqual({ allergen: 'Dust', reaction: '', severity: 'mild' });
  });
});

describe('fileProblem', () => {
  it('flags size and type before upload', () => {
    expect(fileProblem({ size: 6e6, type: 'application/pdf' }, { maxBytes: 5 * 1048576, types: ['application/pdf'] })).toMatch(/limit/);
    expect(fileProblem({ size: 10, type: 'text/html' }, { maxBytes: 100, types: ['application/pdf'] })).toMatch(/not accepted/);
    expect(fileProblem({ size: 10, type: 'application/pdf' }, { maxBytes: 100, types: ['application/pdf'] })).toBe(null);
  });
});

describe('phoneForDisplay', () => {
  it('spaces an Indian number', () => { expect(phoneForDisplay('+919876543210')).toBe('+91 98765 43210'); });
});
