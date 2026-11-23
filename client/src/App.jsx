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
const ProfileApp = lazy(() => import('./patient/ProfileApp.jsx'));
const ScenarioPanel = lazy(() => import('./admin/ScenarioPanel.jsx'));
const InpatientApp = lazy(() => import('./inpatient/InpatientApp.jsx'));
const HospitalManage = lazy(() => import('./hospitalmgmt/HospitalManage.jsx'));
const PassportPanel = lazy(() => import('./patient/PassportPanel.jsx'));
const PassportLookup = lazy(() => import('./portal/PassportLookup.jsx'));

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
  if (role === 'patient') {
    if (current === 'find') screen = <FindHospitals />;
    else if (current === 'profile') screen = account ? <ProfileApp /> : <DemoNeedsLogin what="your profile" />;
    else if (current === 'passport') screen = account ? <PassportPanel /> : <DemoNeedsLogin what="your QR passport" />;
    else screen = <PatientStatus account={account} />;
  } else if (role === 'hospital') screen = current === 'passport' ? <PassportLookup /> : current === 'inpatient' ? (account ? <InpatientApp account={account} /> : <DemoNeedsLogin what="inpatient care" />) : current === 'manage' ? (account ? <HospitalManage account={account} /> : <DemoNeedsLogin what="hospital management" />) : <PortalApp view={current} account={account} />;
  else if (role === 'crew') screen = <CrewApp account={account} />;
  else if (role === 'admin') screen = current === 'monitoring' ? (account ? <ScenarioPanel /> : <DemoNeedsLogin what="the monitoring controls" />) : <AdminApp view={current} account={account} />;
  else screen = current === 'inpatient' ? (account ? <InpatientApp account={account} /> : <DemoNeedsLogin what="inpatient care" />) : <DoctorApp account={account} />;

  return (
    <AppShell role={role} onRole={changeRole} account={account} onSignOut={signOut} view={current} onView={setView} theme={theme} onToggleTheme={toggleTheme} connection={connection}>
      <Suspense fallback={<div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40" /></div>}>{screen}</Suspense>
    </AppShell>
  );
}

// Profile and passport belong to a signed-in patient. Demo mode has no account to show.
function DemoNeedsLogin({ what }) {
  return <p className="rounded-ui border border-line bg-surface p-4 text-sm text-muted">Sign in as a patient to see {what}. Demo mode has no patient account.</p>;
}
