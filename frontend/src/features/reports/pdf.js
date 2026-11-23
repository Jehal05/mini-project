/**
 * Feature 97: PDF reports with jsPDF. Every report has a header (product, title, hospital or patient, generated time)
 * and "Page X of Y" on every page. jsPDF is loaded only when a report is made.
 */
const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const BODY_W = PAGE_W - MARGIN * 2;

const clean = (v) => String(v ?? '—').replace(/[^\x20-\x7e -ÿ–—•]/g, '?'); // the built-in PDF fonts only cover Latin text
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** sections: [{ heading, rows?: [[label, value]], lines?: [text], bullets?: [text] }] */
export async function buildReport({ title, subtitle, sections, generatedAt = new Date() }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  const header = () => {
    pdf.setFillColor(11, 26, 51);
    pdf.rect(0, 0, PAGE_W, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('HealthTwin AI', MARGIN, 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(clean(title), MARGIN, 16);
    if (subtitle) pdf.text(clean(subtitle), MARGIN, 21);
    pdf.text(`Generated ${when(generatedAt)}`, PAGE_W - MARGIN, 16, { align: 'right' });
    pdf.setTextColor(20, 24, 33);
    y = 32;
  };
  const room = (needed) => { if (y + needed > PAGE_H - 18) { pdf.addPage(); header(); } };

  header();
  for (const s of sections) {
    room(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(11, 60, 110);
    pdf.text(clean(s.heading), MARGIN, y);
    pdf.setDrawColor(190, 200, 215);
    pdf.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 7;
    pdf.setTextColor(20, 24, 33);
    pdf.setFontSize(10);
    for (const [label, value] of s.rows ?? []) {
      const wrapped = pdf.splitTextToSize(clean(value), BODY_W - 45);
      room(wrapped.length * 5 + 1);
      pdf.setFont('helvetica', 'bold');
      pdf.text(clean(label), MARGIN, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(wrapped, MARGIN + 45, y);
      y += wrapped.length * 5 + 1;
    }
    for (const line of s.lines ?? []) {
      const wrapped = pdf.splitTextToSize(clean(line), BODY_W);
      room(wrapped.length * 5 + 1);
      pdf.setFont('helvetica', 'normal');
      pdf.text(wrapped, MARGIN, y);
      y += wrapped.length * 5 + 1;
    }
    for (const b of s.bullets ?? []) {
      const wrapped = pdf.splitTextToSize(clean(b), BODY_W - 5);
      room(wrapped.length * 5 + 1);
      pdf.setFont('helvetica', 'normal');
      pdf.text('•', MARGIN, y);
      pdf.text(wrapped, MARGIN + 5, y);
      y += wrapped.length * 5 + 1;
    }
    y += 4;
  }

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(110, 120, 135);
    pdf.text('HealthTwin AI is a demonstration project. All data shown is fictional.', MARGIN, PAGE_H - 8);
    pdf.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }
  return pdf;
}

const list = (items, render) => (items?.length ? items.map(render) : ['None recorded']);

/** Patient report: the record as the hospital (or the patient) sees it, plus the template summary when there is one. */
export function patientReport(p, summaryText) {
  return buildReport({
    title: 'Patient report',
    subtitle: `${p.fullName} (${p.patientId})`,
    sections: [
      { heading: 'Personal information', rows: [['Name', p.fullName], ['Patient ID', p.patientId], ['Age', p.age ?? '—'], ['Gender', p.gender], ['Blood group', p.bloodGroup], ['City', p.city]] },
      ...(summaryText ? [{ heading: 'Summary', lines: summaryText.split('\n') }] : []),
      { heading: 'Allergies', bullets: list(p.allergies, (a) => `${a.allergen}${a.reaction ? ` - ${a.reaction}` : ''} (${a.severity}${a.severity === 'severe' ? ', SEVERE' : ''})`) },
      { heading: 'Cardiac history', bullets: list(p.cardiacConditions, (c) => `${String(c.type).replace('_', ' ')}${c.year ? ` (${c.year})` : ''}${c.notes ? ` - ${c.notes}` : ''}`) },
      { heading: 'Existing conditions', bullets: list(p.medicalConditions, (c) => c.name) },
      { heading: 'Medications', bullets: list(p.medications, (m) => `${m.drug}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? `, ${m.frequency}` : ''}${m.isBloodThinner ? ' [blood thinner]' : ''}`) },
      { heading: 'Previous hospitalizations', bullets: list(p.hospitalizations, (h) => `${h.hospital}, ${day(h.admittedOn)} to ${day(h.dischargedOn)}${h.reason ? ` - ${h.reason}` : ''}`) },
      { heading: 'Family history', bullets: list(p.familyHistory, (f) => `${f.relative}: ${f.condition}${f.ageAtDiagnosis !== undefined ? ` (age ${f.ageAtDiagnosis})` : ''}`) },
      { heading: 'Emergency contacts', bullets: list(p.emergencyContacts, (c) => `${c.priority}. ${c.name} (${c.relation}) ${c.phone}`) },
    ],
  });
}

/** Emergency incident report for one case a hospital received (feature 90 -> 97). */
export function incidentReport(c, hospitalName) {
  const secs = (a, b) => (a && b ? `${Math.round((new Date(b) - new Date(a)) / 1000)} seconds` : '—');
  return buildReport({
    title: 'Emergency incident report',
    subtitle: `${hospitalName} - case ${c.emergencyCaseId}`,
    sections: [
      { heading: 'Case', rows: [['Case ID', c.emergencyCaseId], ['Patient ID', c.patientId ?? 'Not linked'], ['Summary', c.summary], ['Severity', c.severity], ['Status', c.status], ['Outcome', c.outcome ?? '—'], ['Rejection reason', c.rejectionReason ?? '—']] },
      { heading: 'Timeline', rows: [['Received', when(c.receivedAt)], ['Answered', when(c.respondedAt)], ['Answered after', secs(c.receivedAt, c.respondedAt)], ['Expected arrival (minutes)', c.etaMinutes ?? '—'], ['Arrived', when(c.arrivedAt)], ['Arrived after', secs(c.receivedAt, c.arrivedAt)], ['Closed', when(c.closedAt)]] },
    ],
  });
}

/** Discharge summary: the saved summary plus the admission context the server returns with it. */
export function dischargeReport({ summary, context }) {
  const p = context.patient ?? {};
  return buildReport({
    title: 'Discharge summary',
    subtitle: `${p.fullName} (${p.patientId}) - ${context.hospital?.name ?? ''}`,
    sections: [
      { heading: 'Admission', rows: [['Hospital', context.hospital?.name], ['Patient', `${p.fullName} (${p.patientId})`], ['Age / blood group', `${p.age ?? '—'} / ${p.bloodGroup ?? '—'}`], ['Ward', context.ward], ['Admitted', when(context.admittedAt)], ['Discharged', when(context.dischargedAt)], ['Reason', context.reason ?? '—'], ['Doctor in charge', context.doctorName ?? '—']] },
      { heading: 'Diagnosis', lines: [summary.diagnosis] },
      { heading: 'Treatment', lines: [summary.treatment] },
      { heading: 'Discharge medicines', bullets: list(summary.medicines, (m) => `${m.drug} ${m.dose}, ${m.frequency}, for ${m.duration}`) },
      { heading: 'Follow-up', lines: [summary.followUp || 'None specified'] },
      { heading: 'Signed', lines: [`${summary.finalizedByName ?? 'Doctor'}, ${when(summary.finalizedAt)}`] },
    ],
  });
}
