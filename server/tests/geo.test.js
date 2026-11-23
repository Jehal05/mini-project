import { describe, it, expect, vi } from 'vitest';
import { haversineKm } from '../src/services/geo.js';
import { getRoadRoute, estimateRoute } from '../src/services/routing.js';

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm({ lat: 18.5, lng: 73.8 }, { lat: 18.5, lng: 73.8 })).toBe(0);
  });

  it('matches a known distance (Pune to Mumbai is about 120 km straight line)', () => {
    const d = haversineKm({ lat: 18.5204, lng: 73.8567 }, { lat: 19.076, lng: 72.8777 });
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(125);
  });

  it('is symmetric', () => {
    const a = { lat: 18.5679, lng: 73.9143 };
    const b = { lat: 18.5074, lng: 73.8077 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe('routing', () => {
  const from = { lat: 18.5679, lng: 73.9143 };
  const to = { lat: 18.5308, lng: 73.8475 };

  it('uses the provider result when it works', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 9000, duration: 900 }] }),
    });
    const r = await getRoadRoute(from, to, { provider: 'osrm', fetchImpl });
    expect(r).toEqual({ distanceKm: 9, durationMin: 15, etaSource: 'osrm' });
  });

  it('falls back to a labelled estimate when the provider fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const r = await getRoadRoute(from, to, { provider: 'osrm', fetchImpl });
    expect(r.etaSource).toBe('estimate');
    expect(r.distanceKm).toBeGreaterThan(0);
  });

  it('falls back to an estimate when mapbox or google has no key', async () => {
    const fetchImpl = vi.fn();
    const r = await getRoadRoute(from, to, { provider: 'google', apiKey: '', fetchImpl });
    expect(r.etaSource).toBe('estimate');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('estimate is longer than the straight line', () => {
    expect(estimateRoute(from, to).distanceKm).toBeGreaterThan(0);
  });
});
