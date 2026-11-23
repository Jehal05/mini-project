import { useState } from 'react';
import BedsBoard from './BedsBoard.jsx';
import AdmissionsPanel from './AdmissionsPanel.jsx';
import AdmissionDetail from './AdmissionDetail.jsx';
import { Tabs } from '../ui/Data.jsx';

// Inpatient care for a signed-in hospital user or doctor. `account.role` decides what the buttons allow; the server enforces it too.
export default function InpatientApp({ account }) {
  const [tab, setTab] = useState('patients');
  const [openId, setOpenId] = useState(null);
  const staff = account.role === 'hospital_staff' || account.role === 'hospital_admin';
  if (openId) return <AdmissionDetail id={openId} role={account.role} onBack={() => setOpenId(null)} />;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Tabs label="Inpatient care" value={tab} onChange={setTab} tabs={[{ id: 'patients', label: 'Patients' }, { id: 'beds', label: 'Beds' }]} />
      {tab === 'patients' ? <AdmissionsPanel canAdmit={staff} onOpen={setOpenId} /> : <BedsBoard canEdit={staff} />}
    </div>
  );
}
