import { memo } from 'react';
import { definitionOf } from '../domain/components';
import { componentValue, formatCurrent } from '../domain/engineering';
import type { CircuitComponent } from '../domain/types';

type ComponentSymbolProps = {
  component: CircuitComponent;
  current?: number;
};

function CircuitGlyph({ component }: { component: CircuitComponent }) {
  switch (component.kind) {
    case 'resistor':
      return (
        <g className="symbol-stroke">
          <line x1="0" y1="32" x2="18" y2="32" />
          <path d="M18 32 L28 18 L40 46 L52 18 L64 46 L76 18 L88 46 L94 32" />
          <line x1="94" y1="32" x2="112" y2="32" />
        </g>
      );
    case 'capacitor':
      return (
        <g className="symbol-stroke">
          <line x1="0" y1="32" x2="45" y2="32" />
          <line x1="45" y1="12" x2="45" y2="52" />
          <line x1="67" y1="12" x2="67" y2="52" />
          <line x1="67" y1="32" x2="112" y2="32" />
        </g>
      );
    case 'diode':
      return (
        <g className="symbol-stroke">
          <line x1="0" y1="32" x2="30" y2="32" />
          <path className="symbol-fill" d="M30 14 L70 32 L30 50 Z" />
          <line x1="72" y1="12" x2="72" y2="52" />
          <line x1="72" y1="32" x2="112" y2="32" />
        </g>
      );
    case 'switch':
      return (
        <g className="symbol-stroke">
          <line x1="0" y1="32" x2="30" y2="32" />
          <circle className="symbol-fill" cx="34" cy="32" r="4" />
          <circle className="symbol-fill" cx="78" cy="32" r="4" />
          <line
            className="switch-blade"
            x1="34"
            y1="32"
            x2="78"
            y2={component.properties.closed ? 32 : 14}
          />
          <line x1="82" y1="32" x2="112" y2="32" />
        </g>
      );
    case 'voltageSource':
      return (
        <g className="symbol-stroke">
          <line x1="36" y1="0" x2="36" y2="34" />
          <circle className="source-body" cx="36" cy="60" r="26" />
          <line x1="36" y1="86" x2="36" y2="120" />
          <line x1="28" y1="49" x2="44" y2="49" />
          <line x1="36" y1="41" x2="36" y2="57" />
          <line x1="28" y1="72" x2="44" y2="72" />
        </g>
      );
    case 'currentSource':
      return (
        <g className="symbol-stroke">
          <line x1="36" y1="0" x2="36" y2="34" />
          <circle className="source-body" cx="36" cy="60" r="26" />
          <line x1="36" y1="86" x2="36" y2="120" />
          <line x1="36" y1="76" x2="36" y2="44" />
          <path className="symbol-fill" d="M28 52 L36 42 L44 52 Z" />
        </g>
      );
    case 'ground':
      return (
        <g className="symbol-stroke">
          <line x1="36" y1="0" x2="36" y2="20" />
          <line x1="12" y1="20" x2="60" y2="20" />
          <line x1="20" y1="31" x2="52" y2="31" />
          <line x1="28" y1="42" x2="44" y2="42" />
        </g>
      );
  }
}

export const ComponentSymbol = memo(function ComponentSymbol({
  component,
  current,
}: ComponentSymbolProps) {
  const definition = definitionOf(component);
  const vertical = component.kind === 'voltageSource' || component.kind === 'currentSource';
  return (
    <g className="component-symbol" data-kind={component.kind}>
      <CircuitGlyph component={component} />
      <text
        className="component-label"
        x={definition.width / 2}
        y={vertical ? 56 : -10}
        textAnchor="middle"
      >
        {component.label}
      </text>
      <text
        className="component-value"
        x={definition.width / 2}
        y={vertical ? 68 : definition.height + 18}
        textAnchor="middle"
      >
        {componentValue(component)}
      </text>
      {current !== undefined && Number.isFinite(current) && (
        <text
          className="component-current"
          x={definition.width / 2}
          y={vertical ? definition.height + 22 : definition.height + 36}
          textAnchor="middle"
        >
          {formatCurrent(current)}
        </text>
      )}
    </g>
  );
});
