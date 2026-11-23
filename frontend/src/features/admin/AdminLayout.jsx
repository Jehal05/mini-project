import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout.jsx';
import AuditLogViewer from '../../pages/AuditLogViewer.jsx';
import UnresolvedAlerts from './UnresolvedAlerts.jsx';
import HospitalsPage from './HospitalsPage.jsx';
import '../profile/profile.css';

/** Central Admin Portal. Command centre, analytics and settings (Puneet) get their own tabs here. */
export default function AdminLayout() {
  return (
    <PortalLayout title="Central admin portal">
      <UnresolvedAlerts />
      <nav aria-label="Admin sections" className="tabs">
        <NavLink to="/admin/hospitals" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Hospitals</NavLink>
        <NavLink to="/admin/audit" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Audit log</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="hospitals" replace />} />
        <Route path="hospitals" element={<HospitalsPage />} />
        <Route path="audit" element={<AuditLogViewer />} />
        <Route path="*" element={<Navigate to="hospitals" replace />} />
      </Routes>
    </PortalLayout>
  );
}
