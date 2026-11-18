const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function lerpPoint(from, to, t) {
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t }
}

// Road ETA assuming an average ambulance speed in city traffic.
export const AVG_SPEED_KMH = 40

export function etaMinutes(leg) {
  if (!leg) return null
  const remainingKm = leg.km * (1 - leg.progress)
  return Math.max(1, Math.round((remainingKm / AVG_SPEED_KMH) * 60))
}
