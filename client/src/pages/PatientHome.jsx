import PortalLayout from '../components/PortalLayout.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

/** Daksh's Patient Portal plugs in here (dashboard, twin, SOS). This shell shows only real account data. */
export default function PatientHome() {
  const { user } = useAuth();
  return (
    <PortalLayout title={`Welcome, ${user.name.split(' ')[0]}`}>
      <section className="glass-card" aria-labelledby="acct">
        <h2 id="acct">Your account</h2>
        <dl className="facts">
          <div><dt>Patient ID</dt><dd className="mono">{user.patient?.patientId ?? '—'}</dd></div>
          {user.email && <div><dt>Email</dt><dd>{user.email}</dd></div>}
          {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
        </dl>
      </section>
    </PortalLayout>
  );
}
