import { Link } from 'react-router-dom';
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
      <section className="glass-card" aria-labelledby="live">
        <h2 id="live">Live health dashboard</h2>
        <p className="subtitle">Simulated vitals, emergency detection, SOS and your digital twin.</p>
        <Link className="btn btn-primary" to="/patient/monitor">Open my dashboard</Link>
      </section>
      <section className="glass-card" aria-labelledby="health">
        <h2 id="health">Your health profile</h2>
        <p className="subtitle">Medical history, emergency contacts, documents and your QR passport.</p>
        <Link className="btn btn-primary" to="/patient/profile">Open my health profile</Link>
      </section>
    </PortalLayout>
  );
}
