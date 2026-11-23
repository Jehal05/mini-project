// Pure helpers, unit tested in geo.test.js.

// Browser GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout.
export function mapGeoError(code) {
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

// GPS accuracy is the radius in metres. Over 1 km is too rough to pick a hospital, so offer the manual pin.
export const INACCURATE_METERS = 1000;
export const isInaccurate = (accuracyMeters) =>
  typeof accuracyMeters === 'number' && accuracyMeters > INACCURATE_METERS;

export const GEO_MESSAGES = {
  denied: 'Location permission was denied. Drop a pin on the map or search for your address instead.',
  timeout: 'Getting your location took too long. Try again, or drop a pin on the map.',
  unavailable: 'Your device could not determine its location. Drop a pin on the map instead.',
  unsupported: 'This browser does not support location. Drop a pin on the map instead.',
  inaccurate: 'Your location is only accurate to a few kilometres. Drop a pin to be more precise.',
};

// Marker colour by capability level from the server: full, partial, limited.
export const LEVEL_COLORS = { full: '#16a34a', partial: '#f59e0b', limited: '#dc2626' };
export const LEVEL_LABELS = {
  full: 'Full cardiac care',
  partial: 'Partial cardiac care',
  limited: 'Limited cardiac care',
};
