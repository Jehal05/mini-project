import { describe, expect, it } from 'vitest';
import { headersFor, loginMessage, portalForRole, screenForRole, LOGIN_PORTALS } from './authHeaders.js';

describe('headersFor', () => {
  it('sends the Bearer token and ignores the dev headers when signed in', () => {
    expect(headersFor('abc', { 'x-hospital-id': 'h1' })).toEqual({ Authorization: 'Bearer abc' });
  });
  it('falls back to the dev headers with no token', () => {
    expect(headersFor(null, { 'x-hospital-id': 'h1' })).toEqual({ 'x-hospital-id': 'h1' });
  });
  it('adds a JSON content type only when asked', () => {
    expect(headersFor('t', {}, true)['Content-Type']).toBe('application/json');
    expect(headersFor('t', {})['Content-Type']).toBe(undefined);
  });
});

describe('role mapping', () => {
  it('maps every account role to a screen', () => {
    expect(screenForRole('hospital_admin')).toBe('hospital');
    expect(screenForRole('ambulance_crew')).toBe('crew');
    expect(screenForRole('central_admin')).toBe('admin');
    expect(screenForRole('nope')).toBeNull();
  });
  it('maps account roles back to a login tab that exists', () => {
    for (const r of ['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'ambulance_crew', 'central_admin']) {
      expect(LOGIN_PORTALS.some((p) => p.id === portalForRole(r))).toBe(true);
    }
  });
});

describe('loginMessage', () => {
  it('never says which half was wrong', () => { expect(loginMessage(401, 'x')).toBe('Incorrect email or password.'); });
  it('shows the server text for lockout and explains network failure', () => {
    expect(loginMessage(429, 'Account locked for 15 minutes.')).toBe('Account locked for 15 minutes.');
    expect(loginMessage(0)).toMatch(/Cannot reach/);
  });
});
