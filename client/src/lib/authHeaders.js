// Pure helpers for sign-in. The access token lives in memory only (never localStorage) so page scripts cannot steal it.
export const CSRF = { 'X-Requested-With': 'healthtwin' };

// With a session: send the Bearer token. Without one (demo mode only): send the old dev headers.
export const headersFor = (token, legacy = {}, json = false) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : legacy),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

// Which screen a signed-in account lands on.
const ROLE_SCREEN = { patient: 'patient', doctor: 'doctor', hospital_staff: 'hospital', hospital_admin: 'hospital', ambulance_crew: 'crew', central_admin: 'admin' };
export const screenForRole = (role) => ROLE_SCREEN[role] ?? null;

export const LOGIN_PORTALS = [
  { id: 'patient', label: 'Patient', hint: 'Follow your own emergency' },
  { id: 'doctor', label: 'Doctor', hint: 'Your assigned cases' },
  { id: 'staff', label: 'Hospital staff', hint: 'Emergency queue and ambulances' },
  { id: 'crew', label: 'Ambulance crew', hint: 'Your current trip' },
  { id: 'admin', label: 'Admin', hint: 'Analytics and backups' },
];
export const portalForRole = (role) => ({ patient: 'patient', doctor: 'doctor', hospital_staff: 'staff', hospital_admin: 'staff', ambulance_crew: 'crew', central_admin: 'admin' })[role] ?? 'patient';

// Plain-language text for sign-in failures. Never says which half (email or password) was wrong.
export function loginMessage(status, serverMessage) {
  if (status === 0) return 'Cannot reach the server. Check your connection and try again.';
  if (status === 401) return 'Incorrect email or password.';
  if (status === 429) return serverMessage || 'Too many attempts. Wait a few minutes and try again.';
  if (status === 403) return serverMessage || 'This account cannot sign in here.';
  return serverMessage || 'Could not sign in. Try again.';
}
