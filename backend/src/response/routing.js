// Features 54, 76, 77: road routes and drive distance. The default provider is an OSRM server (the public demo server
// is for development only; point ROUTING_URL at your own for anything else). If it is off, slow or fails, the route falls
// back to the straight line times a road factor and says so (`source: 'estimate'`), so a dispatch is never blocked on it.
import { distanceKm, ROAD_FACTOR, routeLine } from './geo.js'

const DEFAULT_URL = 'https://router.project-osrm.org'

export function createRouting({ baseUrl = process.env.ROUTING_URL ?? (process.env.NODE_ENV === 'test' ? '' : DEFAULT_URL), fetchImpl = globalThis.fetch, timeoutMs = Number(process.env.ROUTING_TIMEOUT_MS) || 2500, logger = console } = {}) {
  const cache = new Map()
  const key = (a, b) => [...a, ...b].map((n) => n.toFixed(4)).join(',')

  function estimate(a, b) {
    const km = distanceKm(a, b) * ROAD_FACTOR
    return { path: routeLine(a, b), km, durationSec: Math.round((km / 40) * 3600), source: 'estimate' }
  }

  async function route(a, b) {
    if (!baseUrl || !fetchImpl) return estimate(a, b)
    const k = key(a, b)
    if (cache.has(k)) return cache.get(k)
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'HealthTwinAI-demo' } })
      if (!res.ok) throw new Error(`routing ${res.status}`)
      const body = await res.json()
      const r = body.routes?.[0]
      if (body.code !== 'Ok' || !r?.geometry?.coordinates?.length) throw new Error('no route')
      const out = { path: r.geometry.coordinates, km: r.distance / 1000, durationSec: Math.round(r.duration), source: 'road' }
      cache.set(k, out)
      if (cache.size > 200) cache.delete(cache.keys().next().value)
      return out
    } catch (err) {
      logger.warn?.(`[routing] using a straight-line estimate: ${err.message}`)
      return estimate(a, b)
    }
  }

  return { route, estimate, enabled: Boolean(baseUrl && fetchImpl) }
}
