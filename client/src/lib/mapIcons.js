// Leaflet icons: fixes the default marker images under Vite, and builds the patient and hospital markers.
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite bundles images with new file names, so Leaflet's guessed default icon paths break.
// Pointing it at the imported files fixes the "missing marker" problem.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const CAPABILITY_COLORS = {
  cathLab: '#22C55E', // green: cath lab
  cardiologist: '#3B82F6', // blue: cardiologist only
  none: '#94A3B8', // grey: neither
};

export function capabilityKind(hospital) {
  const c = hospital.capabilities || {};
  if (c.cathLab) return 'cathLab';
  if (c.cardiologistOnDuty) return 'cardiologist';
  return 'none';
}

export const patientIcon = L.divIcon({
  className: '',
  html: '<div class="patient-pin"><span class="ring"></span><span class="dot"></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

const hospitalIconCache = new Map();

// rank (1-3) replaces the "H" for the top hospitals in the cardiac ranking (feature 59).
export function hospitalIcon(hospital, selected = false, rank = null) {
  const kind = capabilityKind(hospital);
  const key = `${kind}-${selected}-${rank ?? ''}`;
  if (!hospitalIconCache.has(key)) {
    const size = rank ? 32 : 28;
    const classes = ['hospital-pin', selected && 'selected', rank && 'ranked'].filter(Boolean).join(' ');
    hospitalIconCache.set(
      key,
      L.divIcon({
        className: '',
        html: `<div class="${classes}" style="background:${CAPABILITY_COLORS[kind]}">${rank ?? 'H'}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 2)],
      })
    );
  }
  return hospitalIconCache.get(key);
}
