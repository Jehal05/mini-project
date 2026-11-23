import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parsePassportToken } from '../passportToken.js';
import EmergencyCalls from './EmergencyCalls.jsx';
import '../profile.css';

/** Opens the camera to read a passport QR (html5-qrcode), with a paste box as a fallback. No login needed. */
export default function ScanPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [text, setText] = useState('');
  const scanner = useRef(null);

  const go = (value) => {
    const token = parsePassportToken(value);
    if (!token) { setError('That is not a HealthTwin passport QR code or link.'); return false; }
    navigate(`/p/${token}`);
    return true;
  };

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        const s = new Html5Qrcode('qr-reader');
        scanner.current = s;
        await s.start({ facingMode: 'environment' }, { fps: 8, qrbox: 240 }, (decoded) => { if (go(decoded)) s.stop().catch(() => {}); }, () => {});
      } catch {
        if (!stopped) setCameraError('The camera is not available. You can paste the link from the QR code below.');
      }
    })();
    return () => {
      stopped = true;
      const s = scanner.current;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="passport-bg">
      <main className="passport">
        <p className="brand">HealthTwin <span>AI</span> · Scan a passport</p>
        <EmergencyCalls />
        <section className="glass-card">
          <h1>Scan a QR passport</h1>
          <div id="qr-reader" className="qr-reader" />
          {cameraError && <p className="notice" role="status">{cameraError}</p>}
          <form onSubmit={(e) => { e.preventDefault(); go(text); }} noValidate>
            <label htmlFor="qr-link">Or paste the link</label>
            <input id="qr-link" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="https://…/p/…" />
            {error && <p className="field-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary">Open passport</button>
          </form>
          <p><Link to="/login">Sign in</Link></p>
        </section>
      </main>
    </div>
  );
}
