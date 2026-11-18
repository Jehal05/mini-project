// Unit tests for the pure ranking service (features 57, 59, 60). Run with: npm test
import { describe, it, expect } from 'vitest';
import {
  assessSuitability,
  scoreHospital,
  rankHospitals,
  weightsTotal,
  nextRadius,
} from '../src/services/ranking.js';
import { RANKING_WEIGHTS, TOP_N } from '../src/config/ranking.js';

const hospital = (id, distanceKm, capabilities) => ({
  _id: id,
  name: `Hospital ${id}`,
  distanceKm,
  capabilities: {
    cathLab: false,
    cardiologistOnDuty: false,
    icuBedsFree: 0,
    ccuBedsFree: 0,
    alsAmbulances: 0,
    ...capabilities,
  },
});

// Same capabilities as the seed data (src/seed/data.js); distances from the demo location.
const lotus = hospital('lotus', 4.94, { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 6, ccuBedsFree: 4, alsAmbulances: 1 });
const riverside = hospital('riverside', 0, { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 2, ccuBedsFree: 0, alsAmbulances: 1 });
const techpark = hospital('techpark', 12.6, { cardiologistOnDuty: true, icuBedsFree: 4, ccuBedsFree: 2, alsAmbulances: 0 });
const airport = hospital('airport', 7.8, { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 5, ccuBedsFree: 3, alsAmbulances: 2 });
const eastside = hospital('eastside', 9.1, { icuBedsFree: 3, ccuBedsFree: 1 });

describe('weights', () => {
  it('add up to 100', () => {
    expect(weightsTotal(RANKING_WEIGHTS)).toBe(100);
  });
});

describe('assessSuitability (feature 57)', () => {
  it('rejects a hospital with no cath lab and no cardiologist', () => {
    const result = assessSuitability(eastside);
    expect(result.suitable).toBe(false);
    expect(result.reasons[0]).toMatch(/No cardiac care/);
  });

  it('keeps Riverside (0 CCU, 2 ICU) suitable', () => {
    expect(assessSuitability(riverside).suitable).toBe(true);
  });

  it('rejects a hospital with 0 CCU and 0 ICU beds', () => {
    const full = hospital('full', 1, { cathLab: true, cardiologistOnDuty: true });
    const result = assessSuitability(full);
    expect(result.suitable).toBe(false);
    expect(result.reasons).toContain('No critical-care beds free');
  });

  it('warns when there is a cardiologist but no cath lab', () => {
    const result = assessSuitability(techpark);
    expect(result.suitable).toBe(true);
    expect(result.warnings).toContain('No cath lab — may need transfer');
  });
});

describe('scoreHospital (feature 59)', () => {
  const points = (score, factor) => score.breakdown.find((r) => r.factor === factor).points;

  it('gives a closer hospital more distance points', () => {
    const near = scoreHospital(airport, 2, 10);
    const far = scoreHospital(airport, 8, 10);
    expect(points(near, 'distance')).toBeGreaterThan(points(far, 'distance'));
  });

  it('gives 0 distance points at or beyond the radius', () => {
    expect(points(scoreHospital(airport, 12, 10), 'distance')).toBe(0);
  });

  it('gives Riverside 0 CCU points', () => {
    expect(points(scoreHospital(riverside, 0, 10), 'ccuBeds')).toBe(0);
  });

  it('caps beds and ambulances', () => {
    const score = scoreHospital(lotus, 0, 10);
    expect(points(score, 'ccuBeds')).toBe(RANKING_WEIGHTS.ccuBeds); // 4 free, cap 3
    expect(points(score, 'icuBeds')).toBe(RANKING_WEIGHTS.icuBeds); // 6 free, cap 5
  });

  it('has rows that add up to the total, never above 100', () => {
    const score = scoreHospital(lotus, 0, 10);
    const sum = Math.round(score.breakdown.reduce((s, r) => s + r.points, 0) * 10) / 10;
    expect(score.total).toBe(sum);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});

describe('rankHospitals (features 59-60)', () => {
  const all = [lotus, riverside, techpark, airport, eastside];

  it(`returns at most ${TOP_N} top hospitals sorted by score`, () => {
    const { top } = rankHospitals(all, 30);
    expect(top.length).toBeLessThanOrEqual(TOP_N);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score.total).toBeGreaterThanOrEqual(top[i].score.total);
    }
    expect(top.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it('breaks ties on distance', () => {
    const a = hospital('a', 5, { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 5, ccuBedsFree: 3, alsAmbulances: 2 });
    const b = hospital('b', 5, { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 5, ccuBedsFree: 3, alsAmbulances: 2 });
    b.distanceKm = 4.99999; // same rounded score, slightly closer
    const { top } = rankHospitals([a, b], 1000);
    expect(top[0].hospital._id).toBe('b');
  });

  it('lists not-suitable hospitals with reasons', () => {
    const { notSuitable } = rankHospitals(all, 30);
    expect(notSuitable.map((n) => n.hospital._id)).toEqual(['eastside']);
    expect(notSuitable[0].reasons.length).toBeGreaterThan(0);
  });

  it('never puts excluded hospitals in top or alternatives', () => {
    const { top, alternatives, excluded } = rankHospitals(all, 30, RANKING_WEIGHTS, {
      exclude: ['riverside', 'airport'],
    });
    const ids = [...top, ...alternatives].map((t) => t.hospital._id);
    expect(ids).not.toContain('riverside');
    expect(ids).not.toContain('airport');
    expect(excluded.map((h) => h._id).sort()).toEqual(['airport', 'riverside']);
  });

  it('promotes the next alternative when rank 1 is excluded', () => {
    const before = rankHospitals(all, 30);
    const first = before.top[0].hospital._id;
    const second = before.top[1].hospital._id;
    const after = rankHospitals(all, 30, RANKING_WEIGHTS, { exclude: [first] });
    expect(after.top[0].hospital._id).toBe(second);
  });
});

describe('nextRadius', () => {
  it('steps 5 -> 10 -> 20 -> 30 -> none', () => {
    expect(nextRadius(5)).toBe(10);
    expect(nextRadius(10)).toBe(20);
    expect(nextRadius(20)).toBe(30);
    expect(nextRadius(30)).toBeNull();
  });
});
