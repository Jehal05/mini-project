import { useState } from 'react';
import { Tabs } from '../ui/Data.jsx';
import Dashboard from './Dashboard.jsx';
import Doctors from './Doctors.jsx';
import EdBoard from './EdBoard.jsx';
import History from './History.jsx';
import Profile from './Profile.jsx';

// "My hospital": dashboard, doctors, emergency department, emergency history and profile. `account.role` decides which buttons show; the server enforces it too.
export default function HospitalManage({ account }) {
  const [tab, setTab] = useState('dashboard');
  const admin = account.role === 'hospital_admin';
  const staff = admin || account.role === 'hospital_staff';
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Tabs label="My hospital" value={tab} onChange={setTab} tabs={[{ id: 'dashboard', label: 'Dashboard' }, { id: 'doctors', label: 'Doctors' }, { id: 'ed', label: 'Emergency dept' }, { id: 'history', label: 'History' }, { id: 'profile', label: 'Profile' }]} />
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'doctors' && <Doctors canEdit={admin} />}
      {tab === 'ed' && <EdBoard canEdit={staff} />}
      {tab === 'history' && <History />}
      {tab === 'profile' && <Profile canEdit={admin} />}
    </div>
  );
}
