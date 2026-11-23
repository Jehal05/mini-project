import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_LABEL, portalPath } from '../auth/roles.js';

/** Feature 6: the 403 page explains why access was refused. */
export default function Forbidden({ allowedRoles }) {
  const { user, logout } = useAuth();
  const allowed = allowedRoles?.map((r) => ROLE_LABEL[r]).join(', ');
  return (
    <AuthShell title="You don’t have access to this page" subtitle="403 · Access denied">
      <p>
        You are signed in as <strong>{ROLE_LABEL[user?.role] ?? 'an unknown role'}</strong>.
        {allowed ? <> This page is only for: {allowed}.</> : null}
      </p>
      <div className="actions">
        <Link className="btn btn-primary" to={user ? portalPath(user.role) : '/login'}>Go to my portal</Link>
        {user && <button type="button" className="btn btn-secondary" onClick={() => logout()}>Sign in as someone else</button>}
      </div>
    </AuthShell>
  );
}
