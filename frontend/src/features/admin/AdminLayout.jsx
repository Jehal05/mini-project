import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout.jsx';
import AuditLogViewer from '../../pages/AuditLogViewer.jsx';
import UnresolvedAlerts from './UnresolvedAlerts.jsx';
import { lazy, Suspense } from 'react';
import HospitalsPage from './HospitalsPage.jsx';
import EmergenciesPage from './EmergenciesPage.jsx';
import BackupPage from './BackupPage.jsx';

const AnalyticsPage = lazy(() => import('./AnalyticsPage.jsx')); // charts load only when opened
import '../profile/profile.css';

/** Central Admin Portal. Command centre, analytics and settings (Puneet) get their own tabs here. */
export default function AdminLayout() {
  return (
    <PortalLayout title="Central admin portal">
      <UnresolvedAlerts />
      <nav aria-label="Admin sections" className="tabs">
        <NavLink to="/admin/hospitals" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Hospitals</NavLink>
        <NavLink to="/admin/emergencies" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Emergencies</NavLink>
        <NavLink to="/admin/analytics" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Analytics</NavLink>
        <NavLink to="/admin/audit" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Audit log</NavLink>
        <NavLink to="/admin/backup" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Backup</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="hospitals" replace />} />
        <Route path="hospitals" element={<HospitalsPage />} />
        <Route path="emergencies" element={<EmergenciesPage />} />
        <Route path="analytics" element={<Suspense fallback={<p role="status">Loading charts…</p>}><AnalyticsPage /></Suspense>} />
        <Route path="audit" element={<AuditLogViewer />} />
        <Route path="backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="hospitals" replace />} />
      </Routes>
    </PortalLayout>
  );
}
