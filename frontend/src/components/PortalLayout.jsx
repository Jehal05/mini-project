import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_LABEL } from '../auth/roles.js';
import GlobalSos from '../features/emergency/GlobalSos.jsx';
import IdleWarning from './IdleWarning.jsx';

export default function PortalLayout({ title, children }) {
  const { user, logout } = useAuth();
  return (
    <div className="portal-bg">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="portal-header">
        <p className="brand">HealthTwin <span>AI</span></p>
        <div className="portal-user">
          <span className="role-badge">{ROLE_LABEL[user.role]}</span>
          <span>{user.name}</span>
          <button type="button" className="btn btn-secondary" onClick={() => logout()}>Sign out</button>
        </div>
      </header>
      <IdleWarning />
      <main className="portal-main" id="main" tabIndex={-1}>
        <h1>{title}</h1>
        {children}
      </main>
      <GlobalSos />
    </div>
  );
}
