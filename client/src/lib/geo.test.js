import { describe, it, expect } from 'vitest';
import { mapGeoError, isInaccurate, LEVEL_COLORS } from './geo.js';

describe('geolocation helpers', () => {
  it('maps browser error codes', () => {
    expect(mapGeoError(1)).toBe('denied');
    expect(mapGeoError(3)).toBe('timeout');
    expect(mapGeoError(2)).toBe('unavailable');
    expect(mapGeoError(99)).toBe('unavailable');
  });

  it('treats accuracy over 1 km as inaccurate', () => {
    expect(isInaccurate(50)).toBe(false);
    expect(isInaccurate(1000)).toBe(false);
    expect(isInaccurate(5000)).toBe(true);
    expect(isInaccurate(undefined)).toBe(false);
  });

  it('has a colour for every capability level', () => {
    expect(Object.keys(LEVEL_COLORS).sort()).toEqual(['full', 'limited', 'partial']);
  });
});
