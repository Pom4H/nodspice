import { describe, expect, test } from 'bun:test';
import { cloneExample } from './examples';

describe('hardware wallet power example', () => {
  test('uses resistive loads behind the display and signing switches', () => {
    const circuit = cloneExample('hardware-wallet-power');
    const byId = new Map(circuit.components.map((component) => [component.id, component]));

    expect(byId.get('r-mcu-active')).toMatchObject({
      kind: 'resistor',
      properties: { resistance: 73.3 },
    });
    expect(byId.get('r-mcu-sleep')).toMatchObject({
      kind: 'resistor',
      properties: { resistance: 33_000 },
    });
    expect(byId.get('s-mcu-active')).toMatchObject({
      kind: 'switch',
      properties: { closed: true, offResistance: 10e6 },
    });
    expect(byId.get('s-mcu-sleep')).toMatchObject({
      kind: 'switch',
      properties: { closed: false, offResistance: 10e6 },
    });
    expect(byId.get('r-display')).toMatchObject({
      kind: 'resistor',
      properties: { resistance: 150 },
    });
    expect(byId.get('r-sign')).toMatchObject({
      kind: 'resistor',
      properties: { resistance: 183.3 },
    });
    expect(byId.get('s-display')).toMatchObject({
      kind: 'switch',
      properties: { closed: true, offResistance: 10e6 },
    });
    expect(byId.get('s-sign')).toMatchObject({
      kind: 'switch',
      properties: { closed: false, offResistance: 10e6 },
    });

    expect(circuit.components.filter((component) => component.kind === 'currentSource')).toHaveLength(0);
  });

  test('connects each switched load between its switch and ground', () => {
    const circuit = cloneExample('hardware-wallet-power');
    const endpoints = new Set(
      circuit.wires.map(
        (wire) => `${wire.from.componentId}.${wire.from.portId}->${wire.to.componentId}.${wire.to.portId}`,
      ),
    );

    expect(endpoints).toContain('s-mcu-active.b->r-mcu-active.a');
    expect(endpoints).toContain('r-mcu-active.b->g-wallet.gnd');
    expect(endpoints).toContain('s-mcu-sleep.b->r-mcu-sleep.a');
    expect(endpoints).toContain('r-mcu-sleep.b->g-wallet.gnd');
    expect(endpoints).toContain('s-display.b->r-display.a');
    expect(endpoints).toContain('r-display.b->g-wallet.gnd');
    expect(endpoints).toContain('s-sign.b->r-sign.a');
    expect(endpoints).toContain('r-sign.b->g-wallet.gnd');
  });
});
