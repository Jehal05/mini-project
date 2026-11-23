import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import PortalLayout from '../../components/PortalLayout.jsx';
import PushToggle from '../push/PushToggle.jsx';
import { saveStaffDevice } from '../push/push.js';
import useIncoming from '../response/useIncoming.js';
import Takeover from '../response/Takeover.jsx';
import '../profile/profile.css';
import '../response/response.css';

const TABS = [
  ['/hospital', 'Dashboard', true, null],
  ['/hospital/incoming', 'Incoming', false, 'incoming'],
  ['/hospital/admissions', 'Admissions', false, null],
  ['/hospital/beds', 'Beds', false, null],
  ['/hospital/ed', 'Emergency dept', false, null],
  ['/hospital/ambulances', 'Ambulances', false, null],
  ['/hospital/crew', 'Crew view', false, null],
  ['/hospital/doctors', 'Doctors', false, null],
  ['/hospital/history', 'Emergency history', false, null],
];

/** Hospital portal frame: the live queue and the red takeover screen sit here so they show on every tab. */
export default function HospitalLayout() {
  const { user } = useAuth();
  const incoming = useIncoming();
  const waiting = incoming.items.filter((i) => i.needsResponse).length;
  return (
    <PortalLayout title="Hospital portal">
      <nav aria-label="Hospital sections" className="tabs">
        {TABS.map(([to, label, end, badge]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{label}{badge && waiting > 0 && <span className="pill pill-red" aria-label={`${waiting} waiting for a response`}> {waiting}</span>}</NavLink>
        ))}
      </nav>
      <PushToggle save={saveStaffDevice} label="Get case alerts when this tab is closed" hint="A notification says a case needs a response. It never names the patient." />
      <Takeover items={incoming.items} offsetMs={incoming.offsetMs} onChanged={incoming.reload} />
      <Outlet context={{ role: user.role, incoming }} />
    </PortalLayout>
  );
}

export const canManage = (role) => role === 'hospital_staff' || role === 'hospital_admin';
