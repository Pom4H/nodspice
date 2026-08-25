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
    {
      id: 'v1',
      kind: 'voltageSource',
      label: 'V1',
      x: 128,
      y: 286,
      properties: { voltage: 12 },
    },
    {
      id: 'r1',
      kind: 'resistor',
      label: 'R1',
      x: 344,
      y: 148,
      properties: { resistance: 1_000 },
    },
    {
      id: 'r2',
      kind: 'resistor',
      label: 'R2',
      x: 668,
      y: 148,
      properties: { resistance: 2_000 },
    },
    {
      id: 'c1',
      kind: 'capacitor',
      label: 'C1',
      x: 508,
      y: 372,
      properties: { capacitance: 47e-6 },
    },
    {
      id: 'g1',
      kind: 'ground',
      label: 'GND',
      x: 916,
      y: 442,
      properties: {},
    },
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
    {
      id: 'v1',
      kind: 'voltageSource',
      label: 'V1',
      x: 150,
      y: 280,
      properties: { voltage: 5 },
    },
    {
      id: 'r1',
      kind: 'resistor',
      label: 'R1',
      x: 390,
      y: 166,
      properties: { resistance: 1_000 },
    },
    {
      id: 'd1',
      kind: 'diode',
      label: 'D1',
      x: 690,
      y: 166,
      properties: { saturationCurrent: 1e-12, ideality: 1 },
    },
    {
      id: 'g1',
      kind: 'ground',
      label: 'GND',
      x: 942,
      y: 410,
      properties: {},
    },
  ],
  wires: [
    wire('w1', 'v1', 'positive', 'r1', 'a'),
    wire('w2', 'r1', 'b', 'd1', 'anode'),
    wire('w3', 'd1', 'cathode', 'g1', 'gnd'),
    wire('w4', 'v1', 'negative', 'g1', 'gnd'),
  ],
};

const dplsPower: CircuitDocument = {
  version: 1,
  name: 'DPLS reserve power',
  analysis: { mode: 'transient', duration: 5, timestep: 0.02 },
  components: [
    {
      id: 'v-dpls',
      kind: 'voltageSource',
      label: 'DPLS',
      x: 116,
      y: 292,
      properties: { voltage: 12 },
    },
    {
      id: 'r-line',
      kind: 'resistor',
      label: 'Rline',
      x: 326,
      y: 152,
      properties: { resistance: 20 },
    },
    {
      id: 's-main',
      kind: 'switch',
      label: 'ISO',
      x: 610,
      y: 152,
      properties: { closed: true, onResistance: 0.02, offResistance: 10e6 },
    },
    {
      id: 'r-load',
      kind: 'resistor',
      label: 'LOAD',
      x: 894,
      y: 152,
      properties: { resistance: 200 },
    },
    {
      id: 'c-reserve',
      kind: 'capacitor',
      label: 'VCAP',
      x: 666,
      y: 386,
      properties: { capacitance: 1 },
    },
    {
      id: 'g1',
      kind: 'ground',
      label: 'GND',
      x: 1128,
      y: 470,
      properties: {},
    },
  ],
  wires: [
    wire('w1', 'v-dpls', 'positive', 'r-line', 'a'),
    wire('w2', 'r-line', 'b', 's-main', 'a'),
    wire('w3', 's-main', 'b', 'r-load', 'a'),
    wire('w4', 'r-load', 'b', 'g1', 'gnd'),
    wire('w5', 'v-dpls', 'negative', 'g1', 'gnd'),
    wire('w6', 's-main', 'b', 'c-reserve', 'a'),
    wire('w7', 'c-reserve', 'b', 'g1', 'gnd'),
  ],
};

export const EXAMPLES = [
  {
    id: 'rc-divider',
    title: 'RC divider',
    description: 'Transient Backward-Euler charge into a loaded divider.',
    document: rcDivider,
  },
  {
    id: 'diode-clamp',
    title: 'Diode clamp',
    description: 'Nonlinear Newton iteration around a silicon diode.',
    document: diodeClamp,
  },
  {
    id: 'dpls-power',
    title: 'DPLS reserve',
    description: 'A compact power-path sketch inspired by Test-DPLS.',
    document: dplsPower,
  },
] as const;

export type ExampleId = (typeof EXAMPLES)[number]['id'];

export function cloneExample(id: ExampleId = 'rc-divider'): CircuitDocument {
  const example = EXAMPLES.find((candidate) => candidate.id === id) ?? EXAMPLES[0];
  return structuredClone(example.document);
}
