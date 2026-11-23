import { useAuth } from '../auth/AuthContext.jsx';

/** Shown for the last 2 minutes before the 30-minute idle sign-out. */
export default function IdleWarning() {
  const { idleWarning, secondsLeft, stayActive } = useAuth();
  if (!idleWarning) return null;
  const m = Math.floor(secondsLeft / 60);
  const s = String(secondsLeft % 60).padStart(2, '0');
  return (
    <div className="idle-banner" role="alertdialog" aria-labelledby="idle-title">
      <p id="idle-title">You will be signed out in {m}:{s} because of inactivity.</p>
      <button type="button" className="btn btn-primary" onClick={stayActive}>Stay signed in</button>
    </div>
  );
}
