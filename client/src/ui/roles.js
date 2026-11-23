// Roles, their screens and navigation. TEMPORARY demo login: Jehal's real login replaces the role switcher
// and supplies the role (and the doctor, hospital, ambulance id) from the signed-in account.
export const ROLES = [
  { id: 'patient', label: 'Patient', blurb: 'Your emergency status and nearby hospitals' },
  { id: 'doctor', label: 'Doctor', blurb: 'Your assigned cases and vitals' },
  { id: 'hospital', label: 'Hospital staff', blurb: 'Emergency queue and ambulances' },
  { id: 'crew', label: 'Ambulance crew', blurb: 'Your current trip' },
  { id: 'admin', label: 'Admin', blurb: 'Analytics and backups' },
];

const NAV = {
  patient: [
    { id: 'status', label: 'My emergency', icon: 'heart-pulse', title: 'Your emergency' },
    { id: 'find', label: 'Find hospitals', icon: 'map-pin', title: 'Find a hospital' },
    { id: 'profile', label: 'My profile', icon: 'user', title: 'Your health profile' },
    { id: 'passport', label: 'QR passport', icon: 'info', title: 'Your QR medical passport' },
  ],
  doctor: [{ id: 'cases', label: 'My cases', icon: 'stethoscope', title: 'Your assigned cases' }],
  hospital: [
    { id: 'queue', label: 'Emergency queue', icon: 'siren', title: 'Emergency queue' },
    { id: 'fleet', label: 'Ambulances', icon: 'ambulance', title: 'Ambulance fleet' },
    { id: 'passport', label: 'Patient passport', icon: 'user', title: 'Open a patient passport' },
  ],
  crew: [{ id: 'trip', label: 'My trip', icon: 'ambulance', title: 'Your trip' }],
  admin: [
    { id: 'analytics', label: 'Analytics', icon: 'chart', title: 'Analytics' },
    { id: 'backups', label: 'Backups', icon: 'database', title: 'Backups' },
  ],
};

export const isRole = (r) => ROLES.some((x) => x.id === r);
export const navFor = (role) => NAV[role] ?? [];
export const defaultView = (role) => navFor(role)[0]?.id ?? null;
export const isValidView = (role, view) => navFor(role).some((n) => n.id === view);
export const pageTitle = (role, view) => navFor(role).find((n) => n.id === view)?.title ?? '';
// Patient and crew always keep Call 112 / 108 within reach.
export const showsCallBar = (role) => role === 'patient' || role === 'crew';

// Display names for account roles (what the server calls them).
const ACCOUNT_LABELS = { patient: 'Patient', doctor: 'Doctor', hospital_staff: 'Hospital staff', hospital_admin: 'Hospital admin', ambulance_crew: 'Ambulance crew', central_admin: 'Administrator' };
export const roleLabel = (role) => ACCOUNT_LABELS[role] ?? role;
