import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { ErrorState, Skeleton, Toast } from '../ui/Feedback.jsx';
import { fetchQr, regenerateQr } from '../lib/patientApi.js';
import { passportTokenFrom } from '../lib/patientRecord.js';
import { fetchPassport } from '../lib/passportApi.js';
import PassportCard from '../passport/PassportCard.jsx';

// Feature 20: the QR holds only a link with a random token, never medical data.
export default function PassportPanel() {
  const [qr, setQr] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => { setError(''); fetchQr().then(setQr).catch((e) => setError(e.message)); };
  useEffect(load, []);
  useEffect(() => {
    const token = qr && passportTokenFrom(qr.url);
    if (token) fetchPassport(token).then(setPreview).catch(() => setPreview(null));
  }, [qr]);

  async function rotate() {
    if (!window.confirm('Make a new QR code? Your old printed code and any saved link stop working straight away.')) return;
    setBusy(true); setError('');
    try { setQr(await regenerateQr()); setNote('New QR code made. Print or save it again.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(qr.url); setNote('Link copied.'); } catch { setNote('Could not copy. Select the link and copy it by hand.'); }
  }

  if (error && !qr) return <ErrorState title="Could not load your QR passport" onRetry={load}>{error}</ErrorState>;
  if (!qr) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Your QR medical passport">
        <div className="flex flex-col items-center gap-3">
          {/* Always dark on white so scanners can read it in both themes. */}
          <div className="rounded-ui bg-white p-4"><QRCodeSVG value={qr.url} size={220} level="M" fgColor="#000000" bgColor="#ffffff" title="QR code for your medical passport" /></div>
          <p className="max-w-xs break-all text-center text-xs text-muted">{qr.url}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={copy}>Copy link</Button>
            <Button variant="secondary" onClick={() => window.print()}>Print</Button>
            <Button variant="danger" busy={busy} onClick={rotate}>Make a new code</Button>
          </div>
          {qr.rotatedAt && <p className="text-xs text-muted">New code made on {new Date(qr.rotatedAt).toLocaleDateString()}</p>}
        </div>
        {note && <div className="mt-3"><Toast tone="info" onClose={() => setNote('')}>{note}</Toast></div>}
        {error && <div className="mt-3"><Toast tone="critical" onClose={() => setError('')}>{error}</Toast></div>}
        <p className="mt-3 text-sm text-muted">Anyone who scans this sees only what is on the right. Hospital staff who sign in can open the full record, and every view is logged.</p>
      </Panel>
      <Panel title="What a stranger sees">
        {preview ? <PassportCard passport={preview} photoSrc={preview.photoUrl} compact /> : <Skeleton className="h-40" />}
      </Panel>
    </div>
  );
}
