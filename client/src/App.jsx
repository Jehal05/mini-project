import { Suspense, lazy, useState } from 'react';
import AppShell from './ui/AppShell.jsx';
import { Skeleton } from './ui/Feedback.jsx';
import { defaultView, isRole, isValidView } from './ui/roles.js';
import { useTheme } from './ui/useTheme.js';
import { useConnection } from './lib/useConnection.js';
import PortalApp from './portal/PortalApp.jsx';
import PatientStatus from './portal/PatientStatus.jsx';
import CrewApp from './crew/CrewApp.jsx';
import DoctorApp from './doctor/DoctorApp.jsx';

// Heavy screens (maps, charts) load only when opened.
const FindHospitals = lazy(() => import('./patient/FindHospitals.jsx'));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const ROLE_KEY = 'ht.role';
function initialRole() {
  const fromUrl = new URLSearchParams(window.location.search).get('role');
  if (isRole(fromUrl)) return fromUrl;
  try { const s = localStorage.getItem(ROLE_KEY); if (isRole(s)) return s; } catch { /* storage blocked */ }
  return 'patient';
}

// TEMPORARY: the role comes from the demo switcher. Jehal replaces this with the signed-in account's role.
export default function App() {
  const [role, setRole] = useState(initialRole);
  const [view, setView] = useState(() => defaultView(initialRole()));
  const [theme, toggleTheme] = useTheme(role);
  const connection = useConnection();

  function changeRole(next) {
    setRole(next);
    setView(defaultView(next));
    try { localStorage.setItem(ROLE_KEY, next); } catch { /* storage blocked */ }
  }
  const current = isValidView(role, view) ? view : defaultView(role);

  let screen = null;
  if (role === 'patient') screen = current === 'find' ? <FindHospitals /> : <PatientStatus />;
  else if (role === 'hospital') screen = <PortalApp view={current} />;
  else if (role === 'crew') screen = <CrewApp />;
  else if (role === 'admin') screen = <AdminApp view={current} />;
  else screen = <DoctorApp />;

  return (
    <AppShell role={role} onRole={changeRole} view={current} onView={setView} theme={theme} onToggleTheme={toggleTheme} connection={connection}>
      <Suspense fallback={<div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40" /></div>}>{screen}</Suspense>
    </AppShell>
  );
}
