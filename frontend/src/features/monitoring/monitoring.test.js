import { describe, it, expect } from 'vitest'
import { ecgSample, beatSeconds, staticTrace, WAVES } from './ecg.js'
import { mergeLive, thresholdGuides, yDomain, statusSegments, positionPct, CHART_VITALS } from './chartData.js'

describe('synthetic ECG (feature 26)', () => {
  it('peaks at the R wave and has P, Q, S and T in the right places', () => {
    const r = WAVES.find((w) => w.name === 'R').at
    expect(ecgSample(r)).toBeGreaterThan(0.9)
    expect(ecgSample(WAVES.find((w) => w.name === 'S').at)).toBeLessThan(0)
    expect(ecgSample(WAVES.find((w) => w.name === 'T').at)).toBeGreaterThan(0.2)
    expect(ecgSample(WAVES.find((w) => w.name === 'P').at)).toBeGreaterThan(0.08)
    expect(Math.abs(ecgSample(0.9))).toBeLessThan(0.02) // flat between beats
  })

  it('repeats once per beat at the heart rate', () => {
    expect(beatSeconds(60)).toBe(1)
    expect(beatSeconds(120)).toBe(0.5)
    expect(ecgSample(0.38)).toBeCloseTo(ecgSample(1.38), 10)
    const pts = staticTrace(120, 2, 100) // 2 s at 120 BPM = 4 beats
    const peaks = pts.filter((p, i) => i > 0 && i < pts.length - 1 && p.y > 0.8 && p.y >= pts[i - 1].y && p.y >= pts[i + 1].y)
    expect(peaks).toHaveLength(4)
  })
})

describe('history chart helpers (feature 28)', () => {
  const at = (m) => new Date(Date.UTC(2026, 10, 18, 8, m)).toISOString()

  it('appends live updates and keeps only the last hour', () => {
    let pts = [{ at: at(0), hr: 70 }, { at: at(30), hr: 72 }]
    pts = mergeLive(pts, { at: at(61), vitals: { hr: 80 }, status: 'normal' })
    expect(pts.map((p) => p.hr)).toEqual([72, 80])
    expect(mergeLive(pts, { at: at(61), vitals: { hr: 99 } })).toBe(pts) // duplicate tick ignored
    expect(mergeLive(pts, null)).toBe(pts)
  })

  it('takes threshold guides from the shared thresholds', () => {
    expect(thresholdGuides('hr')).toEqual({ normal: [60, 100], critical: [50, 120], unit: 'BPM' })
    expect(thresholdGuides('spo2').critical).toEqual([90])
    expect(thresholdGuides('sys').critical).toEqual([90, 180])
  })

  it('always shows the normal band and the data on the y-axis', () => {
    const [lo, hi] = yDomain([{ hr: 135 }, { hr: 78 }], ['hr'], thresholdGuides('hr'))
    expect(lo).toBeLessThan(50)
    expect(hi).toBeGreaterThan(135)
    expect(yDomain([], ['hr'], null)).toEqual(['auto', 'auto'])
  })

  it('shows blood pressure as two lines', () => {
    expect(CHART_VITALS.find((v) => v.key === 'bp').lines).toEqual(['sys', 'dia'])
  })
})

describe('timeline helpers (feature 30)', () => {
  const from = '2026-11-18T08:00:00.000Z'
  const to = '2026-11-18T09:00:00.000Z'

  it('merges consecutive readings with the same status into segments', () => {
    const readings = [
      { at: '2026-11-18T08:00:00.000Z', status: 'normal' },
      { at: '2026-11-18T08:15:00.000Z', status: 'normal' },
      { at: '2026-11-18T08:30:00.000Z', status: 'warning' },
      { at: '2026-11-18T08:45:00.000Z', status: 'critical' },
    ]
    const segs = statusSegments(readings, from, to)
    expect(segs.map((s) => s.status)).toEqual(['normal', 'warning', 'critical'])
    expect(segs[0].left).toBe(0)
    expect(segs[0].width).toBeCloseTo(50)
    expect(segs[2].left).toBeCloseTo(75)
    expect(segs[2].width).toBeCloseTo(25)
  })

  it('places events on the same axis', () => {
    expect(positionPct('2026-11-18T08:30:00.000Z', from, to)).toBeCloseTo(50)
    expect(positionPct('2026-11-18T07:00:00.000Z', from, to)).toBe(0)
  })
})
