import { describe, expect, it } from 'vitest';
import { arcPath, arcPoint, fractionOf, gaugeLabel, rangeState } from './gauge.js';
import { BEAT_WIDTH, beatSeconds, ecgPath } from './ecg.js';
import { nextHeartRate, rrInterval, seedHistory, signalQuality } from './vitalsSim.js';
import { shouldUse3D } from './heartMode.js';

describe('gauge maths', () => {
  it('maps a value onto the scale and clamps it', () => {
    expect(fractionOf(100, 40, 160)).toBe(0.5);
    expect(fractionOf(10, 40, 160)).toBe(0);
    expect(fractionOf(999, 40, 160)).toBe(1);
    expect(fractionOf(null, 40, 160)).toBe(null);
    expect(fractionOf('x', 40, 160)).toBe(null);
  });
  it('puts the ends and the top of the arc where they belong', () => {
    expect(arcPoint(100, 100, 80, 0)).toEqual({ x: 20, y: 100 });
    expect(arcPoint(100, 100, 80, 1)).toEqual({ x: 180, y: 100 });
    expect(arcPoint(100, 100, 80, 0.5)).toEqual({ x: 100, y: 20 });
    expect(arcPath(100, 100, 80, 0, 1)).toMatch(/^M 20 100 A 80 80 0 0 1 180 100$/);
  });
  it('says in words where the value sits', () => {
    expect(rangeState(88, 60, 100)).toBe('in');
    expect(rangeState(120, 60, 100)).toBe('high');
    expect(rangeState(50, 60, 100)).toBe('low');
    expect(rangeState(undefined, 60, 100)).toBe('unknown');
    expect(gaugeLabel({ label: 'Heart rate', value: 88, unit: 'bpm', low: 60, high: 100 })).toBe('Heart rate 88 bpm, within the range of 60 to 100');
    expect(gaugeLabel({ label: 'Heart rate', value: null, unit: 'bpm', low: 60, high: 100 })).toBe('Heart rate: no reading');
  });
});

describe('ecg trace', () => {
  it('repeats one beat per step and starts with a move command', () => {
    const d = ecgPath(3, 40);
    expect(d.startsWith('M 0')).toBe(true);
    expect(d.includes(`${BEAT_WIDTH * 2}`)).toBe(true);
    expect((d.match(/M /g) || []).length).toBe(1);
  });
  it('times a beat from the rate and ignores silly values', () => {
    expect(beatSeconds(60)).toBe(1);
    expect(beatSeconds(120)).toBe(0.5);
    expect(beatSeconds(5)).toBe(0.8);
    expect(beatSeconds(null)).toBe(0.8);
  });
});

describe('simulated readings', () => {
  const mid = () => 0.5;
  it('moves toward the target for the mode and stays in bounds', () => {
    expect(nextHeartRate(72, 'calm', mid)).toBe(72);
    expect(nextHeartRate(72, 'emergency', mid)).toBeGreaterThan(72);
    expect(nextHeartRate(190, 'calm', mid)).toBeLessThan(190);
    let v = 72; for (let i = 0; i < 60; i += 1) v = nextHeartRate(v, 'emergency', mid);
    expect(v).toBeGreaterThan(125);
    expect(v).toBeLessThan(140);
  });
  it('derives R-R interval and signal quality', () => {
    expect(rrInterval(60)).toBe(1000);
    expect(rrInterval(88)).toBe(682);
    expect(signalQuality(72, () => 0)).toBe(99);
    expect(signalQuality(190, () => 1)).toBeGreaterThan(79);
    expect(seedHistory(10, 72, mid)).toHaveLength(10);
  });
});

describe('3D or flat heart', () => {
  it('uses 3D only on a capable device that allows motion', () => {
    expect(shouldUse3D({ webgl: true, cores: 8, memory: 8 })).toBe(true);
    expect(shouldUse3D({ webgl: true })).toBe(true);
    expect(shouldUse3D({ webgl: false, cores: 8 })).toBe(false);
    expect(shouldUse3D({ webgl: true, reducedMotion: true })).toBe(false);
    expect(shouldUse3D({ webgl: true, cores: 2 })).toBe(false);
    expect(shouldUse3D({ webgl: true, memory: 2 })).toBe(false);
    expect(shouldUse3D({ webgl: true, saveData: true })).toBe(false);
    expect(shouldUse3D()).toBe(false);
  });
});

import { pulseAt } from './ecg.js';
describe('heart pulse shape', () => {
  it('peaks near the start, dips between beats, and repeats', () => {
    expect(pulseAt(0.1)).toBeGreaterThan(0.95);
    expect(pulseAt(0.32)).toBeGreaterThan(0.65);
    expect(pulseAt(0.7)).toBeLessThan(0.01);
    expect(Math.abs(pulseAt(1.1) - pulseAt(0.1))).toBeLessThan(1e-9);
    expect(Math.abs(pulseAt(-0.9) - pulseAt(0.1))).toBeLessThan(1e-9);
  });
});

import { findings, simulatedAnalysis } from './clinicalView.js';
describe('clinical view helpers', () => {
  it('lists only readings outside the demo range, as shape-worded callouts data', () => {
    const f = findings({ heartRate: 132, systolic: 120, spo2: 88, respiratoryRate: 16 });
    expect(f).toHaveLength(2);
    expect(f[0].key).toBe('heartRate');
    expect(f[0].direction).toBe('above');
    expect(f[1].direction).toBe('below');
    expect(f[1].tone).toBe('alert');
    expect(findings(null)).toHaveLength(0);
    expect(findings({ heartRate: 72 })).toHaveLength(0);
  });
  it('writes plain sentences and never a score or a diagnosis', () => {
    const lines = simulatedAnalysis({ heartRate: 132, spo2: 97 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/above the demo range/);
    expect(lines.join(' ')).not.toMatch(/%.*confiden|diagnos|probab/i);
    expect(simulatedAnalysis({ heartRate: 70 })[0]).toMatch(/inside the demo ranges/);
  });
});
