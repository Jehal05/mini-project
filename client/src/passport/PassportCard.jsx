import { Badge } from '../ui/Surface.jsx';
import { phoneForDisplay } from '../lib/patientRecord.js';

const TYPE = { heart_attack: 'Heart attack', stent: 'Stent', bypass: 'Bypass', arrhythmia: 'Arrhythmia', heart_failure: 'Heart failure', other: 'Other heart condition' };

// The emergency tier of a patient passport. The same card shows in the owner's preview and on the public page.
export default function PassportCard({ passport, photoSrc, compact = false }) {
  const p = passport;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {photoSrc ? <img src={photoSrc} alt="Patient" className="h-16 w-16 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-accent/10 text-accent">?</span>}
        <div>
          <p className="text-sm text-muted">Patient ID</p>
          <p className="font-title text-xl font-semibold">{p.patientId ?? 'Not issued'}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm text-muted">Blood group</p>
          <p className={`font-title ${compact ? 'text-2xl' : 'text-4xl'} font-bold text-critical`}>{p.bloodGroup ?? 'Unknown'}</p>
        </div>
      </div>

      <section aria-labelledby="pp-allergy">
        <h3 id="pp-allergy" className="mb-1 font-semibold">Severe allergies</h3>
        {p.severeAllergies.length ? (
          <ul className="space-y-1">{p.severeAllergies.map((a) => <li key={a.allergen}><Badge tone="critical">{a.allergen}</Badge>{a.reaction && <span className="ml-2 text-sm text-muted">{a.reaction}</span>}</li>)}</ul>
        ) : <p className="text-sm text-muted">None recorded</p>}
      </section>

      <section aria-labelledby="pp-heart">
        <h3 id="pp-heart" className="mb-1 font-semibold">Heart history</h3>
        {p.cardiacHistory.length ? <ul className="space-y-1 text-sm">{p.cardiacHistory.map((c, i) => <li key={`${c.type}${i}`}>{TYPE[c.type] ?? c.type}{c.year ? `, ${c.year}` : ''}</li>)}</ul> : <p className="text-sm text-muted">None recorded</p>}
      </section>

      <section aria-labelledby="pp-contact">
        <h3 id="pp-contact" className="mb-1 font-semibold">Emergency contact</h3>
        {p.emergencyContact ? (
          <p className="text-sm">{p.emergencyContact.name} ({p.emergencyContact.relation}){' '}
            <a className="font-semibold text-accent underline" href={`tel:${p.emergencyContact.phone}`}>{phoneForDisplay(p.emergencyContact.phone)}</a></p>
        ) : <p className="text-sm text-muted">None recorded</p>}
      </section>
    </div>
  );
}
