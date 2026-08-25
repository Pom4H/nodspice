import { useMemo, useRef } from 'react';
import { formatTime, formatVoltage } from '../domain/engineering';
import type { SolveResult, TransientResult } from '../domain/types';

const WIDTH = 1_000;
const HEIGHT = 196;
const PADDING = { left: 56, right: 24, top: 22, bottom: 30 };

type WaveformProps = {
  dcResult: SolveResult | null;
  transientResult: TransientResult | null;
  node: string;
  frame: number;
  onNode: (node: string) => void;
  onFrame: (frame: number) => void;
};

export function Waveform({
  dcResult,
  transientResult,
  node,
  frame,
  onNode,
  onFrame,
}: WaveformProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useMemo(() => {
    const source = transientResult?.nodeVoltages ?? dcResult?.nodeVoltages ?? {};
    return Object.keys(source).filter((candidate) => candidate !== '0').sort();
  }, [dcResult, transientResult]);

  const trace = transientResult?.nodeVoltages[node];
  const times = transientResult?.times;
  const dcValue = dcResult?.nodeVoltages[node];
  const values = trace && trace.length > 0 ? trace : dcValue !== undefined ? [dcValue, dcValue] : [];
  const xValues = times && trace ? times : values.length ? [0, 1] : [];

  const finiteValues = values.filter(Number.isFinite);
  const rawMin = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMax = finiteValues.length ? Math.max(...finiteValues) : 1;
  const span = Math.max(1e-9, rawMax - rawMin);
  const min = rawMin - span * 0.12;
  const max = rawMax + span * 0.12;
  const xMax = xValues.at(-1) ?? 1;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (value: number) => PADDING.left + (value / Math.max(xMax, 1e-12)) * plotWidth;
  const y = (value: number) => PADDING.top + ((max - value) / Math.max(max - min, 1e-12)) * plotHeight;
  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(xValues[index] ?? 0)} ${y(value)}`)
    .join(' ');
  const boundedFrame = Math.max(0, Math.min(values.length - 1, frame));
  const currentValue = values[boundedFrame] ?? 0;
  const currentTime = xValues[boundedFrame] ?? 0;

  const scrub = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || values.length <= 1) return;
    const rect = svg.getBoundingClientRect();
    const local = ((clientX - rect.left) / Math.max(rect.width, 1)) * WIDTH;
    const ratio = Math.max(0, Math.min(1, (local - PADDING.left) / plotWidth));
    onFrame(ratio * (values.length - 1));
  };

  return (
    <section className="waveform-panel">
      <div className="waveform-header">
        <div>
          <span className="eyebrow">Probe</span>
          <strong>{node || 'No electrical node'}</strong>
        </div>
        <select value={node} onChange={(event) => onNode(event.target.value)} disabled={nodes.length === 0}>
          {nodes.length === 0 && <option value="">No nodes</option>}
          {nodes.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
        <div className="waveform-live-value">
          <strong>{formatVoltage(currentValue)}</strong>
          <span>{transientResult ? formatTime(currentTime) : 'DC operating point'}</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="waveform-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          scrub(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) scrub(event.clientX);
        }}
      >
        <defs>
          <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const lineY = PADDING.top + ratio * plotHeight;
          const value = max - ratio * (max - min);
          return (
            <g key={ratio}>
              <line className="wave-grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={lineY} y2={lineY} />
              <text className="wave-axis-label" x={PADDING.left - 10} y={lineY + 4} textAnchor="end">
                {formatVoltage(value)}
              </text>
            </g>
          );
        })}
        {path && (
          <>
            <path
              className="wave-area"
              d={`${path} L ${x(xValues.at(-1) ?? 0)} ${PADDING.top + plotHeight} L ${x(xValues[0] ?? 0)} ${PADDING.top + plotHeight} Z`}
            />
            <path className="wave-line" d={path} />
            <line
              className="wave-cursor"
              x1={x(currentTime)}
              x2={x(currentTime)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
            />
            <circle className="wave-point" cx={x(currentTime)} cy={y(currentValue)} r="5" />
          </>
        )}
        <text className="wave-axis-label" x={PADDING.left} y={HEIGHT - 8}>
          0 s
        </text>
        <text className="wave-axis-label" x={WIDTH - PADDING.right} y={HEIGHT - 8} textAnchor="end">
          {transientResult ? formatTime(xMax) : 'DC'}
        </text>
      </svg>
    </section>
  );
}
