import { describe, expect, test } from 'bun:test';
import { cloneExample } from './examples';
import { compileCircuit, wireCurrents } from './netlist';

describe('circuit graph compiler', () => {
  test('coalesces connected terminals and maps ground to node 0', () => {
    const document = cloneExample('rc-divider');
    const compiled = compileCircuit(document);
    expect(compiled.portToNode['g1:gnd']).toBe('0');
    expect(compiled.portToNode['v1:negative']).toBe('0');
    expect(compiled.portToNode['r1:b']).toBe(compiled.portToNode['c1:a']);
    expect(compiled.input.elements).toHaveLength(4);
  });

  test('compiles a switch into a resistance understood by the Rust core', () => {
    const document = cloneExample('reserve-power');
    const compiled = compileCircuit(document);
    const isolation = compiled.input.elements.find((element) => element.id === 's-main');
    expect(isolation?.type).toBe('resistor');
    if (isolation?.type === 'resistor') expect(isolation.resistance).toBeCloseTo(0.02);
  });

  test('reconstructs signed branch currents instead of animating every wire equally', () => {
    const document = cloneExample('reserve-power');
    const currents = wireCurrents(document, {
      'v-input': -0.05,
      'r-line': 0.05,
      's-main': 0.05,
      'r-load': 0.05,
      'c-reserve': 0,
    });

    expect(currents.w1).toBeCloseTo(0.05);
    expect(currents.w2).toBeCloseTo(0.05);
    expect(currents.w3).toBeCloseTo(0.05);
    expect(currents.w6).toBeCloseTo(0);

    const reversed = wireCurrents(document, {
      'v-input': 0.05,
      'r-line': -0.05,
      's-main': -0.05,
      'r-load': -0.05,
      'c-reserve': 0,
    });
    expect(reversed.w1).toBeCloseTo(-0.05);
    expect(reversed.w2).toBeCloseTo(-0.05);
  });
});
