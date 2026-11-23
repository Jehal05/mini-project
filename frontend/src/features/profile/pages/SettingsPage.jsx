import { useEffect, useState } from 'react';
import { profileApi } from '../api.js';
import { useProfile, useSave } from '../useProfile.jsx';

const PERMISSION_TEXT = {
  granted: 'Allowed in this browser',
  denied: 'Blocked in this browser. Change it in your browser\'s site settings.',
  prompt: 'Not decided yet in this browser',
  unsupported: 'This browser cannot tell us',
};

/** Reads the browser's location permission, and follows it if the person changes it. */
export function useLocationPermission() {
  const [state, setState] = useState('unsupported');
  useEffect(() => {
    let status;
    let live = true;
    const read = () => live && setState(status.state);
    navigator.permissions?.query?.({ name: 'geolocation' }).then((s) => { status = s; read(); s.addEventListener?.('change', read); }).catch(() => {});
    return () => { live = false; status?.removeEventListener?.('change', read); };
  }, []);
  return [state, setState];
}

export default function SettingsPage() {
  const { patient, apply } = useProfile();
  const save = useSave();
  const [permission, setPermission] = useLocationPermission();
  const prefs = patient.notificationPreferences;
  const consent = patient.consent?.location;

  const change = (body) => save.run(async () => apply(await profileApi.savePreferences(body)));
  const askBrowser = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => setPermission('granted'), (err) => setPermission(err.code === 1 ? 'denied' : permission), { timeout: 10000 });
  };

  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="notif-h">
        <h2 id="notif-h">Notification preferences</h2>
        <p className="hint">How we may reach you and your contacts. A contact's "Send test alert" always goes out, whatever you choose here.</p>
        {[['email', 'Email'], ['webPush', 'Web push'], ['whatsapp', 'WhatsApp']].map(([key, text]) => (
          <label key={key} className="check"><input type="checkbox" checked={Boolean(prefs?.[key])} disabled={save.busy} onChange={(e) => change({ [key]: e.target.checked })} /> {text}</label>
        ))}
      </section>

      <section className="glass-card" aria-labelledby="loc-h">
        <h2 id="loc-h">Location permission</h2>
        <dl className="facts">
          <div><dt>Your consent</dt><dd data-testid="consent-status">{consent ? 'Given — we may use your location during an emergency' : 'Not given'}</dd></div>
          <div><dt>This browser</dt><dd data-testid="browser-permission">{PERMISSION_TEXT[permission]}</dd></div>
        </dl>
        <label className="check"><input type="checkbox" checked={Boolean(consent)} disabled={save.busy} onChange={(e) => change({ locationConsent: e.target.checked })} /> Allow HealthTwin to use my location in an emergency</label>
        {permission === 'prompt' && <button type="button" className="btn btn-secondary" onClick={askBrowser}>Allow in this browser</button>}
      </section>
      {save.error && <p className="form-error" role="alert">{save.error}</p>}
    </div>
  );
}
