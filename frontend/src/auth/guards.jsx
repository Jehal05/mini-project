import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Forbidden from '../pages/Forbidden.jsx';
import { portalPath } from './roles.js';
import { useAuth } from './AuthContext.jsx';

function Loading() {
  return <div className="center-screen" role="status" aria-live="polite">Checking your session…</div>;
}

/** Feature 6 (frontend): signed-in users only; optionally only the listed roles, otherwise the 403 page. */
export function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Forbidden allowedRoles={roles} />;
  return <Outlet />;
}

/** Login / register / reset pages: signed-in users are sent on to their own portal. */
export function PublicOnly() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to={portalPath(user.role)} replace />;
  return <Outlet />;
}
