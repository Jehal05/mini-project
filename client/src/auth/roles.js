export const ROLE_LABEL = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital_staff: 'Hospital staff',
  hospital_admin: 'Hospital admin',
  central_admin: 'Central admin',
};

export const HOSPITAL_ROLES = ['doctor', 'hospital_staff', 'hospital_admin'];

/** Where each role lands after login (three portals, one login). */
export function portalPath(role) {
  if (role === 'patient') return '/patient';
  if (HOSPITAL_ROLES.includes(role)) return '/hospital';
  if (role === 'central_admin') return '/admin';
  return '/login';
}

/** Login tabs: each calls its own endpoint and accepts only its own roles. */
export const LOGIN_PORTALS = [
  { key: 'patient', label: 'Patient', endpoint: '/auth/login/patient' },
  { key: 'doctor', label: 'Doctor', endpoint: '/auth/login/doctor' },
  { key: 'staff', label: 'Hospital staff', endpoint: '/auth/login/staff' },
  { key: 'admin', label: 'Admin', endpoint: '/auth/login/admin' },
];
