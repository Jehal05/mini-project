import { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';
import { Card } from '../ui/Surface.jsx';
import Icon from '../ui/icons.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import PassportCard from './PassportCard.jsx';
import { fetchPassport, reportEmergency } from '../lib/passportApi.js';

// Public page behind the QR code (features 20, 106). No sign-in. Calling 112 comes first, always.
export default function PublicPassport({ token }) {
  const [passport, setPassport] = useState(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState({ state: 'idle', message: '' });

  useEffect(() => { fetchPassport(token).then(setPassport).catch((e) => setError(e.status === 404 ? 'This passport link is not valid. It may have been replaced by a new code.' : e.message)); }, [token]);

  function send() {
    if (!navigator.geolocation) { setReport({ state: 'error', message: 'This device cannot share its location. Call 112 or 108 now and say where you are.' }); return; }
    setReport({ state: 'busy', message: '' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await reportEmergency(token, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
          setReport({ state: 'sent', message: 'Report sent with your location. Now call 112 or 108.' });
        } catch (e) { setReport({ state: 'error', message: `${e.message}${e.status === 429 ? '' : ' Call 112 or 108 now.'}` }); }
      },
      () => setReport({ state: 'error', message: 'Location was not shared. Allow location and try again, or call 112 or 108 and say where you are.' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  return (
    <div className="paper-bg min-h-screen px-4 py-6 text-ink">
      <main className="mx-auto max-w-lg space-y-4">
        <h1 className="font-title text-2xl font-semibold">HealthTwin medical passport</h1>
        <div className="grid grid-cols-2 gap-3">
          <a href="tel:112" className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-ui bg-critical px-4 text-lg font-bold text-white"><Icon name="phone" size={20} />Call 112</a>
          <a href="tel:108" className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-ui bg-critical px-4 text-lg font-bold text-white"><Icon name="phone" size={20} />Call 108</a>
        </div>
        {error && <ErrorState title="Passport not available">{error}</ErrorState>}
        {!error && !passport && <Skeleton className="h-64" />}
        {passport && (
          <>
            <Card className="p-4"><PassportCard passport={passport} photoSrc={passport.photoUrl} /></Card>
            <Card className="space-y-2 p-4">
              <h2 className="font-title text-lg font-semibold">Is this person in an emergency?</h2>
              <p className="text-sm text-muted">Call first. Then send their location so their hospital and contacts are told where they are.</p>
              <Button size="lg" className="w-full" busy={report.state === 'busy'} disabled={report.state === 'sent'} onClick={send}>Send my location for this person</Button>
              {report.message && <p role="status" aria-live="polite" className={`text-sm font-semibold ${report.state === 'sent' ? 'text-accent' : 'text-critical'}`}>{report.message}</p>}
            </Card>
          </>
        )}
        <p className="text-center text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
      </main>
    </div>
  );
}
