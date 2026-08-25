import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createComponent, terminalKey } from './domain/components';
import { cloneExample, EXAMPLES, type ExampleId } from './domain/examples';
import { formatCurrent, formatTime, formatVoltage } from './domain/engineering';
import { currentPeakAcross, currentPeakAt } from './domain/simulationMetrics';
import { autoLayoutCircuit } from './editor/autoLayout';
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
import { applyTheme, loadTheme, toggleTheme, type ThemeMode } from './theme';

const STORAGE_KEY = 'nodspice.document.v1';
type InitialState = {
  document: CircuitDocument;
  exampleId: ExampleId | null;
};

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

function loadInitialState(): InitialState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {
        document: autoLayoutCircuit(cloneExample('rc-divider')),
        exampleId: 'rc-divider',
      };
    }
    const parsed: unknown = JSON.parse(stored);
    if (isCircuitDocument(parsed)) return { document: parsed, exampleId: null };
  } catch {
    // Fall through to the bundled starter circuit.
  }
  return {
    document: autoLayoutCircuit(cloneExample('rc-divider')),
    exampleId: 'rc-divider',
  };
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
  const [initial] = useState(loadInitialState);
  const [document, setDocument] = useState<CircuitDocument>(initial.document);
  const [exampleId, setExampleId] = useState<ExampleId | null>(initial.exampleId);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [pendingPort, setPendingPort] = useState<TerminalRef | null>(null);
  const [playing, setPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [waveformVisible, setWaveformVisible] = useState(true);
  const [probeNode, setProbeNode] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const simulation = useSimulation(document);
  const transient = simulation.transientResult;
  const frameCount = transient?.times.length ?? 1;
  const playbackDuration = transient?.times.at(-1) ?? 1;
  const playback = usePlayback(
    frameCount,
    playbackDuration,
    playing && Boolean(transient),
    playbackSpeed,
  );
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

  const nodeLabels = useMemo(() => {
    const componentById = new Map(
      document.components.map((component) => [component.id, component.label]),
    );
    return Object.fromEntries(
      Object.entries(simulation.compiled.nodeToPorts).map(([node, ports]) => {
        const labels = ports.map((key) => {
          const separator = key.lastIndexOf(':');
          const componentId = separator >= 0 ? key.slice(0, separator) : key;
          const portId = separator >= 0 ? key.slice(separator + 1) : '';
          return `${componentById.get(componentId) ?? componentId}.${portId}`;
        });
        const visible = labels.slice(0, 3).join(' · ');
        const remaining = labels.length - 3;
        return [node, remaining > 0 ? `${visible} · +${remaining}` : visible];
      }),
    );
  }, [document.components, simulation.compiled.nodeToPorts]);

  const framePeak = useMemo(() => currentPeakAt(snapshot), [snapshot]);
  const runPeak = useMemo(() => currentPeakAcross(transient), [transient]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const nodes = Object.keys(
      simulation.transientResult?.nodeVoltages ?? simulation.dcResult?.nodeVoltages ?? {},
    ).filter((node) => node !== '0');
    if (!nodes.includes(probeNode)) setProbeNode(nodes[0] ?? '');
  }, [probeNode, simulation.dcResult, simulation.transientResult]);

  useEffect(() => {
    if (!selectedWire) return;
    const node =
      simulation.compiled.portToNode[
        terminalKey(selectedWire.from.componentId, selectedWire.from.portId)
      ];
    if (node && node !== '0') setProbeNode(node);
  }, [selectedWire, simulation.compiled.portToNode]);

  const markCustom = useCallback(() => setExampleId(null), []);

  const updateComponent = useCallback(
    (next: CircuitComponent) => {
      markCustom();
      setDocument((current) => ({
        ...current,
        components: current.components.map((component) =>
          component.id === next.id ? next : component,
        ),
      }));
    },
    [markCustom],
  );

  const moveComponent = useCallback(
    (componentId: string, x: number, y: number) => {
      markCustom();
      setDocument((current) => ({
        ...current,
        components: current.components.map((component) =>
          component.id === componentId ? { ...component, x, y } : component,
        ),
      }));
    },
    [markCustom],
  );

  const arrangeCircuit = useCallback(() => {
    markCustom();
    setDocument((current) => autoLayoutCircuit(current));
    setSelected(null);
    setPendingPort(null);
    setLayoutRevision((current) => current + 1);
  }, [markCustom]);

  const addComponent = (kind: ComponentKind) => {
    markCustom();
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
    markCustom();
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
  }, [markCustom, selected]);

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
    markCustom();
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
    setDocument(autoLayoutCircuit(cloneExample(id)));
    setSelected(null);
    setPendingPort(null);
    setPlaying(true);
    setLayoutRevision((current) => current + 1);
    playback.setFrame(0);
  };

  const updateAnalysis = (analysis: AnalysisSettings) => {
    markCustom();
    setDocument((current) => ({ ...current, analysis }));
    playback.setFrame(0);
    setPlaying(analysis.mode === 'transient');
  };

  const scrubTo = (frame: number) => {
    playback.setFrame(frame);
    setPlaying(false);
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
    anchor.download = `${
      document.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'circuit'
    }.nodspice.json`;
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
      setExampleId(null);
      setLayoutRevision((current) => current + 1);
      playback.setFrame(0);
      setPlaying(parsed.analysis.mode === 'transient');
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
  const selectionTitle = selectedComponent?.label ??
    (selectedNet ? nodeLabels[selectedNet] ?? selectedNet : 'Nothing selected');
  const selectionValue = selectedComponent
    ? formatCurrent(snapshot.elementCurrents[selectedComponent.id] ?? 0)
    : selectedNet
      ? formatVoltage(snapshot.nodeVoltages[selectedNet] ?? 0)
      : 'Click a component or wire';
  const probeLabel = nodeLabels[probeNode] ?? (probeNode || 'No probe');
  const runPeakText = runPeak
    ? `${formatCurrent(runPeak.magnitude)} · ${formatTime(runPeak.time)}`
    : 'No transient peak';

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
            onChange={(event) => {
              markCustom();
              setDocument((current) => ({
                ...current,
                name: event.target.value.slice(0, 64),
              }));
            }}
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
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => toggleTheme(current))}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            <span className="theme-icon" aria-hidden="true" />
            {theme === 'light' ? 'Light' : 'Dark'}
          </button>
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
        canAutoLayout={document.components.length > 1}
        frame={playback.frame}
        frameCount={frameCount}
        currentTime={snapshot.time}
        totalTime={playbackDuration}
        speed={playbackSpeed}
        waveformVisible={waveformVisible}
        onExample={chooseExample}
        onAdd={addComponent}
        onPlaying={setPlaying}
        onDelete={deleteSelection}
        onAutoLayout={arrangeCircuit}
        onFrame={scrubTo}
        onSpeed={setPlaybackSpeed}
        onWaveformVisible={setWaveformVisible}
      />

      <main className="workspace">
        <section
          className={`canvas-column${waveformVisible ? '' : ' is-waveform-hidden'}`}
        >
          <div className="canvas-status-strip">
            <div className="status-metric">
              <span>Time</span>
              <strong>
                {transient
                  ? `${formatTime(snapshot.time)} / ${formatTime(playbackDuration)}`
                  : 'DC operating point'}
              </strong>
              <small>
                {transient ? `sample ${playback.frame + 1} of ${frameCount}` : 'steady state'}
              </small>
            </div>
            <div className="status-metric">
              <span>Voltage probe</span>
              <strong>{formatVoltage(snapshot.nodeVoltages[probeNode] ?? 0)}</strong>
              <small title={probeLabel}>{probeLabel}</small>
            </div>
            <div className="status-metric">
              <span>Selection</span>
              <strong title={selectionTitle}>{selectionTitle}</strong>
              <small>{selectionValue}</small>
            </div>
            <div className="status-metric">
              <span>Max |I| now</span>
              <strong>{framePeak ? formatCurrent(framePeak.magnitude) : '—'}</strong>
              <small>run max {runPeakText}</small>
            </div>
          </div>

          <CircuitCanvas
            document={document}
            compiled={simulation.compiled}
            snapshot={snapshot}
            selected={selected}
            pendingPort={pendingPort}
            fitRevision={layoutRevision}
            onSelect={setSelected}
            onMoveComponent={moveComponent}
            onPortClick={choosePort}
          />

          {waveformVisible && (
            <Waveform
              dcResult={simulation.dcResult}
              transientResult={simulation.transientResult}
              node={probeNode}
              nodeLabels={nodeLabels}
              frame={playback.frame}
              onNode={setProbeNode}
              onFrame={scrubTo}
            />
          )}
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
        <span>
          {exampleId
            ? EXAMPLES.find((example) => example.id === exampleId)?.description
            : 'Custom circuit · changes saved locally'}
        </span>
      </footer>
    </div>
  );
}
