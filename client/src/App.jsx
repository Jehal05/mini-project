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
import LoginScreen from './ui/LoginScreen.jsx';
import { useSession } from './lib/useSession.js';
import { signOut } from './lib/session.js';
import { screenForRole } from './lib/authHeaders.js';

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

// Demo mode (VITE_DEV_AUTH=true) keeps the role switcher and pickers; otherwise people sign in and the account decides.
const DEMO = import.meta.env.VITE_DEV_AUTH === 'true';

export default function App() {
  const session = useSession();
  if (!DEMO && session.status === 'loading') return <div className="paper-bg grid min-h-screen place-items-center text-muted" aria-busy="true">Loading…</div>;
  if (!DEMO && session.status !== 'in') return <LoginScreen />;
  return <Signed account={DEMO ? null : session.user} />;
}

function Signed({ account }) {
  const [pickedRole, setRole] = useState(initialRole);
  const role = account ? screenForRole(account.role) ?? 'patient' : pickedRole;
  const [view, setView] = useState(() => defaultView(role));
  const [theme, toggleTheme] = useTheme(role);
  const connection = useConnection();

  function changeRole(next) {
    setRole(next);
    setView(defaultView(next));
    try { localStorage.setItem(ROLE_KEY, next); } catch { /* storage blocked */ }
  }
  const current = isValidView(role, view) ? view : defaultView(role);

  let screen = null;
  if (role === 'patient') screen = current === 'find' ? <FindHospitals /> : <PatientStatus account={account} />;
  else if (role === 'hospital') screen = <PortalApp view={current} account={account} />;
  else if (role === 'crew') screen = <CrewApp account={account} />;
  else if (role === 'admin') screen = <AdminApp view={current} account={account} />;
  else screen = <DoctorApp account={account} />;

  return (
    <AppShell role={role} onRole={changeRole} account={account} onSignOut={signOut} view={current} onView={setView} theme={theme} onToggleTheme={toggleTheme} connection={connection}>
      <Suspense fallback={<div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40" /></div>}>{screen}</Suspense>
    </AppShell>
  );
}
