import { describe, expect, test } from 'bun:test';
import { voltagePlotRange } from './waveformScale';

describe('waveform voltage scale', () => {
  test('keeps a charging trace anchored at zero without inventing negative voltage', () => {
    const range = voltagePlotRange([0, 0.5, 1, 2]);
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThan(2);
  });

  test('preserves detail for a narrow ripple far from zero', () => {
    const range = voltagePlotRange([4.98, 5, 5.02]);
    expect(range.min).toBeGreaterThan(4.9);
    expect(range.max).toBeLessThan(5.1);
  });

  test('expands a flat operating point into a visible range', () => {
    const range = voltagePlotRange([3.3, 3.3]);
    expect(range.min).toBeLessThan(3.3);
    expect(range.max).toBeGreaterThan(3.3);
  });
});
