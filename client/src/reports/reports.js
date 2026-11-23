// The PDF documents of the plan: the wallet passport card (feature 20), the discharge summary (89) and the patient and
// emergency incident reports (97). Each function takes plain data and returns PDF bytes, so they can be tested without a browser.
import { A4, Flow, PdfDocument, WALLET } from '../lib/pdf.js';
import { CANCEL_LABEL, SOURCE_TEXT, STATUS_TEXT } from '../emergency/status.js';

export const SIMULATED_NOTE = 'Simulated data for demonstration. Not a medical device.';
const HEART = { heart_attack: 'Heart attack', stent: 'Stent', bypass: 'Bypass', arrhythmia: 'Arrhythmia', heart_failure: 'Heart failure', other: 'Other heart condition' };
const GENDER = { male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefers not to say' };
const TEAL = [0.05, 0.25, 0.3];
const RED = [0.75, 0.1, 0.1];

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const stamp = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
const generated = (now) => `Generated ${stamp(now)}`;

/** Wallet card, 85.6 x 54 mm: front has the QR and the ID, back has the emergency tier. `qr` is { cells, runs } from qrFromSvg. */
export function walletCardPdf({ passport: p, qr, url, now = new Date() }) {
  const doc = new PdfDocument({ title: `HealthTwin passport ${p.patientId ?? ''}`, size: WALLET });
  const { width: W, height: H } = WALLET;
  // Front
  doc.rect({ x: 0, y: 0, w: W, h: 22, fill: TEAL });
  doc.text('HealthTwin AI  Medical passport', { x: 10, y: 15, size: 9.5, bold: true, color: [1, 1, 1] });
  if (qr) doc.qr(qr.runs, qr.cells, { x: 10, y: 30, size: 100 });
  doc.text(p.patientId ?? 'ID not issued', { x: 122, y: 48, size: 12, bold: true });
  doc.text('Blood group', { x: 122, y: 70, size: 7.5, color: [0.4, 0.4, 0.4] });
  doc.text(p.bloodGroup ?? 'Unknown', { x: 122, y: 92, size: 22, bold: true, color: RED });
  doc.text('Scan for emergency details', { x: 122, y: 112, size: 7.5, color: [0.3, 0.3, 0.3] });
  doc.text('Simulated demo card', { x: 122, y: 122, size: 7.5, color: [0.3, 0.3, 0.3] });
  doc.text(url ? url.replace(/^https?:\/\//, '').slice(0, 52) : '', { x: 10, y: H - 10, size: 5.5, color: [0.4, 0.4, 0.4] });
  // Back
  doc.addPage();
  doc.rect({ x: 0, y: 0, w: W, h: 20, fill: RED });
  doc.text('In an emergency', { x: 10, y: 14, size: 9.5, bold: true, color: [1, 1, 1] });
  let y = 34;
  const row = (label, value) => { doc.text(label, { x: 10, y, size: 6.5, color: [0.4, 0.4, 0.4] }); doc.text(String(value).slice(0, 52), { x: 10, y: y + 9, size: 8.5, bold: true }); y += 22; };
  row('Severe allergies', p.severeAllergies?.length ? p.severeAllergies.map((a) => a.allergen).join(', ') : 'None recorded');
  row('Heart history', p.cardiacHistory?.length ? p.cardiacHistory.map((c) => `${HEART[c.type] ?? c.type}${c.year ? ` ${c.year}` : ''}`).join(', ') : 'None recorded');
  row('Emergency contact', p.emergencyContact ? `${p.emergencyContact.name} (${p.emergencyContact.relation}) ${p.emergencyContact.phone}` : 'None recorded');
  doc.text('Call 112 or 108', { x: 10, y: H - 8, size: 7.5, bold: true, color: RED });
  void now;
  return doc.build();
}

/** Discharge summary of one stay. `admission` is the hospital's view of it (patient, bed, dates), `summary` the finished or draft summary. */
export function dischargePdf({ admission: a, summary: s, hospitalName = 'Hospital', finalized = true, now = new Date() }) {
  const doc = new PdfDocument({ title: 'Discharge summary', header: `${hospitalName}  Discharge summary`, footer: SIMULATED_NOTE });
  const f = new Flow(doc).title('Discharge summary');
  if (!finalized) f.paragraph('DRAFT: this summary has not been finalized.', { bold: true, color: RED });
  f.paragraph(generated(now), { size: 9, color: [0.4, 0.4, 0.4] });
  f.heading('Patient and stay');
  f.fields([
    ['Patient', a?.patientName], ['Patient ID', a?.patientId], ['Hospital', hospitalName],
    ['Ward and bed', [a?.ward, a?.bedLabel].filter(Boolean).join(' ') || ''], ['Admitted', stamp(a?.admittedAt)], ['Discharged', stamp(a?.dischargedAt)],
    ['Reason for admission', a?.reason],
  ]);
  f.heading('Diagnosis'); f.paragraph(s?.diagnosis || 'Not recorded');
  f.heading('Treatment'); f.paragraph(s?.treatment || 'Not recorded');
  f.heading('Discharge medicines');
  f.table([{ label: 'Medicine', width: 170 }, { label: 'Dose', width: 100 }, { label: 'How often', width: 130 }, { label: 'For how long', width: 115 }],
    (s?.medicines ?? []).map((m) => [m.drug, m.dose, m.frequency, m.duration]), { empty: 'No medicines' });
  f.heading('Follow-up'); f.paragraph(s?.followUp || 'None given');
  f.space(14);
  f.paragraph(s?.finalizedByName ? `Finalized by ${s.finalizedByName} on ${stamp(s.finalizedAt)}` : 'Not finalized yet', { size: 9.5, color: [0.3, 0.3, 0.3] });
  return doc.build();
}

/** The patient's own record, for them or to hand to a doctor. */
export function patientReportPdf({ patient: p, now = new Date() }) {
  const doc = new PdfDocument({ title: `Patient report ${p.patientId ?? ''}`, header: 'HealthTwin AI  Patient report', footer: SIMULATED_NOTE });
  const f = new Flow(doc).title('Patient report');
  f.paragraph(generated(now), { size: 9, color: [0.4, 0.4, 0.4] });
  f.heading('Personal information');
  f.fields([
    ['Name', p.fullName], ['Patient ID', p.patientId], ['Date of birth', day(p.dateOfBirth) + (p.age != null ? ` (age ${p.age})` : '')],
    ['Gender', GENDER[p.gender]], ['Blood group', p.bloodGroup], ['Phone', p.phone], ['Address', [p.address, p.city].filter(Boolean).join(', ')],
  ]);
  f.heading('Heart conditions'); f.bullets((p.cardiacConditions ?? []).map((c) => `${HEART[c.type] ?? c.type}${c.year ? `, ${c.year}` : ''}`));
  f.heading('Other medical conditions'); f.bullets((p.medicalConditions ?? []).map((c) => `${c.name}${c.notes ? `: ${c.notes}` : ''}`));
  f.heading('Allergies'); f.bullets((p.allergies ?? []).map((a) => `${a.allergen}${a.severity ? ` (${a.severity})` : ''}${a.reaction ? `, ${a.reaction}` : ''}`));
  f.heading('Medicines'); f.bullets((p.medications ?? []).map((m) => `${m.drug}, ${[m.dose, m.frequency].filter(Boolean).join(', ')}${m.isBloodThinner ? ' [BLOOD THINNER]' : ''}`));
  f.heading('Previous hospital stays');
  f.table([{ label: 'Hospital', width: 150 }, { label: 'Admitted', width: 85 }, { label: 'Discharged', width: 85 }, { label: 'Reason', width: 195 }],
    (p.hospitalizations ?? []).map((h) => [h.hospital, day(h.admittedOn), day(h.dischargedOn), h.reason]), { empty: 'None recorded' });
  f.heading('Family history'); f.bullets((p.familyHistory ?? []).map((r) => `${r.relative}: ${r.condition}${r.ageAtDiagnosis ? ` at ${r.ageAtDiagnosis}` : ''}`));
  f.heading('Emergency contacts');
  f.table([{ label: 'Priority', width: 55 }, { label: 'Name', width: 150 }, { label: 'Relation', width: 100 }, { label: 'Phone', width: 210 }],
    (p.emergencyContacts ?? []).map((c) => [String(c.priority ?? ''), c.name, c.relation, c.phone]), { empty: 'None recorded' });
  return doc.build();
}

/** One emergency from detection to its end. `incident` is the case view from the emergency API. */
export function incidentReportPdf({ incident: c, patientName, now = new Date() }) {
  const doc = new PdfDocument({ title: `Emergency incident ${c.caseNumber ?? ''}`, header: 'HealthTwin AI  Emergency incident report', footer: SIMULATED_NOTE });
  const f = new Flow(doc).title('Emergency incident report');
  f.paragraph(generated(now), { size: 9, color: [0.4, 0.4, 0.4] });
  f.heading('Summary');
  f.fields([
    ['Case', c.caseNumber ?? c.id], ['Patient', [patientName, c.patientCode].filter(Boolean).join(' ')], ['How it started', SOURCE_TEXT[c.source] ?? c.source],
    ['Status', STATUS_TEXT[c.status] ?? c.status], ['Severity level', c.severity != null ? String(c.severity) : ''], ['Started', stamp(c.createdAt)], ['Ended', stamp(c.closedAt)],
    ['Search rounds', c.escalation?.round != null ? `${c.escalation.round} of 3 (up to ${c.escalation.radiusKm ?? '?'} km)` : ''],
    ['Cancelled because', c.cancellation ? `${CANCEL_LABEL[c.cancellation.reason] ?? c.cancellation.reason}${c.cancellation.note ? `: ${c.cancellation.note}` : ''}` : ''],
  ]);
  if (c.symptoms) {
    const on = Object.entries(c.symptoms).filter(([, v]) => v === true).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase());
    f.heading('Symptoms reported'); f.bullets(on, { empty: 'None reported' });
  }
  f.heading('Timeline');
  f.table([{ label: 'Time', width: 110 }, { label: 'Who', width: 75 }, { label: 'What happened', width: 330 }],
    (c.timeline ?? []).map((e) => [stamp(e.at), e.actorRole ?? 'system', e.message ?? e.type]), { empty: 'No events' });
  if ((c.contactAlerts ?? []).length) {
    f.heading('Emergency contacts alerted');
    f.table([{ label: 'Name', width: 150 }, { label: 'Relation', width: 100 }, { label: 'Sent', width: 265 }], c.contactAlerts.map((a) => [a.name, a.relation, stamp(a.sentAt)]));
  }
  return doc.build();
}

export const PDF_SIZES = { A4, WALLET };
