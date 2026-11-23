export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  return (
    <main className="auth-bg">
      <div className={`glass-card auth-card${wide ? ' wide' : ''}`}>
        <p className="brand">HealthTwin <span>AI</span></p>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </main>
  );
}
