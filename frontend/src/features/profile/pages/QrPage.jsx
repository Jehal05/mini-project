import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { profileApi } from '../api.js';
import { useProfile, useSave } from '../useProfile.jsx';
import { buildWalletCard, svgToPng } from '../walletCard.js';

export default function QrPage() {
  const { patient } = useProfile();
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const load = useSave();
  const act = useSave();
  const box = useRef(null);

  useEffect(() => { load.run(async () => setQr(await profileApi.getQr())); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const regenerate = async () => {
    if (!window.confirm('Make a new QR code? Your old QR code, including any printed card, will stop working immediately.')) return;
    const res = await act.run(() => profileApi.regenerateQr());
    if (res) { setQr(res); setCopied(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(qr.url); setCopied(true); } catch { act.run(async () => { throw new Error('Could not copy. Select the link and copy it by hand.'); }); }
  };
  const download = () => act.run(async () => {
    const png = await svgToPng(box.current.querySelector('svg'));
    (await buildWalletCard({ patientId: patient.patientId, bloodGroup: patient.bloodGroup, qrDataUrl: png })).save(`healthtwin-card-${patient.patientId}.pdf`);
    return true;
  });

  return (
    <section className="glass-card" aria-labelledby="qr-h">
      <h2 id="qr-h">QR passport</h2>
      <p className="hint">Anyone who scans this sees only your blood group, severe allergies, cardiac history, photo and your first emergency contact. Hospitals you are treated at can sign in to see more. The code holds a link, never your medical data.</p>
      {load.error && <p className="form-error" role="alert">{load.error}</p>}
      {qr && (
        <div className="qr-box">
          <div ref={box} className="qr-frame"><QRCodeSVG value={qr.url} size={220} level="M" includeMargin title="Your emergency passport QR code" /></div>
          <div>
            <p className="mono qr-url" data-testid="qr-url">{qr.url}</p>
            {!patient.bloodGroup && <p className="notice">Add your blood group on the Personal tab so it shows on your card.</p>}
            <div className="item-actions">
              <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
              <button type="button" className="btn btn-primary" disabled={act.busy} onClick={download}>Download wallet card (PDF)</button>
              <button type="button" className="btn btn-secondary danger" disabled={act.busy} onClick={regenerate}>Make a new QR code</button>
            </div>
            {act.error && <p className="form-error" role="alert">{act.error}</p>}
            {qr.rotatedAt && <p className="hint">Last renewed {new Date(qr.rotatedAt).toLocaleString('en-IN')}.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
