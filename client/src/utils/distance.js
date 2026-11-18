// Haversine distance in km (same formula as the server) plus a friendly "2.4 km" / "850 m" formatter.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 100) / 100;
}

export function formatKm(km) {
  if (km === undefined || km === null || Number.isNaN(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// Hospital GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
export const toLatLng = (hospital) => {
  const [lng, lat] = hospital.location.coordinates;
  return [lat, lng];
};
