import { describe, it, expect } from 'vitest';
import * as shared from '../../../shared/emergency.js';
import * as local from './constants.js';
import { clockOffset, secondsLeft } from './clock.js';
import { STATUS_TEXT, STATUS_TONE, AFTER_ACCEPTANCE } from './status.js';
import { shouldBeep } from './alertSound.js';

describe('constants copied from shared/emergency.js', () => {
  it('match the shared file exactly (so the screens and the server cannot drift)', () => {
    expect(local.EMERGENCY_EVENTS).toEqual(shared.EMERGENCY_EVENTS);
    expect(local.CANCEL_REASONS).toEqual(shared.CANCEL_REASONS);
    expect(local.SYMPTOMS).toEqual(shared.SYMPTOMS);
    expect(local.ESCALATION).toEqual(shared.ESCALATION);
    expect(local.EMERGENCY_NUMBERS).toEqual(shared.EMERGENCY_NUMBERS);
  });
});

describe('countdown clock', () => {
  it('counts down on the server clock, corrected for a browser clock that is wrong', () => {
    const serverNow = '2026-11-23T10:00:00.000Z';
    const clientNow = Date.parse(serverNow) - 5 * 60_000; // browser is 5 minutes slow
    const offset = clockOffset(serverNow, clientNow);
    expect(secondsLeft('2026-11-23T10:00:10.000Z', offset, clientNow)).toBe(10);
    expect(secondsLeft('2026-11-23T10:00:10.000Z', offset, clientNow + 4_200)).toBe(6);
  });
  it('never goes below zero, and a bad deadline shows 0', () => {
    expect(secondsLeft('2020-01-01T00:00:00Z')).toBe(0);
    expect(secondsLeft(undefined)).toBe(0);
  });
});

describe('status words', () => {
  it('every status a case can have has words and a tone', () => {
    for (const s of ['awaiting_confirmation', 'pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived', 'closed', 'unresolved', 'cancelled']) {
      expect(STATUS_TEXT[s], s).toBeTruthy();
      expect(STATUS_TONE[s], s).toBeTruthy();
    }
  });
  it('a cancel after acceptance is worded differently only while the ambulance can still be stopped', () => {
    expect(AFTER_ACCEPTANCE).toEqual(['accepted', 'ambulance_assigned', 'en_route']);
  });
});

describe('alert sound rule', () => {
  it('beeps only on a live rise to Level 2 or 3', () => {
    expect(shouldBeep(1, 2, true)).toBe(true);
    expect(shouldBeep(2, 3, true)).toBe(true);
  });
  it('never beeps for the first value read when the page opens (a version that did would beep at Level 2 on every reload)', () => {
    expect(shouldBeep(null, 2, true)).toBe(false);
    expect(shouldBeep(null, 3, false)).toBe(false);
  });
  it('does not beep when the level stays or falls, or is below 2', () => {
    expect(shouldBeep(2, 2, true)).toBe(false);
    expect(shouldBeep(3, 2, true)).toBe(false);
    expect(shouldBeep(0, 1, true)).toBe(false);
  });
});
