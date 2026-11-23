// What the patient's home shows for emergencies: the alert and live case, the SOS button, and past incidents.
// Loaded lazily by the dashboard, only for a signed-in patient.
import { useState } from 'react';
import { Button } from './kit.jsx';
import { EmergencySection, EmergencyHistorySection, SosDialog } from './EmergencySection.jsx';

export default function EmergencyArea({ patientId, detection }) {
  const [sosOpen, setSosOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-4">
      <EmergencySection patientId={patientId} refreshKey={refreshKey} detection={detection} />
      <div className="flex justify-center">
        <Button variant="danger" size="lg" icon="octagon-alert" onClick={() => setSosOpen(true)} aria-label="SOS: ask for emergency help">SOS</Button>
      </div>
      <SosDialog open={sosOpen} onClose={() => setSosOpen(false)} patientId={patientId} onSent={() => setRefreshKey((n) => n + 1)} />
      <EmergencyHistorySection patientId={patientId} refreshKey={refreshKey} />
    </div>
  );
}
