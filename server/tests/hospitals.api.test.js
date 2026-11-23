import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// The database layer is mocked. Validation, filtering, capability maths, ranking and routes all run for real.
vi.mock('../src/services/hospitalRepo.js', () => ({
  isValidId: (id) => /^[0-9a-f]{24}$/.test(id),
  findNear: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  getAggregates: vi.fn(),
}));

import * as repo from '../src/services/hospitalRepo.js';
import app from '../src/app.js';

const ID = (n) => String(n).padStart(24, '0');
const hospital = (n, name, area, lng, lat, cathLab) => ({
  _id: ID(n), code: `H${n}`, name, area, address: `${area}, Pune`,
  location: { type: 'Point', coordinates: [lng, lat] }, capabilities: { cathLab },
});

// Ordered nearest-first around Viman Nagar, as MongoDB $near would return.
const H = [
  hospital(1, 'Demo Heart Institute', 'Viman Nagar', 73.9143, 18.5679, true),
  hospital(2, 'Demo City Hospital', 'Shivajinagar', 73.8475, 18.5308, true),
  hospital(3, 'Demo Community Hospital', 'Kharadi', 73.9348, 18.5515, false),
];
const emptyAgg = { icuFree: 0, icuTotal: 0, ccuFree: 0, ccuTotal: 0, bedsFree: 0, bedsTotal: 0, cardiologists: 0, alsFree: 0, activeCases: 0 };
const AGG = {
  [ID(1)]: { ...emptyAgg, icuFree: 3, icuTotal: 6, ccuFree: 2, ccuTotal: 4, bedsFree: 5, bedsTotal: 10, cardiologists: 1, alsFree: 1 },
  [ID(2)]: { ...emptyAgg, icuFree: 1, icuTotal: 8, ccuFree: 0, ccuTotal: 5, bedsFree: 1, bedsTotal: 13, cardiologists: 1, activeCases: 2 },
  [ID(3)]: { ...emptyAgg, icuFree: 0, icuTotal: 3, ccuFree: 0, ccuTotal: 1, bedsFree: 0, bedsTotal: 4 },
};
const POINT = 'lat=18.5679&lng=73.9143';

beforeEach(() => {
  vi.resetAllMocks();
  repo.findNear.mockResolvedValue(H);
  repo.findMany.mockResolvedValue(H);
  repo.findById.mockImplementation(async (id) => H.find((h) => h._id === id) ?? null);
  repo.getAggregates.mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, AGG[id] ?? emptyAgg])));
});

describe('GET /api/hospitals/nearby', () => {
  it('returns hospitals nearest first with Haversine distance and live capability', async () => {
    const res = await request(app).get(`/api/hospitals/nearby?${POINT}`);
    expect(res.status).toBe(200);
    expect(res.body.radiusKm).toBe(10);
    expect(res.body.count).toBe(3);
    expect(res.body.results[0].name).toBe('Demo Heart Institute');
    expect(res.body.results[0].distanceKm).toBeCloseTo(0, 1);
    expect(res.body.results[0].capability.ccuFree).toBe(2);
    expect(repo.findNear).toHaveBeenCalledWith(18.5679, 73.9143, 10000);
  });

  it('caps the radius and passes a custom one', async () => {
    await request(app).get(`/api/hospitals/nearby?${POINT}&radiusKm=500`);
    expect(repo.findNear).toHaveBeenLastCalledWith(18.5679, 73.9143, 50000);
    await request(app).get(`/api/hospitals/nearby?${POINT}&radiusKm=5`);
    expect(repo.findNear).toHaveBeenLastCalledWith(18.5679, 73.9143, 5000);
  });

  it.each([
    ['missing coordinates', ''],
    ['non-numeric lat', 'lat=abc&lng=73.9'],
    ['lat out of range', 'lat=120&lng=73.9'],
    ['lng out of range', 'lat=18.5&lng=200'],
    ['bad radius', `${POINT}&radiusKm=-3`],
  ])('returns 400 for %s', async (_name, qs) => {
    const res = await request(app).get(`/api/hospitals/nearby?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('cardiacOnly drops hospitals with no cath lab, cardiologist or free CCU bed', async () => {
    const res = await request(app).get(`/api/hospitals/nearby?${POINT}&cardiacOnly=true`);
    expect(res.body.results.map((r) => r.name)).not.toContain('Demo Community Hospital');
    expect(res.body.count).toBe(2);
  });

  it('turns the cardiac filter on by default in emergency mode, unless overridden', async () => {
    const on = await request(app).get(`/api/hospitals/nearby?${POINT}&emergency=true`);
    expect(on.body.count).toBe(2);
    const off = await request(app).get(`/api/hospitals/nearby?${POINT}&emergency=true&cardiacOnly=false`);
    expect(off.body.count).toBe(3);
  });
});

describe('GET /api/hospitals (search and filters)', () => {
  it('searches by name or area, case-insensitively', async () => {
    const res = await request(app).get('/api/hospitals?q=HEART');
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.name)).toEqual(['Demo Heart Institute']);
    expect(repo.findMany).toHaveBeenCalledWith({ q: 'HEART', area: undefined });
  });

  it('filters by cath lab and minimum free CCU beds', async () => {
    const lab = await request(app).get('/api/hospitals?cathLab=false');
    expect(lab.body.results.map((r) => r.name)).toEqual(['Demo Community Hospital']);
    const ccu = await request(app).get('/api/hospitals?minCcuBeds=2');
    expect(ccu.body.results.map((r) => r.name)).toEqual(['Demo Heart Institute']);
  });

  it('filters by live cardiologist availability', async () => {
    const res = await request(app).get('/api/hospitals?cardiologist=false');
    expect(res.body.results.map((r) => r.name)).toEqual(['Demo Community Hospital']);
  });

  it('sorts by distance when coordinates are given and by name otherwise', async () => {
    const near = await request(app).get(`/api/hospitals?${POINT}`);
    expect(near.body.results[0].name).toBe('Demo Heart Institute');
    const byName = await request(app).get('/api/hospitals');
    expect(byName.body.results.map((r) => r.name)).toEqual([...byName.body.results.map((r) => r.name)].sort());
  });

  it('rejects an invalid boolean filter', async () => {
    const res = await request(app).get('/api/hospitals?cathLab=maybe');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/hospitals/:id/capability', () => {
  it('returns live capability built from the database counts', async () => {
    const res = await request(app).get(`/api/hospitals/${ID(1)}/capability`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Demo Heart Institute', cathLab: true, cardiologistsOnDuty: 1,
      icuFree: 3, ccuFree: 2, alsAmbulancesFree: 1, level: 'full',
    });
    expect(res.body.notice).toMatch(/Not a medical device/);
  });

  it('returns 404 for an unknown hospital and 400 for a malformed id', async () => {
    expect((await request(app).get(`/api/hospitals/${ID(99)}/capability`)).status).toBe(404);
    expect((await request(app).get('/api/hospitals/not-an-id/capability')).status).toBe(400);
  });
});

describe('GET /api/hospitals/rank', () => {
  it('returns a ranked list with score breakdowns and the top 3 flagged', async () => {
    const res = await request(app).get(`/api/hospitals/rank?${POINT}`);
    expect(res.status).toBe(200);
    const ranks = res.body.results.map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3]);
    expect(res.body.results[0].name).toBe('Demo Heart Institute');
    expect(res.body.results[0].breakdown).toHaveProperty('distance.score');
    expect(res.body.results.every((r) => r.notifyFirst)).toBe(true);
    const scores = res.body.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('flags only the first three when more hospitals are in range', async () => {
    const extra = [...H, hospital(4, 'Demo Extra', 'Baner', 73.7868, 18.559, true)];
    repo.findNear.mockResolvedValue(extra);
    const res = await request(app).get(`/api/hospitals/rank?${POINT}&radiusKm=50`);
    expect(res.body.results.filter((r) => r.notifyFirst)).toHaveLength(3);
    expect(res.body.results.at(-1).notifyFirst).toBe(false);
  });

  it('requires coordinates', async () => {
    expect((await request(app).get('/api/hospitals/rank')).status).toBe(400);
  });
});
