// Straight-line distance between two points on Earth (Haversine formula), in km rounded to 2 decimals.
//
// The Haversine formula treats Earth as a sphere (radius 6371 km):
//   a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)
//   distance = 2 · R · asin(√a)
// It is accurate to about 0.5%, which is plenty for ranking hospitals.
// Road distance and drive time come later from a routing API (ambulance ETA phase).

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  return Math.round(km * 100) / 100;
}
