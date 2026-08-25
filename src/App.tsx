import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createComponent, terminalKey } from './domain/components';
import { cloneExample, EXAMPLES, type ExampleId } from './domain/examples';
import { formatCurrent, formatTime, formatVoltage } from './domain/engineering';
import type {
  AnalysisSettings,
  CircuitComponent,
  CircuitDocument,
  ComponentKind,
  SelectedItem,
  TerminalRef,
  Wire,
} from './domain/types';
import { CircuitCanvas } from './editor/CircuitCanvas';
import { Inspector } from './editor/Inspector';
import { Toolbar } from './editor/Toolbar';
import { Waveform } from './editor/Waveform';
import { usePlayback } from './hooks/usePlayback';
import { snapshotAt, useSimulation } from './hooks/useSimulation';

const STORAGE_KEY = 'nodspice.document.v1';

function isCircuitDocument(value: unknown): value is CircuitDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CircuitDocument>;
  return (
    candidate.version === 1 &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.components) &&
    Array.isArray(candidate.wires) &&
    Boolean(candidate.analysis)
  );
}

function initialDocument(): CircuitDocument {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneExample('rc-divider');
    const parsed: unknown = JSON.parse(stored);
    return isCircuitDocument(parsed) ? parsed : cloneExample('rc-divider');
  } catch {
    return cloneExample('rc-divider');
  }
}

function sameTerminal(left: TerminalRef, right: TerminalRef): boolean {
  return left.componentId === right.componentId && left.portId === right.portId;
}

function wireExists(wires: Wire[], first: TerminalRef, second: TerminalRef): boolean {
  return wires.some(
    (wire) =>
      (sameTerminal(wire.from, first) && sameTerminal(wire.to, second)) ||
      (sameTerminal(wire.from, second) && sameTerminal(wire.to, first)),
  );
}

export default function App() {
  const [document, setDocument] = useState<CircuitDocument>(initialDocument);
  const [exampleId, setExampleId] = useState<ExampleId>('rc-divider');
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [pendingPort, setPendingPort] = useState<TerminalRef | null>(null);
  const [playing, setPlaying] = useState(true);
  const [probeNode, setProbeNode] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const simulation = useSimulation(document);
  const transient = simulation.transientResult;
  const frameCount = transient?.times.length ?? 1;
  const playbackDuration = transient?.times.at(-1) ?? 1;
  const playback = usePlayback(frameCount, playbackDuration, playing && Boolean(transient));
  const snapshot = useMemo(
    () => snapshotAt(simulation.dcResult, transient, playback.frame),
    [playback.frame, simulation.dcResult, transient],
  );

  const selectedComponent = useMemo(
    () =>
      selected?.type === 'component'
        ? document.components.find((component) => component.id === selected.id) ?? null
        : null,
    [document.components, selected],
  );
  const selectedWire = useMemo(
    () =>
      selected?.type === 'wire'
        ? document.wires.find((wire) => wire.id === selected.id) ?? null
        : null,
    [document.wires, selected],
  );

  const warnings = [
    ...(simulation.dcResult?.warnings ?? []),
    ...(simulation.transientResult?.warnings ?? []),
  ];
  const converged =
    simulation.dcResult?.converged ?? simulation.transientResult?.converged ?? false;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    const nodes = Object.keys(
      simulation.transientResult?.nodeVoltages ?? simulation.dcResult?.nodeVoltages ?? {},
    ).filter((node) => node !== '0');
    if (!nodes.includes(probeNode)) setProbeNode(nodes[0] ?? '');
  }, [probeNode, simulation.dcResult, simulation.transientResult]);

  const updateComponent = useCallback((next: CircuitComponent) => {
    setDocument((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === next.id ? next : component,
      ),
    }));
  }, []);

  const moveComponent = useCallback((componentId: string, x: number, y: number) => {
    setDocument((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === componentId ? { ...component, x, y } : component,
      ),
    }));
  }, []);

  const addComponent = (kind: ComponentKind) => {
    const index = document.components.length;
    const component = createComponent(
      kind,
      {
        x: 460 + (index % 5) * 34,
        y: 270 + (index % 4) * 34,
      },
      document.components,
    );
    setDocument((current) => ({
      ...current,
      components: [...current.components, component],
    }));
    setSelected({ type: 'component', id: component.id });
    setPendingPort(null);
  };

  const deleteSelection = useCallback(() => {
    if (!selected) return;
    if (selected.type === 'wire') {
      setDocument((current) => ({
        ...current,
        wires: current.wires.filter((wire) => wire.id !== selected.id),
      }));
    } else {
      setDocument((current) => ({
        ...current,
        components: current.components.filter((component) => component.id !== selected.id),
        wires: current.wires.filter(
          (wire) =>
            wire.from.componentId !== selected.id && wire.to.componentId !== selected.id,
        ),
      }));
    }
    setSelected(null);
    setPendingPort(null);
  }, [selected]);

  const choosePort = (terminal: TerminalRef) => {
    if (!pendingPort) {
      setPendingPort(terminal);
      setSelected({ type: 'component', id: terminal.componentId });
      return;
    }
    if (sameTerminal(pendingPort, terminal)) {
      setPendingPort(null);
      return;
    }
    if (wireExists(document.wires, pendingPort, terminal)) {
      setPendingPort(null);
      return;
    }
    const wire: Wire = {
      id: `wire-${crypto.randomUUID()}`,
      from: pendingPort,
      to: terminal,
    };
    setDocument((current) => ({ ...current, wires: [...current.wires, wire] }));
    setPendingPort(null);
    setSelected({ type: 'wire', id: wire.id });
  };

  const chooseExample = (id: ExampleId) => {
    setExampleId(id);
    setDocument(cloneExample(id));
    setSelected(null);
    setPendingPort(null);
    setPlaying(true);
    playback.setFrame(0);
  };

  const updateAnalysis = (analysis: AnalysisSettings) => {
    setDocument((current) => ({ ...current, analysis }));
    playback.setFrame(0);
    setPlaying(analysis.mode === 'transient');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        setPendingPort(null);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if (event.code === 'Space' && transient) {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelection, transient]);

  const exportDocument = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'circuit'}.nodspice.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importDocument = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isCircuitDocument(parsed)) throw new Error('Unsupported document structure');
      setDocument(parsed);
      setSelected(null);
      setPendingPort(null);
      setExampleId('rc-divider');
      playback.setFrame(0);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Cannot import circuit');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const selectedNet = selectedWire
    ? simulation.compiled.portToNode[
        terminalKey(selectedWire.from.componentId, selectedWire.from.portId)
      ]
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>nodspice</strong>
            <span>live circuit laboratory</span>
          </div>
        </div>

        <div className="topbar-center">
          <input
            className="document-name"
            value={document.name}
            aria-label="Circuit name"
            onChange={(event) =>
              setDocument((current) => ({ ...current, name: event.target.value.slice(0, 64) }))
            }
          />
          <span className={`solve-pill${converged ? ' is-good' : ''}`}>
            <i />
            {simulation.status === 'ready'
              ? converged
                ? 'solved live'
                : 'solver warning'
              : simulation.status}
          </span>
        </div>

        <div className="topbar-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importDocument(event.target.files?.[0])}
          />
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button type="button" onClick={exportDocument}>
            Export
          </button>
          <a
            className="github-link"
            href="https://github.com/Pom4H/nodspice"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </header>

      <Toolbar
        exampleId={exampleId}
        playing={playing}
        transient={Boolean(transient)}
        canDelete={Boolean(selected)}
        onExample={chooseExample}
        onAdd={addComponent}
        onPlaying={setPlaying}
        onDelete={deleteSelection}
      />

      <main className="workspace">
        <section className="canvas-column">
          <div className="canvas-status-strip">
            <div>
              <span>Time</span>
              <strong>{formatTime(snapshot.time)}</strong>
            </div>
            <div>
              <span>Probe</span>
              <strong>{formatVoltage(snapshot.nodeVoltages[probeNode] ?? 0)}</strong>
            </div>
            <div>
              <span>Selected net</span>
              <strong>{selectedNet ?? '—'}</strong>
            </div>
            <div>
              <span>Peak element current</span>
              <strong>
                {formatCurrent(
                  Math.max(
                    0,
                    ...Object.values(snapshot.elementCurrents).map((value) => Math.abs(value)),
                  ),
                )}
              </strong>
            </div>
          </div>

          <CircuitCanvas
            document={document}
            compiled={simulation.compiled}
            snapshot={snapshot}
            selected={selected}
            pendingPort={pendingPort}
            onSelect={setSelected}
            onMoveComponent={moveComponent}
            onPortClick={choosePort}
          />

          <Waveform
            dcResult={simulation.dcResult}
            transientResult={simulation.transientResult}
            node={probeNode}
            frame={playback.frame}
            onNode={setProbeNode}
            onFrame={playback.setFrame}
          />
        </section>

        <Inspector
          component={selectedComponent}
          wire={selectedWire}
          analysis={document.analysis}
          compiled={simulation.compiled}
          snapshot={snapshot}
          status={simulation.status}
          engineVersion={simulation.engineVersion}
          error={simulation.error}
          warnings={warnings}
          onUpdateComponent={updateComponent}
          onUpdateAnalysis={updateAnalysis}
          onDelete={deleteSelection}
        />
      </main>

      <footer className="app-footer">
        <span>Rust MNA · WebAssembly · React SVG · Bun 1.4</span>
        <span>{EXAMPLES.find((example) => example.id === exampleId)?.description}</span>
      </footer>
    </div>
  );
}
