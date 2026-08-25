import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  definitionOf,
  portOf,
  portPoint,
  terminalKey,
} from '../domain/components';
import { formatCurrent, formatVoltage } from '../domain/engineering';
import { nodeActivity, type CompiledCircuit } from '../domain/netlist';
import type {
  CircuitComponent,
  CircuitDocument,
  Point,
  SelectedItem,
  SimulationSnapshot,
  TerminalRef,
} from '../domain/types';
import { ComponentSymbol } from './ComponentSymbol';
import { pathMidpoint, pointsToPath, routeOrthogonal } from './router';
import { type ViewBoxRect, ViewportStore } from './viewport';

const BASE_VIEWBOX: ViewBoxRect = { x: 0, y: 0, width: 1440, height: 820 };
const GRID = 16;

type CanvasStyle = CSSProperties & {
  '--wire-color'?: string;
  '--flow-duration'?: string;
};

type CircuitCanvasProps = {
  document: CircuitDocument;
  compiled: CompiledCircuit;
  snapshot: SimulationSnapshot;
  selected: SelectedItem;
  pendingPort: TerminalRef | null;
  onSelect: (item: SelectedItem) => void;
  onMoveComponent: (componentId: string, x: number, y: number) => void;
  onPortClick: (port: TerminalRef) => void;
};

type DragState = {
  componentId: string;
  pointerId: number;
  start: Point;
  origin: Point;
  moved: boolean;
};

type PanState = {
  pointerId: number;
  startClient: Point;
  startPan: Point;
  moved: boolean;
};

function voltageColor(voltage: number): string {
  if (!Number.isFinite(voltage)) return 'hsl(220 8% 48%)';
  const strength = Math.min(1, Math.abs(voltage) / 24);
  if (voltage < -1e-6) return `hsl(${270 + strength * 30} 84% ${64 - strength * 10}%)`;
  return `hsl(${198 - strength * 92} ${58 + strength * 30}% ${62 - strength * 10}%)`;
}

function opposite(direction: 'left' | 'right' | 'top' | 'bottom') {
  switch (direction) {
    case 'left':
      return 'right' as const;
    case 'right':
      return 'left' as const;
    case 'top':
      return 'bottom' as const;
    case 'bottom':
      return 'top' as const;
  }
}

function portReadingPosition(
  point: Point,
  direction: 'left' | 'right' | 'top' | 'bottom',
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  switch (direction) {
    case 'left':
      return { x: point.x - 12, y: point.y - 10, anchor: 'end' };
    case 'right':
      return { x: point.x + 12, y: point.y - 10, anchor: 'start' };
    case 'top':
      return { x: point.x + 10, y: point.y - 12, anchor: 'start' };
    case 'bottom':
      return { x: point.x + 10, y: point.y + 22, anchor: 'start' };
  }
}

export function CircuitCanvas({
  document,
  compiled,
  snapshot,
  selected,
  pendingPort,
  onSelect,
  onMoveComponent,
  onPortClick,
}: CircuitCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const viewport = useMemo(() => new ViewportStore(), []);
  useSyncExternalStore(viewport.subscribe, viewport.getVersion);
  const viewBox = viewport.viewBox(BASE_VIEWBOX);
  const [cursor, setCursor] = useState<Point>({ x: BASE_VIEWBOX.width / 2, y: BASE_VIEWBOX.height / 2 });
  const drag = useRef<DragState | null>(null);
  const pan = useRef<PanState | null>(null);
  const componentById = useMemo(
    () => new Map(document.components.map((component) => [component.id, component])),
    [document.components],
  );
  const activity = useMemo(
    () => nodeActivity(document, compiled, snapshot.elementCurrents),
    [compiled, document, snapshot.elementCurrents],
  );
  const rawGridId = useId();
  const gridId = `grid-${rawGridId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const toLocal = (event: { clientX: number; clientY: number }): Point => {
    const matrix = sceneRef.current?.getScreenCTM() ?? svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const local = toLocal(event);
      viewport.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, local.x, local.y, BASE_VIEWBOX);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [viewport]);

  const beginDrag = (event: ReactPointerEvent, component: CircuitComponent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic tests and some browsers may not expose pointer capture.
    }
    drag.current = {
      componentId: component.id,
      pointerId: event.pointerId,
      start: toLocal(event),
      origin: { x: component.x, y: component.y },
      moved: false,
    };
  };

  const beginPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    if (!target.closest('[data-canvas-background="true"]')) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // See beginDrag.
    }
    const current = viewport.getSnapshot();
    pan.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPan: { x: current.panX, y: current.panY },
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const local = toLocal(event);
    setCursor(local);

    if (pan.current?.pointerId === event.pointerId) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const xScale = viewBox.width / Math.max(rect.width, 1);
      const yScale = viewBox.height / Math.max(rect.height, 1);
      const deltaX = (event.clientX - pan.current.startClient.x) * xScale;
      const deltaY = (event.clientY - pan.current.startClient.y) * yScale;
      if (Math.hypot(deltaX, deltaY) > 2 * xScale) pan.current.moved = true;
      viewport.setPan(pan.current.startPan.x - deltaX, pan.current.startPan.y - deltaY);
      return;
    }

    if (drag.current?.pointerId !== event.pointerId) return;
    const deltaX = local.x - drag.current.start.x;
    const deltaY = local.y - drag.current.start.y;
    if (Math.hypot(deltaX, deltaY) > 3) drag.current.moved = true;
    const snap = (value: number) => Math.round(value / GRID) * GRID;
    onMoveComponent(
      drag.current.componentId,
      snap(drag.current.origin.x + deltaX),
      snap(drag.current.origin.y + deltaY),
    );
  };

  const finishPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pan.current?.pointerId === event.pointerId) {
      const moved = pan.current.moved;
      pan.current = null;
      if (!moved) onSelect(null);
    }
    if (drag.current?.pointerId === event.pointerId) {
      const state = drag.current;
      drag.current = null;
      if (!state.moved) onSelect({ type: 'component', id: state.componentId });
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore missing capture.
    }
  };

  const pendingSource = pendingPort
    ? componentById.get(pendingPort.componentId)
    : undefined;
  const pendingPath = pendingSource
    ? pointsToPath(
        routeOrthogonal(
          {
            point: portPoint(pendingSource, pendingPort!.portId),
            direction: portOf(pendingSource, pendingPort!.portId).direction,
          },
          {
            point: cursor,
            direction: opposite(portOf(pendingSource, pendingPort!.portId).direction),
          },
        ),
      )
    : null;

  return (
    <div className="canvas-shell">
      <svg
        ref={svgRef}
        className="circuit-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label="Interactive electrical schematic"
        onPointerDown={beginPan}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <defs>
          <pattern id={gridId} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} className="canvas-grid-line" />
          </pattern>
        </defs>
        <g ref={sceneRef}>
          <rect
            data-canvas-background="true"
            className="canvas-background"
            x={BASE_VIEWBOX.x - 1_000}
            y={BASE_VIEWBOX.y - 1_000}
            width={BASE_VIEWBOX.width + 2_000}
            height={BASE_VIEWBOX.height + 2_000}
          />
          <rect
            data-canvas-background="true"
            className="canvas-grid"
            x={BASE_VIEWBOX.x - 1_000}
            y={BASE_VIEWBOX.y - 1_000}
            width={BASE_VIEWBOX.width + 2_000}
            height={BASE_VIEWBOX.height + 2_000}
            fill={`url(#${gridId})`}
          />

          <g className="wire-layer">
            {document.wires.map((wire) => {
              const fromComponent = componentById.get(wire.from.componentId);
              const toComponent = componentById.get(wire.to.componentId);
              if (!fromComponent || !toComponent) return null;
              const fromPort = portOf(fromComponent, wire.from.portId);
              const toPort = portOf(toComponent, wire.to.portId);
              const points = routeOrthogonal(
                {
                  point: portPoint(fromComponent, wire.from.portId),
                  direction: fromPort.direction,
                },
                {
                  point: portPoint(toComponent, wire.to.portId),
                  direction: toPort.direction,
                },
              );
              const path = pointsToPath(points);
              const node = compiled.portToNode[refKey(wire.from)];
              const voltage = snapshot.nodeVoltages[node] ?? 0;
              const current = activity[node] ?? 0;
              const active = current > 1e-9;
              const selectedWire = selected?.type === 'wire' && selected.id === wire.id;
              const speed = Math.max(0.34, Math.min(2.6, 1.8 / (1 + Math.log10(1 + current * 1e6))));
              const style: CanvasStyle = {
                '--wire-color': voltageColor(voltage),
                '--flow-duration': `${speed}s`,
              };
              const middle = pathMidpoint(points);
              return (
                <g
                  key={wire.id}
                  className={`wire${selectedWire ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
                  style={style}
                >
                  <path
                    className="wire-hit"
                    d={path}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelect({ type: 'wire', id: wire.id });
                    }}
                  />
                  <path className="wire-glow" d={path} vectorEffect="non-scaling-stroke" />
                  <path className="wire-base" d={path} vectorEffect="non-scaling-stroke" />
                  <path className="wire-flow" d={path} pathLength="100" vectorEffect="non-scaling-stroke" />
                  {selectedWire && (
                    <g className="wire-reading" transform={`translate(${middle.x} ${middle.y})`}>
                      <rect x="-56" y="-18" width="112" height="36" rx="18" />
                      <text textAnchor="middle" y="-2">
                        {formatVoltage(voltage)}
                      </text>
                      <text textAnchor="middle" y="12">
                        {formatCurrent(current)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {pendingPath && (
              <path className="wire-preview" d={pendingPath} vectorEffect="non-scaling-stroke" />
            )}
          </g>

          <g className="component-layer">
            {document.components.map((component) => {
              const definition = definitionOf(component);
              const selectedComponent =
                selected?.type === 'component' && selected.id === component.id;
              const current = snapshot.elementCurrents[component.id];
              return (
                <g
                  key={component.id}
                  className={`component-node${selectedComponent ? ' is-selected' : ''}`}
                  transform={`translate(${component.x} ${component.y})`}
                  onPointerDown={(event) => beginDrag(event, component)}
                >
                  <rect
                    className="component-hit"
                    x="-12"
                    y="-22"
                    width={definition.width + 24}
                    height={definition.height + 66}
                    rx="16"
                  />
                  {selectedComponent && (
                    <rect
                      className="component-selection"
                      x="-10"
                      y="-18"
                      width={definition.width + 20}
                      height={definition.height + 56}
                      rx="15"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <ComponentSymbol component={component} current={selectedComponent ? current : undefined} />
                </g>
              );
            })}
          </g>

          <g className="port-layer">
            {document.components.flatMap((component) =>
              definitionOf(component).ports.map((port) => {
                const point = portPoint(component, port.id);
                const key = terminalKey(component.id, port.id);
                const node = compiled.portToNode[key];
                const voltage = snapshot.nodeVoltages[node] ?? 0;
                const isPending =
                  pendingPort?.componentId === component.id && pendingPort.portId === port.id;
                const selectedComponent =
                  selected?.type === 'component' && selected.id === component.id;
                const reading = portReadingPosition(point, port.direction);
                return (
                  <g key={key}>
                    <circle
                      className={`terminal${isPending ? ' is-pending' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isPending ? 7 : 5}
                      style={{ fill: voltageColor(voltage) }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPortClick({ componentId: component.id, portId: port.id });
                      }}
                    />
                    {selectedComponent && (
                      <text
                        className="terminal-reading"
                        x={reading.x}
                        y={reading.y}
                        textAnchor={reading.anchor}
                      >
                        {node} · {formatVoltage(voltage)}
                      </text>
                    )}
                  </g>
                );
              }),
            )}
          </g>
        </g>
      </svg>

      <div className="canvas-help">
        {pendingPort ? 'Choose a second terminal · Esc cancels' : 'Drag components · click terminals to wire · wheel to zoom'}
      </div>
      <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
        <button type="button" onClick={() => viewport.zoomAt(1.25, 720, 410, BASE_VIEWBOX)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => viewport.reset()} aria-label="Fit circuit">
          Fit
        </button>
        <button type="button" onClick={() => viewport.zoomAt(1 / 1.25, 720, 410, BASE_VIEWBOX)} aria-label="Zoom out">
          −
        </button>
      </div>
    </div>
  );
}

function refKey(ref: TerminalRef): string {
  return terminalKey(ref.componentId, ref.portId);
}
