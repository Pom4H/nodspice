import { COMPONENT_DEFINITIONS } from '../domain/components';
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

type ToolbarProps = {
  exampleId: ExampleId;
  playing: boolean;
  transient: boolean;
  canDelete: boolean;
  onExample: (id: ExampleId) => void;
  onAdd: (kind: ComponentKind) => void;
  onPlaying: (playing: boolean) => void;
  onDelete: () => void;
};

export function Toolbar({
  exampleId,
  playing,
  transient,
  canDelete,
  onExample,
  onAdd,
  onPlaying,
  onDelete,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <label className="toolbar-example">
        <span>Example</span>
        <select value={exampleId} onChange={(event) => onExample(event.target.value as ExampleId)}>
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
        className="toolbar-action"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete
      </button>
      <button
        type="button"
        className={`toolbar-action is-primary${playing ? ' is-running' : ''}`}
        disabled={!transient}
        onClick={() => onPlaying(!playing)}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
}
