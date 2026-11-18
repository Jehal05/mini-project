import PortalLayout from '../components/PortalLayout.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_LABEL } from '../auth/roles.js';

/** Puneet's Hospital Portal plugs in here (incoming emergencies, crew view). */
export default function HospitalHome() {
  const { user } = useAuth();
  return (
    <PortalLayout title="Hospital portal">
      <section className="glass-card" aria-labelledby="acct">
        <h2 id="acct">Your account</h2>
        <dl className="facts">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
          <div><dt>Hospital ID</dt><dd className="mono">{user.hospitalId}</dd></div>
        </dl>
        <p className="hint">You can only see data for your own hospital.</p>
      </section>
    </PortalLayout>
  );
}
