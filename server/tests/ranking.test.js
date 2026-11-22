import { describe, it, expect } from 'vitest';
import { rankHospitals, scoreHospital, RANKING_CONFIG } from '../src/services/ranking.js';
import { toCapability, applyFilters, isCardiacCapable } from '../src/services/capability.js';

const cap = (over = {}) => ({
  cathLab: true, cardiologistsOnDuty: 1, icuFree: 2, icuTotal: 4, ccuFree: 2, ccuTotal: 4,
  alsAmbulancesFree: 1, activeCases: 0, occupiedRatio: 0, ...over,
});
const item = (id, distanceKm, over = {}) => ({ id, name: `H${id}`, area: 'A', distanceKm, capability: cap(over) });

describe('scoreHospital', () => {
  it('returns a breakdown whose points add up to the total', () => {
    const { total, breakdown } = scoreHospital(item('1', 3));
    const sum = breakdown.distance.points + breakdown.capability.points + breakdown.load.points;
    expect(total).toBeCloseTo(sum, 1);
    expect(breakdown.capability.score).toBe(100);
    expect(breakdown.load.score).toBe(100);
  });

  it('gives 0 distance score at or beyond the horizon', () => {
    const { breakdown } = scoreHospital(item('1', RANKING_CONFIG.distanceHorizonKm + 5));
    expect(breakdown.distance.score).toBe(0);
  });

  it('lowers the load score when the hospital is busy', () => {
    const quiet = scoreHospital(item('1', 3)).breakdown.load.score;
    const busy = scoreHospital(item('1', 3, { activeCases: 5, occupiedRatio: 1 })).breakdown.load.score;
    expect(busy).toBeLessThan(quiet);
    expect(busy).toBe(0);
  });
});

describe('rankHospitals', () => {
  it('ranks a close, capable hospital above a far one', () => {
    const ranked = rankHospitals([item('far', 12), item('near', 2)]);
    expect(ranked.map((r) => r.id)).toEqual(['near', 'far']);
    expect(ranked[0].rank).toBe(1);
  });

  it('can prefer a farther hospital that has a cath lab over a nearer one without', () => {
    const ranked = rankHospitals([
      item('near-no-lab', 2, { cathLab: false, cardiologistsOnDuty: 0, ccuFree: 0, icuFree: 0, alsAmbulancesFree: 0 }),
      item('far-full', 6),
    ]);
    expect(ranked[0].id).toBe('far-full');
  });

  it('flags only the top 3 as notifyFirst', () => {
    const ranked = rankHospitals([item('1', 1), item('2', 2), item('3', 3), item('4', 4), item('5', 5)]);
    expect(ranked.map((r) => r.notifyFirst)).toEqual([true, true, true, false, false]);
  });

  it('breaks exact score ties by distance, then name', () => {
    const a = { ...item('a', 5), name: 'Beta' };
    const b = { ...item('b', 5), name: 'Alpha' };
    expect(rankHospitals([a, b]).map((r) => r.name)).toEqual(['Alpha', 'Beta']);
  });

  it('includes the full breakdown on every result and does not mutate the input', () => {
    const input = [item('1', 1), item('2', 2)];
    const ranked = rankHospitals(input);
    expect(ranked[0].breakdown).toHaveProperty('distance.weight');
    expect(ranked[0].breakdown).toHaveProperty('capability.points');
    expect(input[0]).not.toHaveProperty('score');
  });
});

describe('capability helpers', () => {
  it('builds capability from live aggregate counts', () => {
    const c = toCapability(
      { capabilities: { cathLab: true } },
      { icuFree: 1, icuTotal: 4, ccuFree: 0, ccuTotal: 2, bedsFree: 1, bedsTotal: 6, cardiologists: 2, alsFree: 1, activeCases: 1 },
    );
    expect(c.cathLab).toBe(true);
    expect(c.cardiologistsOnDuty).toBe(2);
    expect(c.occupiedRatio).toBeCloseTo(0.83, 2);
    expect(c.level).toBe('partial');
  });

  it('cardiac filter keeps cath lab, cardiologist or free CCU only', () => {
    const items = [
      { name: 'a', capability: cap() },
      { name: 'b', capability: cap({ cathLab: false, cardiologistsOnDuty: 0, ccuFree: 0 }) },
      { name: 'c', capability: cap({ cathLab: false, cardiologistsOnDuty: 0, ccuFree: 1 }) },
    ];
    expect(applyFilters(items, { cardiacOnly: true }).map((i) => i.name)).toEqual(['a', 'c']);
    expect(isCardiacCapable(items[1].capability)).toBe(false);
  });

  it('filters by text, cath lab and minimum CCU beds', () => {
    const items = [
      { name: 'Heart Institute', area: 'Viman Nagar', capability: cap({ ccuFree: 4 }) },
      { name: 'City Hospital', area: 'Kothrud', capability: cap({ cathLab: false, ccuFree: 1 }) },
    ];
    expect(applyFilters(items, { q: 'heart' })).toHaveLength(1);
    expect(applyFilters(items, { area: 'kothrud' })).toHaveLength(1);
    expect(applyFilters(items, { cathLab: false })[0].name).toBe('City Hospital');
    expect(applyFilters(items, { minCcuBeds: 3 })[0].name).toBe('Heart Institute');
  });
});
