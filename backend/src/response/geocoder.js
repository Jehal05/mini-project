// Feature 52: search an address to place the pin. Nominatim (OpenStreetMap) by default; its usage policy asks for a real
// User-Agent, no bulk use and caching, so results are cached and a failure falls back to the built-in Pune areas.
import { CITY_CENTRES } from './cityCentres.js'

const DEFAULT_URL = 'https://nominatim.openstreetmap.org'

export function createGeocoder({ baseUrl = process.env.GEOCODER_URL ?? (process.env.NODE_ENV === 'test' ? '' : DEFAULT_URL), fetchImpl = globalThis.fetch, timeoutMs = 3000, logger = console } = {}) {
  const cache = new Map()

  function local(q) {
    const needle = q.toLowerCase()
    return Object.entries(CITY_CENTRES)
      .filter(([name]) => name.includes(needle) || needle.includes(name))
      .map(([name, [lng, lat]]) => ({ label: `${name[0].toUpperCase()}${name.slice(1)}, Pune (built-in area)`, lng, lat }))
  }

  async function search(q) {
    const query = String(q ?? '').trim().slice(0, 120)
    if (query.length < 3) return { items: [], source: 'none' }
    const key = query.toLowerCase()
    if (cache.has(key)) return cache.get(key)
    let out
    if (baseUrl && fetchImpl) {
      try {
        const url = `${baseUrl.replace(/\/$/, '')}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'HealthTwinAI-demo (student project)', 'accept-language': 'en' } })
        if (!res.ok) throw new Error(`geocoder ${res.status}`)
        const rows = await res.json()
        out = { items: rows.map((r) => ({ label: r.display_name, lng: Number(r.lon), lat: Number(r.lat) })).filter((r) => Number.isFinite(r.lng) && Number.isFinite(r.lat)), source: 'osm' }
      } catch (err) {
        logger.warn?.(`[geocoder] using the built-in areas: ${err.message}`)
      }
    }
    out ??= { items: local(query), source: 'builtin' }
    cache.set(key, out)
    if (cache.size > 200) cache.delete(cache.keys().next().value)
    return out
  }

  return { search }
}
