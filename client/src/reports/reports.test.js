import { describe, expect, it } from 'vitest';
import { qrFromSvg, textWidth, wrapText } from '../lib/pdf.js';
import { dischargePdf, incidentReportPdf, patientReportPdf, walletCardPdf } from './reports.js';

const text = (bytes) => Buffer.from(bytes).toString('latin1');
const pages = (bytes) => (text(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length;

describe('pdf helpers', () => {
  it('wraps long text within the width', () => {
    const lines = wrapText('word '.repeat(80), 10, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(205);
  });
  it('reads dark runs from a qrcode.react svg', () => {
    const qr = qrFromSvg('<svg viewBox="0 0 5 5"><path fill="#fff" d="M0,0h5v5H0z"/><path fill="#000" d="M0 0h2v1H0zM3 1h1v1H3z"/></svg>');
    expect(qr).toEqual({ cells: 5, runs: [{ x: 0, y: 0, w: 2 }, { x: 3, y: 1, w: 1 }] });
    expect(qrFromSvg('<svg></svg>')).toBeNull();
  });
});

describe('reports', () => {
  const qr = { cells: 5, runs: [{ x: 0, y: 0, w: 2 }] };
  it('wallet card has a front and a back', () => {
    const b = walletCardPdf({ passport: { patientId: 'HT-1', bloodGroup: 'B+', severeAllergies: [], cardiacHistory: [] }, qr, url: 'http://x/p/t' });
    expect(text(b).startsWith('%PDF')).toBe(true);
    expect(pages(b)).toBe(2);
  });
  it('discharge summary marks a draft', () => {
    const b = dischargePdf({ admission: { patientName: 'A' }, summary: { diagnosis: 'd', treatment: 't', medicines: [] }, finalized: false });
    expect(text(b).startsWith('%PDF')).toBe(true);
    expect(text(b)).toContain('DRAFT');
  });
  it('patient report copes with an empty record', () => {
    expect(text(patientReportPdf({ patient: { fullName: 'A' } })).startsWith('%PDF')).toBe(true);
  });
  it('incident report runs over pages for long timelines', () => {
    const timeline = Array.from({ length: 120 }, (_, i) => ({ at: '2026-11-23T09:00:00Z', message: `event ${i}` }));
    const b = incidentReportPdf({ incident: { id: 'x', status: 'pending', timeline } });
    expect(pages(b)).toBeGreaterThan(1);
  });
});
