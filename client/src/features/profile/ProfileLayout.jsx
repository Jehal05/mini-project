import { NavLink, Outlet } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout.jsx';
import SevereAllergyBanner from './SevereAllergyBanner.jsx';
import { ProfileProvider, useProfile } from './useProfile.jsx';
import './profile.css';

const TABS = [
  ['personal', 'Personal'],
  ['medical', 'Medical'],
  ['contacts', 'Emergency contacts'],
  ['documents', 'Documents'],
  ['passport', 'QR passport'],
  ['settings', 'Settings'],
];

function Frame() {
  const { patient, error, retry } = useProfile();
  return (
    <PortalLayout title="My health profile">
      <p><NavLink to="/patient" end>← Back to home</NavLink></p>
      <nav aria-label="Profile sections" className="tabs">
        {TABS.map(([path, label]) => <NavLink key={path} to={path} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{label}</NavLink>)}
      </nav>
      {error && <div className="form-error" role="alert">{error} <button type="button" className="link-btn" onClick={retry}>Try again</button></div>}
      {!patient && !error && <p role="status">Loading your profile…</p>}
      {patient && (
        <>
          <SevereAllergyBanner allergies={patient.allergies} />
          <Outlet />
        </>
      )}
    </PortalLayout>
  );
}

export default function ProfileLayout() {
  return <ProfileProvider><Frame /></ProfileProvider>;
}
