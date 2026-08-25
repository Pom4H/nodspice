import { useEffect, useState } from 'react';
import { definitionOf, terminalKey } from '../domain/components';
import {
  formatCurrent,
  formatEngineering,
  formatTime,
  formatVoltage,
  parseEngineering,
} from '../domain/engineering';
import type { CompiledCircuit } from '../domain/netlist';
import type {
  AnalysisSettings,
  CircuitComponent,
  SimulationSnapshot,
  Wire,
} from '../domain/types';

type InspectorProps = {
  component: CircuitComponent | null;
  wire: Wire | null;
  analysis: AnalysisSettings;
  compiled: CompiledCircuit;
  snapshot: SimulationSnapshot;
  status: 'loading' | 'solving' | 'ready' | 'error';
  engineVersion: string | null;
  error: string | null;
  warnings: string[];
  onUpdateComponent: (component: CircuitComponent) => void;
  onUpdateAnalysis: (analysis: AnalysisSettings) => void;
  onDelete: () => void;
};

type EngineeringFieldProps = {
  label: string;
  value: number;
  unit: string;
  min?: number;
  allowNegative?: boolean;
  onValue: (value: number) => void;
};

function EngineeringField({
  label,
  value,
  unit,
  min,
  allowNegative = false,
  onValue,
}: EngineeringFieldProps) {
  const [draft, setDraft] = useState(formatEngineering(value));
  useEffect(() => setDraft(formatEngineering(value)), [value]);

  const commit = () => {
    const parsed = parseEngineering(draft);
    const valid =
      parsed !== null &&
      Number.isFinite(parsed) &&
      (allowNegative || parsed >= 0) &&
      (min === undefined || parsed >= min);
    if (!valid) {
      setDraft(formatEngineering(value));
      return;
    }
    onValue(parsed);
    setDraft(formatEngineering(parsed));
  };

  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="engineering-input">
        <input
          value={draft}
          inputMode="decimal"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(formatEngineering(value));
              event.currentTarget.blur();
            }
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

function ComponentFields({
  component,
  onUpdate,
}: {
  component: CircuitComponent;
  onUpdate: (component: CircuitComponent) => void;
}) {
  switch (component.kind) {
    case 'resistor':
      return (
        <EngineeringField
          label="Resistance"
          value={component.properties.resistance}
          unit="Ω"
          min={1e-12}
          onValue={(resistance) =>
            onUpdate({ ...component, properties: { ...component.properties, resistance } })
          }
        />
      );
    case 'capacitor':
      return (
        <EngineeringField
          label="Capacitance"
          value={component.properties.capacitance}
          unit="F"
          min={1e-18}
          onValue={(capacitance) =>
            onUpdate({ ...component, properties: { ...component.properties, capacitance } })
          }
        />
      );
    case 'voltageSource':
      return (
        <EngineeringField
          label="Voltage"
          value={component.properties.voltage}
          unit="V"
          allowNegative
          onValue={(voltage) =>
            onUpdate({ ...component, properties: { ...component.properties, voltage } })
          }
        />
      );
    case 'currentSource':
      return (
        <EngineeringField
          label="Current"
          value={component.properties.current}
          unit="A"
          allowNegative
          onValue={(current) =>
            onUpdate({ ...component, properties: { ...component.properties, current } })
          }
        />
      );
    case 'diode':
      return (
        <>
          <EngineeringField
            label="Saturation current"
            value={component.properties.saturationCurrent}
            unit="A"
            min={1e-30}
            onValue={(saturationCurrent) =>
              onUpdate({
                ...component,
                properties: { ...component.properties, saturationCurrent },
              })
            }
          />
          <EngineeringField
            label="Ideality"
            value={component.properties.ideality}
            unit="n"
            min={0.1}
            onValue={(ideality) =>
              onUpdate({ ...component, properties: { ...component.properties, ideality } })
            }
          />
        </>
      );
    case 'switch':
      return (
        <>
          <label className="toggle-row">
            <span>State</span>
            <button
              type="button"
              className={component.properties.closed ? 'toggle is-on' : 'toggle'}
              onClick={() =>
                onUpdate({
                  ...component,
                  properties: {
                    ...component.properties,
                    closed: !component.properties.closed,
                  },
                })
              }
            >
              {component.properties.closed ? 'Closed' : 'Open'}
            </button>
          </label>
          <EngineeringField
            label="On resistance"
            value={component.properties.onResistance}
            unit="Ω"
            min={1e-9}
            onValue={(onResistance) =>
              onUpdate({
                ...component,
                properties: { ...component.properties, onResistance },
              })
            }
          />
          <EngineeringField
            label="Off resistance"
            value={component.properties.offResistance}
            unit="Ω"
            min={1}
            onValue={(offResistance) =>
              onUpdate({
                ...component,
                properties: { ...component.properties, offResistance },
              })
            }
          />
        </>
      );
    case 'ground':
      return <p className="inspector-note">All ground symbols share the solver reference node 0.</p>;
  }
}

export function Inspector({
  component,
  wire,
  analysis,
  compiled,
  snapshot,
  status,
  engineVersion,
  error,
  warnings,
  onUpdateComponent,
  onUpdateAnalysis,
  onDelete,
}: InspectorProps) {
  const wireNode = wire
    ? compiled.portToNode[terminalKey(wire.from.componentId, wire.from.portId)]
    : null;

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>{component?.label ?? (wire ? 'Wire' : 'Circuit')}</h2>
        </div>
        {(component || wire) && (
          <button type="button" className="icon-button danger" onClick={onDelete} title="Delete selection">
            ×
          </button>
        )}
      </div>

      {component && (
        <section className="inspector-section">
          <label className="field-row">
            <span>Label</span>
            <input
              value={component.label}
              onChange={(event) =>
                onUpdateComponent({ ...component, label: event.target.value.slice(0, 24) })
              }
            />
          </label>
          <ComponentFields component={component} onUpdate={onUpdateComponent} />
          <div className="metric-grid">
            <div>
              <span>Current</span>
              <strong>{formatCurrent(snapshot.elementCurrents[component.id] ?? 0)}</strong>
            </div>
            <div>
              <span>Position</span>
              <strong>
                {Math.round(component.x)}, {Math.round(component.y)}
              </strong>
            </div>
          </div>

          <div className="terminal-table">
            <div className="terminal-table-title">Terminals</div>
            {definitionOf(component).ports.map((port) => {
              const node = compiled.portToNode[terminalKey(component.id, port.id)] ?? '—';
              return (
                <div key={port.id} className="terminal-row">
                  <code>{port.id}</code>
                  <span>{node}</span>
                  <strong>{formatVoltage(snapshot.nodeVoltages[node] ?? 0)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {wire && (
        <section className="inspector-section">
          <div className="metric-grid single-line">
            <div>
              <span>Net</span>
              <strong>{wireNode ?? '—'}</strong>
            </div>
            <div>
              <span>Voltage</span>
              <strong>{formatVoltage(snapshot.nodeVoltages[wireNode ?? ''] ?? 0)}</strong>
            </div>
          </div>
          <div className="wire-endpoints">
            <code>
              {wire.from.componentId}.{wire.from.portId}
            </code>
            <span>→</span>
            <code>
              {wire.to.componentId}.{wire.to.portId}
            </code>
          </div>
        </section>
      )}

      {!component && !wire && (
        <section className="inspector-section intro-card">
          <div className="engine-orbit" aria-hidden="true">
            <span />
          </div>
          <h3>Live MNA in Rust</h3>
          <p>
            Edit the graph and the WebAssembly solver recomputes the electrical state without a
            separate “Run” ritual.
          </p>
          <div className="metric-grid">
            <div>
              <span>Nodes</span>
              <strong>{Object.keys(compiled.nodeToPorts).length}</strong>
            </div>
            <div>
              <span>Elements</span>
              <strong>{compiled.input.elements.length}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="inspector-section">
        <div className="section-title-row">
          <h3>Analysis</h3>
          <span className={`engine-status is-${status}`}>
            {status === 'ready' ? `WASM ${engineVersion ?? ''}` : status}
          </span>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={analysis.mode === 'dc' ? 'is-active' : ''}
            onClick={() => onUpdateAnalysis({ mode: 'dc' })}
          >
            DC
          </button>
          <button
            type="button"
            className={analysis.mode === 'transient' ? 'is-active' : ''}
            onClick={() =>
              onUpdateAnalysis(
                analysis.mode === 'transient'
                  ? analysis
                  : { mode: 'transient', duration: 0.5, timestep: 0.001 },
              )
            }
          >
            Transient
          </button>
        </div>
        {analysis.mode === 'transient' && (
          <>
            <EngineeringField
              label="Duration"
              value={analysis.duration}
              unit="s"
              min={1e-6}
              onValue={(duration) => onUpdateAnalysis({ ...analysis, duration })}
            />
            <EngineeringField
              label="Timestep"
              value={analysis.timestep}
              unit="s"
              min={1e-9}
              onValue={(timestep) => onUpdateAnalysis({ ...analysis, timestep })}
            />
            <div className="analysis-summary">
              <span>{formatTime(snapshot.time)}</span>
              <span>
                {Math.min(2_000, Math.ceil(analysis.duration / analysis.timestep)).toLocaleString()} steps
              </span>
            </div>
          </>
        )}
      </section>

      {(compiled.diagnostics.length > 0 || warnings.length > 0 || error) && (
        <section className="inspector-section messages">
          <h3>Solver messages</h3>
          {error && <p className="message error">{error}</p>}
          {[...compiled.diagnostics, ...warnings].map((message) => (
            <p className="message" key={message}>
              {message}
            </p>
          ))}
        </section>
      )}
    </aside>
  );
}
