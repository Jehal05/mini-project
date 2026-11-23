import { describe, it, expect } from 'vitest';
import { formatCountdown, formatMinutes } from './time.js';

describe('time helpers', () => {
  it('formats a countdown', () => {
    expect(formatCountdown(125000)).toBe('2:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5000)).toBe('-0:05');
  });
  it('formats elapsed minutes', () => {
    expect(formatMinutes(12.5)).toBe('12m 30s');
    expect(formatMinutes(0)).toBe('0m 00s');
  });
});
