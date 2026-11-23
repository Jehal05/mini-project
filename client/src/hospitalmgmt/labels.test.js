import { describe, it, expect } from 'vitest';
import { formatSeconds, HISTORY_TABS, OUTCOMES } from './labels.js';

describe('labels', () => {
  it('formats seconds', () => { expect(formatSeconds(null)).toBe('–'); expect(formatSeconds(45)).toBe('45 s'); expect(formatSeconds(95)).toBe('1 min 35 s'); });
  it('every history tab other than all has an outcome label', () => { for (const [id] of HISTORY_TABS.filter(([i]) => i !== 'all')) expect(OUTCOMES[id]).toBeTruthy(); });
});
