import { definitionOf, terminalKey } from './components';
import type {
  CircuitComponent,
  CircuitDocument,
  SolverCircuitInput,
  SolverElement,
  TerminalRef,
} from './types';

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    this.parent.set(second, first);
  }
}

export type CompiledCircuit = {
  input: SolverCircuitInput;
  portToNode: Record<string, string>;
  nodeToPorts: Record<string, string[]>;
  diagnostics: string[];
};

type WireEdge = {
  wireId: string;
  other: string;
  orientation: 1 | -1;
};

function refKey(ref: TerminalRef): string {
  return terminalKey(ref.componentId, ref.portId);
}

function terminals(component: CircuitComponent): string[] {
  return definitionOf(component).ports.map((port) => terminalKey(component.id, port.id));
}

export function compileCircuit(document: CircuitDocument): CompiledCircuit {
  const union = new UnionFind();
  const diagnostics: string[] = [];
  const componentById = new Map(document.components.map((component) => [component.id, component]));

  for (const component of document.components) {
    for (const key of terminals(component)) union.add(key);
  }

  for (const wire of document.wires) {
    const from = componentById.get(wire.from.componentId);
    const to = componentById.get(wire.to.componentId);
    if (!from || !to) {
      diagnostics.push(`Wire ${wire.id} references a missing component.`);
      continue;
    }
    const fromPort = definitionOf(from).ports.some((port) => port.id === wire.from.portId);
    const toPort = definitionOf(to).ports.some((port) => port.id === wire.to.portId);
    if (!fromPort || !toPort) {
      diagnostics.push(`Wire ${wire.id} references a missing terminal.`);
      continue;
    }
    union.union(refKey(wire.from), refKey(wire.to));
  }

  const roots = new Set<string>();
  for (const component of document.components) {
    for (const key of terminals(component)) roots.add(union.find(key));
  }

  const groundRoots = new Set(
    document.components
      .filter((component) => component.kind === 'ground')
      .flatMap((component) => terminals(component))
      .map((key) => union.find(key)),
  );
  if (groundRoots.size === 0) {
    diagnostics.push('No ground component: the solver will stabilize floating nodes with gmin.');
  }

  const rootToNode = new Map<string, string>();
  for (const root of groundRoots) rootToNode.set(root, '0');
  const nonGroundRoots = [...roots].filter((root) => !groundRoots.has(root)).sort();
  nonGroundRoots.forEach((root, index) => rootToNode.set(root, `n${index + 1}`));

  const portToNode: Record<string, string> = {};
  const nodeToPorts: Record<string, string[]> = {};
  for (const component of document.components) {
    for (const key of terminals(component)) {
      const node = rootToNode.get(union.find(key)) ?? '0';
      portToNode[key] = node;
      (nodeToPorts[node] ??= []).push(key);
    }
  }

  const node = (component: CircuitComponent, portId: string): string => {
    const key = terminalKey(component.id, portId);
    return portToNode[key] ?? `orphan:${key}`;
  };

  const elements = document.components.flatMap<SolverElement>((component) => {
    switch (component.kind) {
      case 'resistor':
        return [
          {
            type: 'resistor',
            id: component.id,
            a: node(component, 'a'),
            b: node(component, 'b'),
            resistance: Math.max(component.properties.resistance, 1e-12),
          },
        ];
      case 'capacitor':
        return [
          {
            type: 'capacitor',
            id: component.id,
            a: node(component, 'a'),
            b: node(component, 'b'),
            capacitance: Math.max(component.properties.capacitance, 1e-18),
          },
        ];
      case 'voltageSource':
        return [
          {
            type: 'voltageSource',
            id: component.id,
            positive: node(component, 'positive'),
            negative: node(component, 'negative'),
            voltage: component.properties.voltage,
          },
        ];
      case 'currentSource':
        return [
          {
            type: 'currentSource',
            id: component.id,
            from: node(component, 'from'),
            to: node(component, 'to'),
            current: component.properties.current,
          },
        ];
      case 'diode':
        return [
          {
            type: 'diode',
            id: component.id,
            anode: node(component, 'anode'),
            cathode: node(component, 'cathode'),
            saturationCurrent: Math.max(component.properties.saturationCurrent, 1e-30),
            ideality: Math.max(component.properties.ideality, 0.1),
          },
        ];
      case 'switch':
        return [
          {
            type: 'resistor',
            id: component.id,
            a: node(component, 'a'),
            b: node(component, 'b'),
            resistance: component.properties.closed
              ? Math.max(component.properties.onResistance, 1e-9)
              : Math.max(component.properties.offResistance, 1),
          },
        ];
      case 'ground':
        return [];
    }
  });

  return {
    input: {
      ground: '0',
      elements,
      options: { maxIterations: 80, tolerance: 1e-9, gmin: 1e-12 },
    },
    portToNode,
    nodeToPorts,
    diagnostics,
  };
}

function componentCurrentPorts(component: CircuitComponent): [string, string] | null {
  switch (component.kind) {
    case 'resistor':
    case 'capacitor':
    case 'switch':
      return ['a', 'b'];
    case 'voltageSource':
      return ['positive', 'negative'];
    case 'currentSource':
      return ['from', 'to'];
    case 'diode':
      return ['anode', 'cathode'];
    case 'ground':
      return null;
  }
}

function addValue(values: Map<string, number>, key: string, value: number): void {
  values.set(key, (values.get(key) ?? 0) + value);
}

/**
 * Reconstruct signed currents on ideal wire segments from terminal injections.
 *
 * Element currents are defined from each component's first electrical terminal
 * to its second. A connected wire graph is reduced to a deterministic spanning
 * tree, then Kirchhoff current balance is accumulated from leaves to the root.
 * Chord currents are reported as zero because ideal-wire loop current is not
 * uniquely defined without parasitic impedance.
 */
export function wireCurrents(
  document: CircuitDocument,
  elementCurrents: Record<string, number>,
): Record<string, number> {
  const result = Object.fromEntries(document.wires.map((wire) => [wire.id, 0]));
  const injections = new Map<string, number>();

  for (const component of document.components) {
    const ports = componentCurrentPorts(component);
    if (!ports) continue;
    const current = elementCurrents[component.id] ?? 0;
    if (!Number.isFinite(current)) continue;
    addValue(injections, terminalKey(component.id, ports[0]), -current);
    addValue(injections, terminalKey(component.id, ports[1]), current);
  }

  const adjacency = new Map<string, WireEdge[]>();
  const appendEdge = (terminal: string, edge: WireEdge) => {
    const edges = adjacency.get(terminal) ?? [];
    edges.push(edge);
    adjacency.set(terminal, edges);
  };

  for (const wire of document.wires) {
    const from = refKey(wire.from);
    const to = refKey(wire.to);
    appendEdge(from, { wireId: wire.id, other: to, orientation: 1 });
    appendEdge(to, { wireId: wire.id, other: from, orientation: -1 });
  }
  for (const edges of adjacency.values()) {
    edges.sort((left, right) => left.wireId.localeCompare(right.wireId));
  }

  const seen = new Set<string>();
  for (const start of [...adjacency.keys()].sort()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const order = [start];
    const parent = new Map<
      string,
      { terminal: string; wireId: string; orientation: 1 | -1 }
    >();

    for (let index = 0; index < order.length; index += 1) {
      const terminal = order[index]!;
      for (const edge of adjacency.get(terminal) ?? []) {
        if (seen.has(edge.other)) continue;
        seen.add(edge.other);
        parent.set(edge.other, {
          terminal,
          wireId: edge.wireId,
          orientation: edge.orientation,
        });
        order.push(edge.other);
      }
    }

    const subtree = new Map(
      order.map((terminal) => [terminal, injections.get(terminal) ?? 0]),
    );
    for (let index = order.length - 1; index > 0; index -= 1) {
      const terminal = order[index]!;
      const edge = parent.get(terminal)!;
      const injection = subtree.get(terminal) ?? 0;
      const parentToChild = -injection;
      result[edge.wireId] = edge.orientation * parentToChild;
      subtree.set(edge.terminal, (subtree.get(edge.terminal) ?? 0) + injection);
    }
  }

  return result;
}
