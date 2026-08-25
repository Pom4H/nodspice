import { definitionOf } from '../domain/components';
import type { CircuitComponent, CircuitDocument } from '../domain/types';

export type AutoLayoutOptions = {
  grid?: number;
  marginX?: number;
  marginY?: number;
  layerGap?: number;
  rowGap?: number;
  clusterGap?: number;
  groundGap?: number;
};

const DEFAULTS: Required<AutoLayoutOptions> = {
  grid: 16,
  marginX: 112,
  marginY: 104,
  layerGap: 248,
  rowGap: 168,
  clusterGap: 112,
  groundGap: 208,
};

const KIND_ORDER: Record<CircuitComponent['kind'], number> = {
  voltageSource: 0,
  currentSource: 1,
  switch: 2,
  resistor: 3,
  diode: 4,
  capacitor: 5,
  ground: 6,
};

function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function componentOrder(left: CircuitComponent, right: CircuitComponent): number {
  return (
    left.y - right.y ||
    left.x - right.x ||
    KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function buildAdjacency(
  document: CircuitDocument,
  componentById: ReadonlyMap<string, CircuitComponent>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const component of document.components) {
    if (component.kind !== 'ground') adjacency.set(component.id, new Set());
  }

  for (const wire of document.wires) {
    const from = componentById.get(wire.from.componentId);
    const to = componentById.get(wire.to.componentId);
    if (!from || !to || from.id === to.id || from.kind === 'ground' || to.kind === 'ground') {
      continue;
    }
    adjacency.get(from.id)?.add(to.id);
    adjacency.get(to.id)?.add(from.id);
  }
  return adjacency;
}

function connectedClusters(
  components: CircuitComponent[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const remaining = new Set(components.map((component) => component.id));
  const clusters: string[][] = [];

  while (remaining.size > 0) {
    const seed = [...remaining]
      .map((id) => byId.get(id)!)
      .sort(componentOrder)[0]!;
    const queue = [seed.id];
    const cluster: string[] = [];
    remaining.delete(seed.id);

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      cluster.push(current);
      const neighbors = [...(adjacency.get(current) ?? [])].sort();
      for (const neighbor of neighbors) {
        if (!remaining.delete(neighbor)) continue;
        queue.push(neighbor);
      }
    }
    clusters.push(cluster);
  }

  return clusters.sort((left, right) => {
    const leftComponents = left.map((id) => byId.get(id)!);
    const rightComponents = right.map((id) => byId.get(id)!);
    const leftHasSource = leftComponents.some(
      (component) => component.kind === 'voltageSource' || component.kind === 'currentSource',
    );
    const rightHasSource = rightComponents.some(
      (component) => component.kind === 'voltageSource' || component.kind === 'currentSource',
    );
    return (
      Number(rightHasSource) - Number(leftHasSource) ||
      Math.min(...leftComponents.map((component) => component.y)) -
        Math.min(...rightComponents.map((component) => component.y)) ||
      left[0]!.localeCompare(right[0]!)
    );
  });
}

function assignLayers(
  cluster: string[],
  componentById: ReadonlyMap<string, CircuitComponent>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const components = cluster.map((id) => componentById.get(id)!);
  const roots: CircuitComponent[] = components
    .filter(
      (component) => component.kind === 'voltageSource' || component.kind === 'currentSource',
    )
    .sort(componentOrder);

  if (roots.length === 0) {
    roots.push(
      [...components].sort((left, right) => {
        const degreeDifference =
          (adjacency.get(right.id)?.size ?? 0) - (adjacency.get(left.id)?.size ?? 0);
        return left.x - right.x || degreeDifference || componentOrder(left, right);
      })[0]!,
    );
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const root of roots) {
    if (layer.has(root.id)) continue;
    layer.set(root.id, 0);
    queue.push(root.id);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const nextLayer = (layer.get(current) ?? 0) + 1;
    for (const neighbor of [...(adjacency.get(current) ?? [])].sort()) {
      if (!cluster.includes(neighbor) || layer.has(neighbor)) continue;
      layer.set(neighbor, nextLayer);
      queue.push(neighbor);
    }
  }

  for (const id of cluster) {
    if (!layer.has(id)) layer.set(id, 0);
  }
  return layer;
}

function orderedLayers(
  cluster: string[],
  layerById: ReadonlyMap<string, number>,
  componentById: ReadonlyMap<string, CircuitComponent>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const maxLayer = Math.max(0, ...cluster.map((id) => layerById.get(id) ?? 0));
  const layers = Array.from({ length: maxLayer + 1 }, () => [] as string[]);
  for (const id of cluster) layers[layerById.get(id) ?? 0]!.push(id);
  for (const layer of layers) {
    layer.sort((left, right) => componentOrder(componentById.get(left)!, componentById.get(right)!));
  }

  const positionMap = (ids: string[]) => new Map(ids.map((id, index) => [id, index]));
  const sortAgainst = (target: string[], reference: string[]) => {
    const positions = positionMap(reference);
    const original = positionMap(target);
    target.sort((left, right) => {
      const score = (id: string) => {
        const values = [...(adjacency.get(id) ?? [])]
          .map((neighbor) => positions.get(neighbor))
          .filter((value): value is number => value !== undefined);
        if (values.length === 0) return original.get(id) ?? 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      };
      return (
        score(left) - score(right) ||
        (original.get(left) ?? 0) - (original.get(right) ?? 0) ||
        left.localeCompare(right)
      );
    });
  };

  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < layers.length; index += 1) {
      sortAgainst(layers[index]!, layers[index - 1]!);
    }
    for (let index = layers.length - 2; index >= 0; index -= 1) {
      sortAgainst(layers[index]!, layers[index + 1]!);
    }
  }
  return layers;
}

/**
 * Places sources on the left, signal paths in graph-distance layers, parallel
 * branches in separate rows, and reference symbols in a final lower column.
 * Only component coordinates change; topology and electrical values are kept.
 */
export function autoLayoutCircuit(
  document: CircuitDocument,
  options: AutoLayoutOptions = {},
): CircuitDocument {
  const settings = { ...DEFAULTS, ...options };
  const componentById = new Map(document.components.map((component) => [component.id, component]));
  const nonGround = document.components.filter((component) => component.kind !== 'ground');
  const grounds = document.components.filter((component) => component.kind === 'ground');
  if (document.components.length < 2) return structuredClone(document);

  const adjacency = buildAdjacency(document, componentById);
  const clusters = connectedClusters(nonGround, adjacency);
  const positions = new Map<string, { x: number; y: number }>();
  let clusterTop = settings.marginY;
  let rightEdge = settings.marginX;

  for (const cluster of clusters) {
    const layerById = assignLayers(cluster, componentById, adjacency);
    const layers = orderedLayers(cluster, layerById, componentById, adjacency);
    const maxRows = Math.max(1, ...layers.map((layer) => layer.length));
    const clusterHeight = Math.max(settings.rowGap, maxRows * settings.rowGap);

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
      const layer = layers[layerIndex]!;
      const layerWidth = Math.max(
        112,
        ...layer.map((id) => definitionOf(componentById.get(id)!).width),
      );
      const firstCenter =
        clusterTop + (clusterHeight - Math.max(0, layer.length - 1) * settings.rowGap) / 2;

      layer.forEach((id, rowIndex) => {
        const component = componentById.get(id)!;
        const definition = definitionOf(component);
        const centerY = firstCenter + rowIndex * settings.rowGap;
        const x =
          settings.marginX +
          layerIndex * settings.layerGap +
          Math.max(0, (layerWidth - definition.width) / 2);
        const y = centerY - definition.height / 2;
        positions.set(id, {
          x: snap(x, settings.grid),
          y: snap(y, settings.grid),
        });
        rightEdge = Math.max(rightEdge, x + definition.width);
      });
    }

    clusterTop += clusterHeight + settings.clusterGap;
  }

  if (grounds.length > 0) {
    const groundX = snap(rightEdge + settings.groundGap, settings.grid);
    const connectedCenters = (groundId: string): number[] => {
      const neighbors = document.wires.flatMap((wire) => {
        if (wire.from.componentId === groundId) return [wire.to.componentId];
        if (wire.to.componentId === groundId) return [wire.from.componentId];
        return [];
      });
      return neighbors
        .map((id) => {
          const component = componentById.get(id);
          const position = positions.get(id);
          if (!component || !position) return null;
          return position.y + definitionOf(component).height / 2;
        })
        .filter((value): value is number => value !== null);
    };

    const groundTargets = grounds
      .map((ground) => {
        const centers = connectedCenters(ground.id);
        const target = centers.length
          ? Math.max(...centers) + settings.rowGap * 0.62
          : clusterTop + settings.rowGap * 0.25;
        return { ground, target };
      })
      .sort((left, right) => left.target - right.target || left.ground.id.localeCompare(right.ground.id));

    let previousY = Number.NEGATIVE_INFINITY;
    for (const { ground, target } of groundTargets) {
      const y = snap(Math.max(target, previousY + settings.rowGap), settings.grid);
      positions.set(ground.id, { x: groundX, y });
      previousY = y;
    }
  }

  return {
    ...document,
    components: document.components.map((component) => ({
      ...component,
      ...(positions.get(component.id) ?? { x: component.x, y: component.y }),
    })),
  };
}
