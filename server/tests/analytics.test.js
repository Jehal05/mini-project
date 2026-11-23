import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import {
  percentile, timingStats, maskedCount, parseRange, parseTzOffset, groupByDay, buildMetrics, MASK_LABEL,
} from '../src/services/analyticsMetrics.js';
import { buildHistory } from '../src/seed/historyData.js';

// The database reads are replaced with data from the demo-history generator.
const mock = vi.hoisted(() => ({ cases: [], trips: [], hospitals: [], ambulances: [] }));
vi.mock('../src/services/analyticsRepo.js', () => ({
  listCases: async () => mock.cases,
  listTrips: async () => mock.trips,
  listHospitals: async () => mock.hospitals,
  listAmbulances: async () => mock.ambulances,
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';

const NOW = Date.parse('2026-11-23T10:00:00.000Z');
const hex = (n) => n.toString(16).padStart(24, '0');
const range = { from: new Date(NOW - 30 * 86400000), to: new Date(NOW) };

function history(count = 60) {
  let n = 1000;
  const hospitals = [1, 2, 3, 4].map((i) => ({ _id: hex(i), name: `Hospital ${i}`, coords: [73.8, 18.5] }));
  const ambulances = hospitals.flatMap((h, i) => [{ _id: hex(50 + i * 2), homeHospital: h._id, vehicleNumber: `AMB-${i}A`, type: 'ALS' }, { _id: hex(51 + i * 2), homeHospital: h._id, vehicleNumber: `AMB-${i}B`, type: 'BLS' }]);
  const built = buildHistory({ hospitals, ambulances, patientId: hex(500), now: NOW, count, newId: () => hex(++n) });
  return { ...built, hospitals, ambulances };
}

describe('percentile, masking and ranges', () => {
  it('interpolates percentiles and ignores bad values', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 90)).toBe(10);
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, NaN, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBeCloseTo(9.1, 5);
  });
  it('hides groups of 1 or 2, shows 0 and 3 or more', () => {
    expect(maskedCount(1)).toEqual({ count: null, masked: true, label: MASK_LABEL });
    expect(maskedCount(2).masked).toBe(true);
    expect(maskedCount(0)).toEqual({ count: 0, masked: false });
    expect(maskedCount(3)).toEqual({ count: 3, masked: false });
    expect(timingStats([4, 5])).toMatchObject({ masked: true, median: null, p90: null });
    expect(timingStats([4, 5, 9])).toMatchObject({ n: 3, median: 5, masked: false });
    expect(timingStats([])).toMatchObject({ n: 0, median: null });
  });
  it('defaults to 30 days and validates the range', () => {
    const r = parseRange({}, NOW);
    expect(r.to.getTime()).toBe(NOW);
    expect(NOW - r.from.getTime()).toBe(30 * 86400000);
    expect(() => parseRange({ from: 'nope' }, NOW)).toThrow(/valid date/);
    expect(() => parseRange({ from: '2026-11-10', to: '2026-11-01' }, NOW)).toThrow(/before/);
    expect(() => parseRange({ from: '2025-01-01', to: '2026-11-01' }, NOW)).toThrow(/366/);
    expect(parseRange({ from: '2026-11-01', to: '2026-11-02' }, NOW).to.toISOString()).toBe('2026-11-02T23:59:59.999Z'); // inclusive day
    expect(() => parseTzOffset('99999')).toThrow();
    expect(parseTzOffset('330')).toBe(330);
  });
  it('groups cases by day, filling empty days, in the requested time zone', () => {
    const cases = [
      { severity: 'critical', detectedAt: '2026-11-20T10:00:00Z' },
      { severity: 'high', detectedAt: '2026-11-20T11:00:00Z' },
      { severity: 'low', detectedAt: '2026-11-20T20:00:00Z' }, // 01:30 next day in IST
    ];
    const r = { from: new Date('2026-11-19T00:00:00Z'), to: new Date('2026-11-21T23:59:59Z') };
    const utc = groupByDay(cases, { ...r });
    expect(utc.map((d) => d.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21']);
    expect(utc[1]).toMatchObject({ critical: 1, high: 1, low: 1, total: 3 });
    expect(utc[0].total).toBe(0);
    const ist = groupByDay(cases, { ...r, tzOffsetMin: 330 });
    expect(ist.find((d) => d.date === '2026-11-21').low).toBe(1);
  });
});

describe('buildMetrics on simulated history', () => {
  it('produces every section with sensible numbers', () => {
    const { cases, trips, hospitals, ambulances } = history();
    const m = buildMetrics({ cases, trips, hospitals, ambulances, ...range });
    expect(m.totals.cases).toBe(60);
    expect(m.casesPerDay).toHaveLength(31);
    expect(m.casesPerDay.reduce((a, d) => a + d.total, 0)).toBe(60);
    expect(m.responseTimes.toAccept.median).toBeLessThan(5); // minutes
    expect(m.responseTimes.toArrival.median).toBeGreaterThan(m.responseTimes.toDispatch.median);
    expect(m.goldenHour.stages.map((s) => s.key)).toEqual(['cathLabAlert', 'ambulanceScene', 'contactToTreatment']);
    expect(m.rejectionReasons.length).toBeGreaterThan(0);
    expect(m.hospitals.length).toBeGreaterThan(0);
    expect(m.ambulances).toHaveLength(8);
  });

  it('is empty-safe', () => {
    const m = buildMetrics({ cases: [], ...range });
    expect(m.totals.cases).toBe(0);
    expect(m.responseTimes.toAccept).toMatchObject({ n: 0, median: null });
    expect(m.goldenHour.firstContact.percent).toBeNull();
    expect(m.rejectionReasons).toEqual([]);
  });

  it('masks small groups everywhere', () => {
    const { cases, trips, hospitals, ambulances } = history(60);
    const two = cases.slice(0, 2);
    const m = buildMetrics({ cases: two, trips: trips.filter((t) => two.some((c) => c._id === t.emergencyCase)), hospitals, ambulances, ...range });
    expect(m.responseTimes.toAccept.masked || m.responseTimes.toAccept.n === 0).toBe(true);
    for (const h of m.hospitals) expect(h).toMatchObject({ masked: true, notified: null, acceptanceRate: null });
    for (const a of m.ambulances.filter((x) => x.masked)) expect(a).toMatchObject({ trips: null, onTripPercent: null });
    for (const r of m.rejectionReasons) expect(r.count === null ? r.masked : r.count >= 3).toBe(true);
  });

  it('never contains patient names, phones, addresses or vitals', () => {
    const { cases, trips, hospitals, ambulances } = history();
    // Even if a careless caller passes identifying fields, none reach the output.
    const dirty = cases.map((c) => ({ ...c, fullName: 'Rahul Sharma', phone: '9876543210', address: '12 MG Road', heartRate: 130, latestVitals: { spo2: 90 } }));
    const text = JSON.stringify(buildMetrics({ cases: dirty, trips, hospitals, ambulances, ...range }));
    for (const banned of ['Rahul', '9876543210', 'MG Road', 'fullName', 'phone', 'address', 'heartRate', 'spo2', 'latestVitals', 'patient', hex(500), 'coordinates', 'location']) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('GET /api/admin/analytics/summary', () => {
  beforeAll(() => { env.adminDevToken = 'test-admin-token'; env.nodeEnv = 'test'; });
  beforeEach(() => { Object.assign(mock, history()); });
  const get = (qs = '', token = 'test-admin-token') => request(app).get(`/api/admin/analytics/summary${qs}`).set(token ? { 'x-admin-token': token } : {});

  it('needs the admin token', async () => {
    expect((await get('', null)).status).toBe(401);
    expect((await get('', 'wrong')).status).toBe(401);
    env.adminDevToken = '';
    expect((await get('', 'anything')).status).toBe(503);
    env.adminDevToken = 'test-admin-token';
  });
  it('returns the summary and rejects a bad range', async () => {
    const ok = await get('?from=2026-10-25&to=2026-11-23');
    expect(ok.status).toBe(200);
    expect(ok.body.notice).toMatch(/Simulated/);
    expect(ok.body.totals.cases).toBe(60);
    expect((await get('?from=2026-11-23&to=2026-11-01')).status).toBe(400);
    expect((await get('?hospitalId=not-an-id')).status).toBe(400);
  });
  it('response has no patient identifiers', async () => {
    const text = JSON.stringify((await get()).body);
    for (const banned of ['fullName', 'phone', 'address', 'heartRate', 'patient"', hex(500)]) expect(text).not.toContain(banned);
  });
});
