import type { CircuitDocument, Wire } from './types';

const wire = (
  id: string,
  fromComponent: string,
  fromPort: string,
  toComponent: string,
  toPort: string,
): Wire => ({
  id,
  from: { componentId: fromComponent, portId: fromPort },
  to: { componentId: toComponent, portId: toPort },
});

const rcDivider: CircuitDocument = {
  version: 1,
  name: 'RC divider',
  analysis: { mode: 'transient', duration: 0.35, timestep: 0.001 },
  components: [
    { id: 'v1', kind: 'voltageSource', label: 'V1', x: 128, y: 286, properties: { voltage: 12 } },
    { id: 'r1', kind: 'resistor', label: 'R1', x: 344, y: 148, properties: { resistance: 1_000 } },
    { id: 'r2', kind: 'resistor', label: 'R2', x: 668, y: 148, properties: { resistance: 2_000 } },
    { id: 'c1', kind: 'capacitor', label: 'C1', x: 508, y: 372, properties: { capacitance: 47e-6 } },
    { id: 'g1', kind: 'ground', label: 'GND', x: 916, y: 442, properties: {} },
  ],
  wires: [
    wire('w-v-r1', 'v1', 'positive', 'r1', 'a'),
    wire('w-r1-r2', 'r1', 'b', 'r2', 'a'),
    wire('w-r2-g', 'r2', 'b', 'g1', 'gnd'),
    wire('w-v-g', 'v1', 'negative', 'g1', 'gnd'),
    wire('w-out-c', 'r1', 'b', 'c1', 'a'),
    wire('w-c-g', 'c1', 'b', 'g1', 'gnd'),
  ],
};

const diodeClamp: CircuitDocument = {
  version: 1,
  name: 'Diode clamp',
  analysis: { mode: 'dc' },
  components: [
    { id: 'v1', kind: 'voltageSource', label: 'V1', x: 150, y: 280, properties: { voltage: 5 } },
    { id: 'r1', kind: 'resistor', label: 'R1', x: 390, y: 166, properties: { resistance: 1_000 } },
    { id: 'd1', kind: 'diode', label: 'D1', x: 690, y: 166, properties: { saturationCurrent: 1e-12, ideality: 1 } },
    { id: 'g1', kind: 'ground', label: 'GND', x: 942, y: 410, properties: {} },
  ],
  wires: [
    wire('w1', 'v1', 'positive', 'r1', 'a'),
    wire('w2', 'r1', 'b', 'd1', 'anode'),
    wire('w3', 'd1', 'cathode', 'g1', 'gnd'),
    wire('w4', 'v1', 'negative', 'g1', 'gnd'),
  ],
};

const reservePower: CircuitDocument = {
  version: 1,
  name: 'Reserve power path',
  analysis: { mode: 'transient', duration: 5, timestep: 0.02 },
  components: [
    { id: 'v-input', kind: 'voltageSource', label: 'INPUT', x: 116, y: 292, properties: { voltage: 12 } },
    { id: 'r-line', kind: 'resistor', label: 'Rline', x: 326, y: 152, properties: { resistance: 20 } },
    { id: 's-main', kind: 'switch', label: 'ISO', x: 610, y: 152, properties: { closed: true, onResistance: 0.02, offResistance: 10e6 } },
    { id: 'r-load', kind: 'resistor', label: 'LOAD', x: 894, y: 152, properties: { resistance: 200 } },
    { id: 'c-reserve', kind: 'capacitor', label: 'VCAP', x: 666, y: 386, properties: { capacitance: 1 } },
    { id: 'g1', kind: 'ground', label: 'GND', x: 1128, y: 470, properties: {} },
  ],
  wires: [
    wire('w1', 'v-input', 'positive', 'r-line', 'a'),
    wire('w2', 'r-line', 'b', 's-main', 'a'),
    wire('w3', 's-main', 'b', 'r-load', 'a'),
    wire('w4', 'r-load', 'b', 'g1', 'gnd'),
    wire('w5', 'v-input', 'negative', 'g1', 'gnd'),
    wire('w6', 's-main', 'b', 'c-reserve', 'a'),
    wire('w7', 'c-reserve', 'b', 'g1', 'gnd'),
  ],
};

/**
 * First-order electrical model for the hardware-wallet reference device.
 *
 * NodeSpice does not yet implement a production LDO macro-model, so LDO_EQ is
 * an explicit equivalent pass resistance chosen to put the nominal rail near
 * 3.3 V at the declared base load. The display and signing branches are gated
 * independently so the editor can compare rail behaviour under load steps.
 */
const hardwareWalletPower: CircuitDocument = {
  version: 1,
  name: 'Hardware wallet USB power path',
  analysis: { mode: 'transient', duration: 0.12, timestep: 0.00025 },
  components: [
    { id: 'v-usb', kind: 'voltageSource', label: 'USB 5V', x: 80, y: 300, properties: { voltage: 5 } },
    { id: 'r-cable', kind: 'resistor', label: 'R_CABLE', x: 250, y: 120, properties: { resistance: 0.28 } },
    { id: 'r-protect', kind: 'resistor', label: 'R_PROTECT', x: 430, y: 120, properties: { resistance: 0.12 } },
    { id: 'c-in', kind: 'capacitor', label: 'C_IN 47u', x: 485, y: 350, properties: { capacitance: 47e-6 } },
    { id: 'r-ldo', kind: 'resistor', label: 'LDO_EQ', x: 640, y: 120, properties: { resistance: 21.1 } },
    { id: 'c-rail', kind: 'capacitor', label: 'C_3V3 22u', x: 735, y: 350, properties: { capacitance: 22e-6 } },
    { id: 'i-mcu', kind: 'currentSource', label: 'MCU 45mA', x: 855, y: 260, properties: { current: 0.045 } },
    { id: 's-display', kind: 'switch', label: 'DISPLAY', x: 1015, y: 120, properties: { closed: true, onResistance: 0.02, offResistance: 10e6 } },
    { id: 'i-display', kind: 'currentSource', label: 'OLED 22mA', x: 1035, y: 300, properties: { current: 0.022 } },
    { id: 's-sign', kind: 'switch', label: 'SIGNING', x: 1190, y: 120, properties: { closed: false, onResistance: 0.02, offResistance: 10e6 } },
    { id: 'i-sign', kind: 'currentSource', label: 'SE 18mA', x: 1210, y: 300, properties: { current: 0.018 } },
    { id: 'g-wallet', kind: 'ground', label: 'GND', x: 1390, y: 500, properties: {} },
  ],
  wires: [
    wire('usb-cable', 'v-usb', 'positive', 'r-cable', 'a'),
    wire('cable-protect', 'r-cable', 'b', 'r-protect', 'a'),
    wire('protect-ldo', 'r-protect', 'b', 'r-ldo', 'a'),
    wire('vin-cin', 'r-protect', 'b', 'c-in', 'a'),
    wire('ldo-rail', 'r-ldo', 'b', 'i-mcu', 'from'),
    wire('rail-cout', 'r-ldo', 'b', 'c-rail', 'a'),
    wire('rail-display-switch', 'r-ldo', 'b', 's-display', 'a'),
    wire('display-switch-load', 's-display', 'b', 'i-display', 'from'),
    wire('rail-sign-switch', 'r-ldo', 'b', 's-sign', 'a'),
    wire('sign-switch-load', 's-sign', 'b', 'i-sign', 'from'),
    wire('usb-ground', 'v-usb', 'negative', 'g-wallet', 'gnd'),
    wire('cin-ground', 'c-in', 'b', 'g-wallet', 'gnd'),
    wire('cout-ground', 'c-rail', 'b', 'g-wallet', 'gnd'),
    wire('mcu-ground', 'i-mcu', 'to', 'g-wallet', 'gnd'),
    wire('display-ground', 'i-display', 'to', 'g-wallet', 'gnd'),
    wire('sign-ground', 'i-sign', 'to', 'g-wallet', 'gnd'),
  ],
};

export const EXAMPLES = [
  { id: 'rc-divider', title: 'RC divider', description: 'Transient Backward-Euler charge into a loaded divider.', document: rcDivider },
  { id: 'diode-clamp', title: 'Diode clamp', description: 'Nonlinear Newton iteration around a silicon diode.', document: diodeClamp },
  { id: 'reserve-power', title: 'Reserve power', description: 'A compact power path with a storage capacitor and load.', document: reservePower },
  {
    id: 'hardware-wallet-power',
    title: 'Hardware wallet power',
    description: 'USB cable drop, input/output decoupling, display load and an optional signing load in a first-order 3.3 V rail model.',
    document: hardwareWalletPower,
  },
] as const;

export type ExampleId = (typeof EXAMPLES)[number]['id'];

export function cloneExample(id: ExampleId = 'rc-divider'): CircuitDocument {
  const example = EXAMPLES.find((candidate) => candidate.id === id) ?? EXAMPLES[0];
  return structuredClone(example.document);
}
