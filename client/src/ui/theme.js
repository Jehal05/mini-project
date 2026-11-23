// Theme choice per role, remembered in localStorage. Pure helpers take the storage so they can be tested.
// Control-room roles (admin, doctor) start dark. Others follow the device setting until the person chooses.
export const ROLE_DEFAULT_THEME = { patient: 'system', hospital: 'system', crew: 'system', doctor: 'dark', admin: 'dark' };
const key = (role) => `ht.theme.${role}`;

export function loadTheme(storage, role) {
  try { const v = storage?.getItem(key(role)); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}
export function saveTheme(storage, role, theme) {
  try { storage?.setItem(key(role), theme); return true; } catch { return false; }
}
export function resolveTheme({ role, stored, systemDark = false }) {
  if (stored === 'light' || stored === 'dark') return stored;
  if (ROLE_DEFAULT_THEME[role] === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}
export const toggleTheme = (current) => (current === 'dark' ? 'light' : 'dark');
