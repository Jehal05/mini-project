import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { passportApi } from '../api.js';
import { CARDIAC_LABELS } from '../constants.js';
import SevereAllergyBanner from '../SevereAllergyBanner.jsx';
import EmergencyCalls from './EmergencyCalls.jsx';

const GEO_MESSAGE = {
  1: 'We need your location to send a report. Allow location in your browser and try again, or call 112 / 108 now.',
  2: 'Your location could not be found. Try again outside or near a window, or call 112 / 108 now.',
  3: 'Finding your location took too long. Try again, or call 112 / 108 now.',
};

function Photo({ token, has }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    let live = true;
    if (has) passportApi.fullPhotoBlob(token).then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [token, has]);
  return src ? <img className="photo big" src={src} alt="The patient" /> : <div className="photo big placeholder" aria-hidden="true">No photo</div>;
}

/** Feature 106: "Report an emergency for this person". Sends the scanner's location; never claims more than it does. */
function BystanderReport({ token }) {
  const [phase, setPhase] = useState('idle'); // idle | locating | sending | done | error
  const [message, setMessage] = useState('');
  const busy = useRef(false);

  const report = () => {
    if (busy.current) return; // a second tap while one is in flight does nothing
    busy.current = true;
    setMessage('');
    if (!navigator.geolocation) {
      busy.current = false; setPhase('error'); setMessage('This browser cannot share your location, so we cannot send a report. Call 112 / 108 now.');
      return;
    }
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setPhase('sending');
        try {
          await passportApi.report(token, { latitude: coords.latitude, longitude: coords.longitude, ...(Number.isFinite(coords.accuracy) && { accuracyMeters: Math.round(coords.accuracy) }) });
          setPhase('done');
        } catch (err) {
          setPhase('error');
          setMessage(`${err.message} If this is an emergency, call 112 / 108 now.`);
        } finally { busy.current = false; }
      },
      (err) => { busy.current = false; setPhase('error'); setMessage(GEO_MESSAGE[err.code] ?? GEO_MESSAGE[2]); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  if (phase === 'done') {
    return (
      <div className="notice" role="status">
        <strong>Report received.</strong> Your location was recorded for the response team. This does not call emergency services by itself, so please call 112 or 108 now if you have not already.
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="btn btn-danger" onClick={report} disabled={phase === 'locating' || phase === 'sending'}>
        {phase === 'locating' ? 'Finding your location…' : phase === 'sending' ? 'Sending report…' : 'Report an emergency for this person'}
      </button>
      <p className="hint">Sends your current location. Your browser will ask for permission.</p>
      {phase === 'error' && <p className="form-error" role="alert">{message}</p>}
    </div>
  );
}

export default function PassportPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    passportApi.scan(token)
      .then((r) => live && setState({ status: 'ok', p: r.passport }))
      .catch((e) => live && setState({ status: e.status === 404 ? 'invalid' : 'error', message: e.message }));
    return () => { live = false; };
  }, [token]);

  return (
    <div className="passport-bg">
      <main className="passport">
        <p className="brand">HealthTwin <span>AI</span> · Emergency passport</p>
        <EmergencyCalls />
        {state.status === 'loading' && <p role="status">Loading…</p>}
        {state.status === 'invalid' && (
          <div className="glass-card"><h1>This passport link is not valid</h1><p>It may have been replaced by a newer QR code. If someone needs help, call 112 or 108.</p></div>
        )}
        {state.status === 'error' && <div className="form-error" role="alert">{state.message} If someone needs help, call 112 or 108.</div>}
        {state.status === 'ok' && (() => {
          const p = state.p;
          return (
            <>
              <SevereAllergyBanner allergies={p.severeAllergies} />
              <section className="glass-card" aria-label="Emergency details">
                <div className="passport-top">
                  <Photo token={token} has={p.hasPhoto} />
                  <div>
                    <p className="hint">Patient ID</p>
                    <p className="mono">{p.patientId}</p>
                    <p className="hint">Blood group</p>
                    <p className="blood" data-testid="blood-group">{p.bloodGroup ?? 'Unknown'}</p>
                  </div>
                </div>
                <h2>Cardiac history</h2>
                {p.cardiacHistory.length === 0 ? <p className="hint">None recorded.</p> : (
                  <ul>{p.cardiacHistory.map((c, i) => <li key={i}>{CARDIAC_LABELS[c.type] ?? c.type}{c.year ? ` (${c.year})` : ''}</li>)}</ul>
                )}
                <h2>Emergency contact</h2>
                {p.emergencyContact ? (
                  <p>{p.emergencyContact.name} ({p.emergencyContact.relation}) · <a href={`tel:${p.emergencyContact.phone}`}>{p.emergencyContact.phone}</a></p>
                ) : <p className="hint">None recorded.</p>}
              </section>
              <section className="glass-card" aria-label="Report an emergency"><BystanderReport token={token} /></section>
              <p className="hint">Hospital staff: <Link to={`/p/${token}/full`}>sign in to see the full record</Link>. Every view is logged.</p>
            </>
          );
        })()}
      </main>
    </div>
  );
}
