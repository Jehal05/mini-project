import { describe, expect, it, vi } from 'vitest'
import { pathLengthKm, pointAlongFraction } from '../src/response/geo.js'
import { createRouting } from '../src/response/routing.js'

const quiet = { warn() {}, log() {} }
const A = [73.85, 18.52]
const B = [73.9, 18.55]

describe('road routing (54, 76, 77)', () => {
  it('uses the routed road geometry and distance when the service answers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 7400, duration: 660, geometry: { coordinates: [A, [73.87, 18.53], B] } }] }) })
    const r = await createRouting({ baseUrl: 'https://osrm.example', fetchImpl, logger: quiet }).route(A, B)
    expect(r).toMatchObject({ source: 'road', km: 7.4, durationSec: 660 })
    expect(r.path).toHaveLength(3)
    expect(fetchImpl.mock.calls[0][0]).toContain('/route/v1/driving/73.85,18.52;73.9,18.55')
  })
  it('caches a route so the same trip is not asked for twice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1000, duration: 60, geometry: { coordinates: [A, B] } }] }) })
    const routing = createRouting({ baseUrl: 'https://osrm.example', fetchImpl, logger: quiet })
    await routing.route(A, B); await routing.route(A, B)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('falls back to a labelled straight-line estimate when the service fails or is off', async () => {
    const down = await createRouting({ baseUrl: 'https://osrm.example', fetchImpl: vi.fn().mockRejectedValue(new Error('offline')), logger: quiet }).route(A, B)
    expect(down.source).toBe('estimate')
    expect(down.km).toBeGreaterThan(0)
    const off = await createRouting({ baseUrl: '', logger: quiet }).route(A, B)
    expect(off.source).toBe('estimate')
    expect(createRouting({ baseUrl: '' }).enabled).toBe(false)
  })
  it('walks a polyline by length', () => {
    const path = [[0, 0], [0, 0.1], [0.1, 0.1]]
    expect(pathLengthKm(path)).toBeGreaterThan(20)
    expect(pointAlongFraction(path, 0)).toEqual([0, 0])
    expect(pointAlongFraction(path, 1)).toEqual([0.1, 0.1])
    const mid = pointAlongFraction(path, 0.5)
    expect(mid[0]).toBeCloseTo(0, 1)
    expect(mid[1]).toBeCloseTo(0.1, 1)
  })
})

import { createGeocoder } from '../src/response/geocoder.js'

describe('address search (52)', () => {
  it('returns OpenStreetMap matches, caches them, and falls back to built-in Pune areas', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ display_name: 'Shivajinagar, Pune', lon: '73.85', lat: '18.53' }, { display_name: 'bad', lon: 'x', lat: 'y' }] })
    const g = createGeocoder({ baseUrl: 'https://geo.example', fetchImpl, logger: quiet })
    const r = await g.search('Shivajinagar Pune')
    expect(r).toEqual({ items: [{ label: 'Shivajinagar, Pune', lng: 73.85, lat: 18.53 }], source: 'osm' })
    await g.search('shivajinagar pune')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const down = createGeocoder({ baseUrl: 'https://geo.example', fetchImpl: vi.fn().mockRejectedValue(new Error('offline')), logger: quiet })
    expect((await down.search('Kothrud')).source).toBe('builtin')
    expect((await down.search('ab')).items).toEqual([])
  })
})
