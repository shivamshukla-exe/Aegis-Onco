import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT } from './types';
import {
  generateSurvivalCurve,
  interpolateSurvival,
  MODEL_METADATA,
  runFullEngine,
} from './engine';

describe('research-demo survival engine', () => {
  it('interpolates milestones that are not chart sample points', () => {
    const curve = [
      { day: 360, survival: 80, range: [70, 90] as [number, number] },
      { day: 380, survival: 60, range: [50, 70] as [number, number] },
    ];
    expect(interpolateSurvival(curve, 365)).toBeCloseTo(75, 8);
  });

  it('produces bounded, monotonically non-increasing curves', () => {
    const curve = generateSurvivalCurve(0.4, 0.3);
    expect(curve).toHaveLength(101);
    for (let index = 0; index < curve.length; index++) {
      expect(curve[index].survival).toBeGreaterThanOrEqual(0);
      expect(curve[index].survival).toBeLessThanOrEqual(100);
      if (index > 0) expect(curve[index].survival).toBeLessThanOrEqual(curve[index - 1].survival);
    }
  });

  it('is deterministic and exposes nonclinical metadata', () => {
    expect(runFullEngine(DEFAULT_INPUT)).toEqual(runFullEngine(DEFAULT_INPUT));
    expect(MODEL_METADATA.status).toBe('research-demo');
    expect(MODEL_METADATA.clinicalUseAllowed).toBe(false);
  });
});