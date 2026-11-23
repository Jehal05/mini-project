import { lazy, Suspense } from 'react';

const DnaHelix = lazy(() => import('../features/landing/DnaHelix.jsx'));

function canDrawDna() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  // A quiet 3D DNA strand beside the card (decorative). Skipped without WebGL, and still when motion is reduced.
  const dna = typeof document !== 'undefined' && canDrawDna();
  const still = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return (
    <main className="auth-bg">
      {dna && (
        <Suspense fallback={null}>
          <DnaHelix className="auth-dna" motion={!still} />
        </Suspense>
      )}
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
