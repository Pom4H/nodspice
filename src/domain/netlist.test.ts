import { describe, expect, test } from 'bun:test';
import { cloneExample } from './examples';
import { compileCircuit } from './netlist';

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
});
