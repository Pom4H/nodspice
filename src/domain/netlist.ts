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

export function nodeActivity(
  document: CircuitDocument,
  compiled: CompiledCircuit,
  elementCurrents: Record<string, number>,
): Record<string, number> {
  const activity: Record<string, number> = {};
  for (const component of document.components) {
    const current = Math.abs(elementCurrents[component.id] ?? 0);
    for (const port of definitionOf(component).ports) {
      const node = compiled.portToNode[terminalKey(component.id, port.id)];
      if (node) activity[node] = Math.max(activity[node] ?? 0, current);
    }
  }
  return activity;
}
