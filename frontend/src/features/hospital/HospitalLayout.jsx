import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import PortalLayout from '../../components/PortalLayout.jsx';
import '../profile/profile.css';

const TABS = [
  ['/hospital', 'Dashboard', true, null],
  ['/hospital/admissions', 'Admissions', false, null],
  ['/hospital/beds', 'Beds', false, null],
  ['/hospital/ed', 'Emergency dept', false, null],
  ['/hospital/doctors', 'Doctors', false, null],
  ['/hospital/history', 'Emergency history', false, null],
];

/** Hospital portal frame. Puneet's incoming-alert and crew screens add their own tabs here. */
export default function HospitalLayout() {
  const { user } = useAuth();
  return (
    <PortalLayout title="Hospital portal">
      <nav aria-label="Hospital sections" className="tabs">
        {TABS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{label}</NavLink>
        ))}
      </nav>
      <Outlet context={{ role: user.role }} />
    </PortalLayout>
  );
}

export const canManage = (role) => role === 'hospital_staff' || role === 'hospital_admin';
