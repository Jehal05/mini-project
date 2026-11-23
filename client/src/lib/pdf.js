// A small PDF writer with no dependencies (the environment cannot install jsPDF). It makes text, lines and filled rectangles on
// A4 or custom pages with the built-in Helvetica fonts, wraps text, and puts a header and "Page X of Y" on every page.
// It is plain JS (no DOM) so it can be tested in Node. Only Latin text is supported; other characters become "?".

const REG = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500,
  w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
};
const BOLD = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556,
  w: 778, x: 556, y: 556, z: 500, '{': 389, '|': 280, '}': 389, '~': 584,
};
for (let d = 48; d <= 57; d += 1) { REG[String.fromCharCode(d)] = 556; BOLD[String.fromCharCode(d)] = 556; }

// Characters outside ASCII that WinAnsi can show, and plain stand-ins for the rest.
const WIN = { '–': 0x96, '—': 0x97, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 };
const PLAIN = { '₂': '2', '₀': '0', '−': '-', '→': '->', '≥': '>=', '≤': '<=', '×': 'x' };

/** One character as a byte value 32–255 (or 63 for "?"). */
function byteOf(ch) {
  if (PLAIN[ch]) return PLAIN[ch].charCodeAt(0);
  if (WIN[ch]) return WIN[ch];
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 160 && c <= 255) return c;
  return 63;
}
const clean = (s) => Array.from(String(s ?? '').replace(/[\r\n\t]+/g, ' ')).map((ch) => (PLAIN[ch] && PLAIN[ch].length > 1 ? PLAIN[ch] : ch)).join('');

/** Width of text in points. */
export function textWidth(text, size, bold = false) {
  const table = bold ? BOLD : REG;
  let w = 0;
  for (const ch of clean(text)) w += (table[ch] ?? (byteOf(ch) >= 160 ? 556 : 556));
  return (w * size) / 1000;
}

/** Splits text into lines that fit `maxWidth` points. Words longer than a line are broken. */
export function wrapText(text, size, maxWidth, bold = false) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = clean(para).split(' ').filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (textWidth(word, size, bold) > maxWidth) { // a very long word: cut it where it fits
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= maxWidth) line = next; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

const esc = (s) => Array.from(clean(s)).map((ch) => {
  const b = byteOf(ch);
  const c = String.fromCharCode(b);
  if (c === '(' || c === ')' || c === '\\') return `\\${c}`;
  return c;
}).join('');
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => (Array.isArray(c) ? c : [0, 0, 0]).map((v) => num(v)).join(' ');

export const A4 = Object.freeze({ width: 595.28, height: 841.89 });
export const WALLET = Object.freeze({ width: 242.65, height: 153.07 }); // 85.6 x 54 mm, a bank card

export class PdfDocument {
  /** @param {{ title?: string, size?: {width:number,height:number}, header?: string, footer?: string }} o */
  constructor({ title = 'Document', size = A4, header = '', footer = '' } = {}) {
    this.title = title; this.size = size; this.header = header; this.footer = footer;
    this.pages = [];
    this.addPage();
  }

  addPage(size = this.size) { this.pages.push({ size, ops: [] }); return this; }
  get page() { return this.pages[this.pages.length - 1]; }
  get pageCount() { return this.pages.length; }

  /** Text with its baseline at (x, y); y counts from the TOP of the page. */
  text(str, { x = 0, y = 0, size = 11, bold = false, color = [0, 0, 0], align = 'left', maxWidth } = {}) {
    let px = x;
    const w = textWidth(str, size, bold);
    if (align === 'right') px = x - w; else if (align === 'center') px = x - w / 2;
    void maxWidth;
    const py = this.page.size.height - y;
    this.page.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(px)} ${num(py)} Td (${esc(str)}) Tj ET`);
    return w;
  }

  /** A rectangle; y is the TOP edge. */
  rect({ x, y, w, h, fill, stroke, lineWidth = 0.5 }) {
    const py = this.page.size.height - y - h;
    const ops = [];
    if (fill) ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG ${num(lineWidth)} w`);
    ops.push(`${num(x)} ${num(py)} ${num(w)} ${num(h)} re`);
    ops.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    this.page.ops.push(ops.join(' '));
  }

  line(x1, y1, x2, y2, { color = [0.6, 0.6, 0.6], lineWidth = 0.5 } = {}) {
    const H = this.page.size.height;
    this.page.ops.push(`${rgb(color)} RG ${num(lineWidth)} w ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`);
  }

  /** Draws a QR code from horizontal runs [{x, y, w}] on a grid of `cells` cells, as black squares on white. */
  qr(runs, cells, { x, y, size }) {
    this.rect({ x, y, w: size, h: size, fill: [1, 1, 1] });
    const unit = size / cells;
    for (const r of runs) this.rect({ x: x + r.x * unit, y: y + r.y * unit, w: r.w * unit + 0.15, h: unit + 0.15, fill: [0, 0, 0] });
  }

  /** The finished file as bytes. Adds the header and "Page X of Y" to every page. */
  build() {
    const total = this.pages.length;
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages, filled below
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    this.pages.forEach((p, i) => {
      const saved = this.pages.indexOf(p);
      void saved;
      const extra = [];
      const { width: W, height: H } = p.size;
      if (W > 400) { // full-size pages get a running header and footer; the wallet card does not
        if (this.header) extra.push(`BT /F1 8 Tf 0.4 0.4 0.4 rg 40 ${num(H - 26)} Td (${esc(this.header)}) Tj ET`, `0.8 0.8 0.8 RG 0.5 w 40 ${num(H - 32)} m ${num(W - 40)} ${num(H - 32)} l S`);
        const foot = `Page ${i + 1} of ${total}`;
        extra.push(`BT /F1 8 Tf 0.4 0.4 0.4 rg ${num(W - 40 - textWidth(foot, 8))} 22 Td (${esc(foot)}) Tj ET`);
        if (this.footer) extra.push(`BT /F1 8 Tf 0.4 0.4 0.4 rg 40 22 Td (${esc(this.footer)}) Tj ET`);
      }
      const stream = [...p.ops, ...extra].join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
      kids.push(`${page} 0 R`);
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${total} >>`;
    const info = add(`<< /Title (${esc(this.title)}) /Producer (HealthTwin AI) >>`);

    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/** Lays text out top to bottom and starts a new page when the next block does not fit. */
export class Flow {
  constructor(doc, { margin = 40, top = 56, bottom = 44 } = {}) {
    this.doc = doc; this.margin = margin; this.top = top; this.bottom = bottom; this.y = top;
    this.width = doc.size.width - margin * 2;
  }

  get limit() { return this.doc.page.size.height - this.bottom; }
  ensure(h) { if (this.y + h > this.limit) { this.doc.addPage(); this.y = this.top; } }
  space(h = 8) { this.y += h; return this; }

  title(text) { this.ensure(34); this.doc.text(text, { x: this.margin, y: this.y + 20, size: 20, bold: true, color: [0.05, 0.25, 0.3] }); this.y += 30; return this; }
  heading(text) {
    this.ensure(30); this.y += 8;
    this.doc.text(text, { x: this.margin, y: this.y + 12, size: 13, bold: true, color: [0.05, 0.25, 0.3] });
    this.doc.line(this.margin, this.y + 17, this.margin + this.width, this.y + 17, { color: [0.75, 0.85, 0.87] });
    this.y += 24; return this;
  }

  paragraph(text, { size = 10.5, bold = false, color = [0.1, 0.1, 0.1], indent = 0 } = {}) {
    const lines = wrapText(text, size, this.width - indent, bold);
    for (const l of lines) { this.ensure(size + 4); this.doc.text(l, { x: this.margin + indent, y: this.y + size, size, bold, color }); this.y += size + 4; }
    return this;
  }

  /** "Label  value" rows with the label in a fixed column. */
  fields(rows, { labelWidth = 130 } = {}) {
    for (const [label, value] of rows) {
      const lines = wrapText(value === undefined || value === null || value === '' ? '-' : value, 10.5, this.width - labelWidth);
      this.ensure(lines.length * 14 + 2);
      this.doc.text(label, { x: this.margin, y: this.y + 10.5, size: 10, color: [0.4, 0.4, 0.4] });
      lines.forEach((l, i) => this.doc.text(l, { x: this.margin + labelWidth, y: this.y + 10.5 + i * 14, size: 10.5 }));
      this.y += lines.length * 14 + 2;
    }
    return this;
  }

  bullets(items, { empty = 'None recorded' } = {}) {
    if (!items.length) return this.paragraph(empty, { color: [0.45, 0.45, 0.45] });
    for (const it of items) {
      const lines = wrapText(it, 10.5, this.width - 14);
      this.ensure(lines.length * 14 + 2);
      this.doc.text('•', { x: this.margin + 2, y: this.y + 10.5, size: 10.5 });
      lines.forEach((l, i) => this.doc.text(l, { x: this.margin + 14, y: this.y + 10.5 + i * 14, size: 10.5 }));
      this.y += lines.length * 14 + 2;
    }
    return this;
  }

  /** A simple table: columns [{ label, width }] (widths in points) and rows of strings. Rows never split across pages. */
  table(columns, rows, { empty = 'Nothing to show' } = {}) {
    const drawHead = () => {
      this.ensure(22);
      this.doc.rect({ x: this.margin, y: this.y, w: this.width, h: 18, fill: [0.9, 0.95, 0.96] });
      let x = this.margin + 4;
      for (const c of columns) { this.doc.text(c.label, { x, y: this.y + 12.5, size: 9, bold: true, color: [0.1, 0.3, 0.35] }); x += c.width; }
      this.y += 20;
    };
    drawHead();
    if (!rows.length) return this.paragraph(empty, { color: [0.45, 0.45, 0.45] });
    for (const row of rows) {
      const cells = row.map((v, i) => wrapText(v === undefined || v === null || v === '' ? '-' : v, 9.5, columns[i].width - 6));
      const h = Math.max(...cells.map((c) => c.length)) * 12 + 4;
      if (this.y + h > this.limit) { this.doc.addPage(); this.y = this.top; drawHead(); }
      let x = this.margin + 4;
      cells.forEach((lines, i) => { lines.forEach((l, j) => this.doc.text(l, { x, y: this.y + 10 + j * 12, size: 9.5 })); x += columns[i].width; });
      this.y += h;
      this.doc.line(this.margin, this.y - 1, this.margin + this.width, this.y - 1, { color: [0.9, 0.9, 0.9] });
    }
    return this;
  }
}

/** Reads the squares of a qrcode.react SVG: its viewBox size and the horizontal runs from the dark path. */
export function qrFromSvg(svgMarkup) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svgMarkup);
  if (!vb) return null;
  const cells = Number(vb[1]);
  // The dark squares are the LAST path; the first one is the white background.
  const paths = [...svgMarkup.matchAll(/<path[^>]*\sd="([^"]*)"/g)].map((m) => m[1]);
  const d = paths[paths.length - 1] ?? '';
  const runs = [...d.matchAll(/M\s*(\d+)[ ,]\s*(\d+)\s*h\s*(\d+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) }));
  return runs.length ? { cells, runs } : null;
}

/** Hands the bytes to the browser as a download. Browser only. */
export function downloadPdf(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const safeFileName = (s) => String(s ?? 'report').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
