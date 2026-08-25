import type {
  CircuitComponent,
  ComponentKind,
  PortSpec,
  Point,
} from './types';

export type ComponentDefinition = {
  kind: ComponentKind;
  title: string;
  shortTitle: string;
  width: number;
  height: number;
  ports: PortSpec[];
};

const horizontalPorts = (first: string, second: string): PortSpec[] => [
  { id: first, x: 0, y: 32, direction: 'left' },
  { id: second, x: 112, y: 32, direction: 'right' },
];

export const COMPONENT_DEFINITIONS: Record<ComponentKind, ComponentDefinition> = {
  resistor: {
    kind: 'resistor',
    title: 'Resistor',
    shortTitle: 'R',
    width: 112,
    height: 64,
    ports: horizontalPorts('a', 'b'),
  },
  capacitor: {
    kind: 'capacitor',
    title: 'Capacitor',
    shortTitle: 'C',
    width: 112,
    height: 64,
    ports: horizontalPorts('a', 'b'),
  },
  diode: {
    kind: 'diode',
    title: 'Diode',
    shortTitle: 'D',
    width: 112,
    height: 64,
    ports: horizontalPorts('anode', 'cathode'),
  },
  switch: {
    kind: 'switch',
    title: 'Switch',
    shortTitle: 'S',
    width: 112,
    height: 64,
    ports: horizontalPorts('a', 'b'),
  },
  voltageSource: {
    kind: 'voltageSource',
    title: 'Voltage source',
    shortTitle: 'V',
    width: 72,
    height: 120,
    ports: [
      { id: 'positive', x: 36, y: 0, direction: 'top', polarity: 'positive' },
      { id: 'negative', x: 36, y: 120, direction: 'bottom', polarity: 'negative' },
    ],
  },
  currentSource: {
    kind: 'currentSource',
    title: 'Current source',
    shortTitle: 'I',
    width: 72,
    height: 120,
    ports: [
      { id: 'from', x: 36, y: 0, direction: 'top', polarity: 'positive' },
      { id: 'to', x: 36, y: 120, direction: 'bottom', polarity: 'negative' },
    ],
  },
  ground: {
    kind: 'ground',
    title: 'Ground',
    shortTitle: 'GND',
    width: 72,
    height: 64,
    ports: [{ id: 'gnd', x: 36, y: 0, direction: 'top' }],
  },
};

export function definitionOf(component: CircuitComponent | ComponentKind): ComponentDefinition {
  const kind = typeof component === 'string' ? component : component.kind;
  return COMPONENT_DEFINITIONS[kind];
}

export function portOf(component: CircuitComponent, portId: string): PortSpec {
  const port = definitionOf(component).ports.find((candidate) => candidate.id === portId);
  if (!port) throw new Error(`Unknown port ${component.id}.${portId}`);
  return port;
}

export function portPoint(component: CircuitComponent, portId: string): Point {
  const port = portOf(component, portId);
  return { x: component.x + port.x, y: component.y + port.y };
}

export function terminalKey(componentId: string, portId: string): string {
  return `${componentId}:${portId}`;
}

export function nextLabel(kind: ComponentKind, components: CircuitComponent[]): string {
  const prefix = COMPONENT_DEFINITIONS[kind].shortTitle;
  if (kind === 'ground') {
    const count = components.filter((component) => component.kind === kind).length;
    return count === 0 ? 'GND' : `GND${count + 1}`;
  }
  let index = 1;
  const used = new Set(components.map((component) => component.label));
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export function createComponent(
  kind: ComponentKind,
  position: Point,
  components: CircuitComponent[],
): CircuitComponent {
  const id = `${kind}-${crypto.randomUUID()}`;
  const label = nextLabel(kind, components);
  const base = { id, kind, label, x: position.x, y: position.y };
  switch (kind) {
    case 'resistor':
      return { ...base, kind, properties: { resistance: 1_000 } };
    case 'capacitor':
      return { ...base, kind, properties: { capacitance: 1e-6 } };
    case 'voltageSource':
      return { ...base, kind, properties: { voltage: 5 } };
    case 'currentSource':
      return { ...base, kind, properties: { current: 1e-3 } };
    case 'diode':
      return {
        ...base,
        kind,
        properties: { saturationCurrent: 1e-12, ideality: 1 },
      };
    case 'switch':
      return {
        ...base,
        kind,
        properties: { closed: true, onResistance: 1e-3, offResistance: 1e12 },
      };
    case 'ground':
      return { ...base, kind, properties: {} };
  }
}

export function componentBounds(component: CircuitComponent) {
  const definition = definitionOf(component);
  return {
    x: component.x,
    y: component.y,
    width: definition.width,
    height: definition.height,
  };
}
