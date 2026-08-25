import { describe, expect, test } from 'bun:test';
import { formatEngineering, parseEngineering } from './engineering';

describe('engineering notation', () => {
  test('formats SI prefixes', () => {
    expect(formatEngineering(0.000_047, 'F')).toBe('47 µF');
    expect(formatEngineering(2_200, 'Ω')).toBe('2.2 kΩ');
  });

  test('parses compact values', () => {
    expect(parseEngineering('47u')).toBeCloseTo(47e-6);
    expect(parseEngineering('2.2k')).toBeCloseTo(2_200);
    expect(parseEngineering('-12m')).toBeCloseTo(-0.012);
  });

  test('rejects invalid input', () => {
    expect(parseEngineering('five')).toBeNull();
  });
});
