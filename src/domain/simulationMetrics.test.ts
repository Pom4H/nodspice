import { describe, expect, test } from 'bun:test';
import { currentPeakAcross, currentPeakAt } from './simulationMetrics';

describe('simulation metrics', () => {
  test('labels the current-frame maximum without calling it a run peak', () => {
    const peak = currentPeakAt({
      time: 0.25,
      nodeVoltages: {},
      elementCurrents: { r1: -0.012, r2: 0.004 },
    });
    expect(peak).toEqual({
      elementId: 'r1',
      current: -0.012,
      magnitude: 0.012,
      frame: 0,
      time: 0.25,
    });
  });

  test('finds the true peak over the complete transient', () => {
    const peak = currentPeakAcross({
      times: [0, 0.1, 0.2],
      nodeVoltages: {},
      elementCurrents: {
        r1: [0.02, 0.015, 0.01],
        c1: [-0.03, -0.01, 0],
      },
      converged: true,
      maxIterations: 1,
      warnings: [],
    });
    expect(peak).toEqual({
      elementId: 'c1',
      current: -0.03,
      magnitude: 0.03,
      frame: 0,
      time: 0,
    });
  });
});
