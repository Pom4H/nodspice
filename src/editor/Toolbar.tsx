import { COMPONENT_DEFINITIONS } from '../domain/components';
import { formatTime } from '../domain/engineering';
import { EXAMPLES, type ExampleId } from '../domain/examples';
import type { ComponentKind } from '../domain/types';

const ADDABLE: ComponentKind[] = [
  'resistor',
  'capacitor',
  'voltageSource',
  'currentSource',
  'diode',
  'switch',
  'ground',
];

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

type ToolbarProps = {
  exampleId: ExampleId | null;
  playing: boolean;
  transient: boolean;
  canDelete: boolean;
  canAutoLayout: boolean;
  frame: number;
  frameCount: number;
  currentTime: number;
  totalTime: number;
  speed: number;
  waveformVisible: boolean;
  onExample: (id: ExampleId) => void;
  onAdd: (kind: ComponentKind) => void;
  onPlaying: (playing: boolean) => void;
  onDelete: () => void;
  onAutoLayout: () => void;
  onFrame: (frame: number) => void;
  onSpeed: (speed: number) => void;
  onWaveformVisible: (visible: boolean) => void;
};

export function Toolbar({
  exampleId,
  playing,
  transient,
  canDelete,
  canAutoLayout,
  frame,
  frameCount,
  currentTime,
  totalTime,
  speed,
  waveformVisible,
  onExample,
  onAdd,
  onPlaying,
  onDelete,
  onAutoLayout,
  onFrame,
  onSpeed,
  onWaveformVisible,
}: ToolbarProps) {
  const lastFrame = Math.max(0, frameCount - 1);

  return (
    <div className="toolbar">
      <label className="toolbar-example">
        <span>Circuit</span>
        <select
          value={exampleId ?? ''}
          onChange={(event) => onExample(event.target.value as ExampleId)}
        >
          <option value="" disabled>
            Custom circuit
          </option>
          {EXAMPLES.map((example) => (
            <option key={example.id} value={example.id}>
              {example.title}
            </option>
          ))}
        </select>
      </label>

      <div className="toolbar-divider" />
      <div className="toolbar-components" aria-label="Add circuit component">
        {ADDABLE.map((kind) => {
          const definition = COMPONENT_DEFINITIONS[kind];
          return (
            <button
              key={kind}
              type="button"
              className="tool-button"
              title={`Add ${definition.title}`}
              onClick={() => onAdd(kind)}
            >
              <span className="tool-glyph">{definition.shortTitle}</span>
              <span>{definition.title}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar-spacer" />
      <button
        type="button"
        className="toolbar-action layout-action"
        disabled={!canAutoLayout}
        onClick={onAutoLayout}
        title="Arrange components by electrical connectivity"
      >
        Auto layout
      </button>
      <button
        type="button"
        className={`toolbar-action${waveformVisible ? ' is-active' : ''}`}
        onClick={() => onWaveformVisible(!waveformVisible)}
        aria-pressed={waveformVisible}
      >
        Trace
      </button>
      <button
        type="button"
        className="toolbar-action"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete
      </button>

      <div className="playback-controls" aria-label="Transient playback">
        <button
          type="button"
          className="playback-step"
          disabled={!transient || frame <= 0}
          onClick={() => onFrame(frame - 1)}
          aria-label="Previous sample"
          title="Previous sample"
        >
          ‹
        </button>
        <button
          type="button"
          className={`toolbar-action is-primary${playing ? ' is-running' : ''}`}
          disabled={!transient}
          onClick={() => onPlaying(!playing)}
          title="Play or pause (Space)"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="playback-range"
          type="range"
          min={0}
          max={lastFrame}
          step={1}
          value={Math.min(frame, lastFrame)}
          disabled={!transient || lastFrame === 0}
          aria-label="Simulation time"
          onChange={(event) => onFrame(Number(event.target.value))}
        />
        <output className="playback-time" aria-live="off">
          {transient ? `${formatTime(currentTime)} / ${formatTime(totalTime)}` : 'DC'}
        </output>
        <select
          className="playback-speed"
          value={speed}
          disabled={!transient}
          aria-label="Playback speed"
          onChange={(event) => onSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <button
          type="button"
          className="playback-step"
          disabled={!transient || frame >= lastFrame}
          onClick={() => onFrame(frame + 1)}
          aria-label="Next sample"
          title="Next sample"
        >
          ›
        </button>
      </div>
    </div>
  );
}
