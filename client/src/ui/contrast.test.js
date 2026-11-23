import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reads the real theme.css, so a colour change that breaks readability fails here.
const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8');

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Every block with exactly this selector, in file order, so later ones win like in CSS.
function blocks(selector) {
  const found = [...css.matchAll(new RegExp(`(?:^|\\n)${esc(selector)}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
  if (!found.length) throw new Error(`no block ${selector}`);
  return found;
}
function vars(...selectors) {
  const out = {};
  for (const sel of selectors) for (const b of blocks(sel)) for (const m of b.matchAll(/--([a-z-]+):\s*(\d+) (\d+) (\d+)/g)) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}
const atLeast = (r, min = 4.5) => expect(Number(r.toFixed(2))).toBeGreaterThan(min - 0.01);
const lum = ([r, g, b]) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (top, alpha, under) => top.map((v, i) => v * alpha + under[i] * (1 - alpha)); // colour laid over another

const ROLES = ['patient', 'doctor', 'hospital', 'crew', 'admin'];
const light = vars(':root');
const dark = { ...light, ...vars("[data-theme='dark']") };

describe('contrast, at least 4.5:1 for text', () => {
  it('maths sanity: black on white is 21', () => { expect(Math.round(ratio([0, 0, 0], [255, 255, 255]))).toBe(21); });

  for (const [name, t] of [['light', light], ['dark', dark]]) {
    it(`${name}: body and muted text on paper, surface and raised`, () => {
      for (const bg of ['paper', 'surface', 'raised']) {
        atLeast(ratio(t.ink, t[bg]));
        atLeast(ratio(t.muted, t[bg]));
      }
    });
    it(`${name}: each severity text on its soft panel and on the surface`, () => {
      for (const k of ['critical', 'high', 'moderate', 'low', 'info']) {
        atLeast(ratio(t[k], t[`${k}-soft`]));
        atLeast(ratio(t[k], t.surface));
      }
    });
  }

  it('dark: text on glass stays readable over the brightest glow', () => {
    for (const role of ROLES) {
      const glow = vars(`[data-role='${role}']`).glow;
      const behind = over(glow, 0.45, dark.paper); // brighter than the real top-edge glow
      const glass = over(dark.surface, 0.78, behind);
      atLeast(ratio(dark.ink, glass));
      atLeast(ratio(dark.muted, glass));
      atLeast(ratio(dark.critical, glass));
    }
  });

  for (const role of ROLES) {
    it(`${role}: accent works as text and as a button, in light and dark`, () => {
      const l = { ...light, ...vars(`[data-role='${role}']`) };
      const d = { ...dark, ...vars(`[data-role='${role}']`), ...vars(`[data-theme='dark'][data-role='${role}']`) };
      atLeast(ratio(l.accent, l.surface));
      atLeast(ratio(l['accent-ink'], l.accent));
      atLeast(ratio(d.accent, d.surface));
      atLeast(ratio(d['accent-ink'], d.accent));
    });
  }
});
