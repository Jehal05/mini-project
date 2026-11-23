// Small geography helpers. Coordinates are GeoJSON order: [longitude, latitude].
const R_KM = 6371
const rad = (d) => (d * Math.PI) / 180

export function distanceKm(a, b) {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}

/** The point `t` (0 to 1) of the way from a to b. */
export const lerpPoint = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** A drawable line from a to b (feature 76). The demo has no routing service, so the line is straight and labelled simulated. */
export function routeLine(a, b, steps = 24) {
  return Array.from({ length: steps + 1 }, (_, i) => lerpPoint(a, b, i / steps))
}

export const ROAD_FACTOR = 1.3 // roads are longer than the straight line between two points
