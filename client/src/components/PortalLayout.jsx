import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_LABEL } from '../auth/roles.js';
import IdleWarning from './IdleWarning.jsx';

export default function PortalLayout({ title, children }) {
  const { user, logout } = useAuth();
  return (
    <div className="portal-bg">
      <header className="portal-header">
        <p className="brand">HealthTwin <span>AI</span></p>
        <div className="portal-user">
          <span className="role-badge">{ROLE_LABEL[user.role]}</span>
          <span>{user.name}</span>
          <button type="button" className="btn btn-secondary" onClick={() => logout()}>Sign out</button>
        </div>
      </header>
      <IdleWarning />
      <main className="portal-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
