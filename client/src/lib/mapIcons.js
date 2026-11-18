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

export function hospitalIcon(hospital, selected = false) {
  const kind = capabilityKind(hospital);
  const key = `${kind}-${selected}`;
  if (!hospitalIconCache.has(key)) {
    hospitalIconCache.set(
      key,
      L.divIcon({
        className: '',
        html: `<div class="hospital-pin${selected ? ' selected' : ''}" style="background:${CAPABILITY_COLORS[kind]}">H</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
      })
    );
  }
  return hospitalIconCache.get(key);
}
