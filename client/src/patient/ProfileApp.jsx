import { useState } from 'react';
import { Tabs } from '../ui/Data.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { Badge, Card } from '../ui/Surface.jsx';
import PersonalPanel from './PersonalPanel.jsx';
import ContactsPanel from './ContactsPanel.jsx';
import MedicalPanel from './MedicalPanel.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';
import { usePatient } from './usePatient.js';
import { initials } from '../lib/patientRecord.js';

const TABS = [
  { id: 'personal', label: 'About me' }, { id: 'contacts', label: 'Contacts' },
  { id: 'medical', label: 'Medical' }, { id: 'documents', label: 'Documents' },
];

// Features 8, 9, 11-19: the patient's own health profile.
export default function ProfileApp() {
  const { patient, setPatient, error, reload } = usePatient();
  const [tab, setTab] = useState('personal');
  if (error) return <ErrorState title="Could not load your profile" onRetry={reload}>{error}</ErrorState>;
  if (!patient) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-48" /></div>;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 font-title text-lg font-semibold text-accent">{initials(patient.fullName)}</span>
        <div>
          <p className="font-title text-xl font-semibold">{patient.fullName}</p>
          <p className="text-sm text-muted">{patient.patientId ? `Patient ID ${patient.patientId}` : 'Patient ID not issued yet'}{patient.age != null ? `, age ${patient.age}` : ''}</p>
        </div>
        {patient.bloodGroup && <Badge tone="critical" className="ml-auto">Blood group {patient.bloodGroup}</Badge>}
      </Card>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Profile sections" />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'personal' && <PersonalPanel patient={patient} onChange={setPatient} />}
        {tab === 'contacts' && <ContactsPanel patient={patient} onChange={setPatient} />}
        {tab === 'medical' && <MedicalPanel patient={patient} onChange={setPatient} />}
        {tab === 'documents' && <DocumentsPanel />}
      </div>
    </div>
  );
}
