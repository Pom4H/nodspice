import type { CircuitComponent } from './types';

const PREFIXES = [
  { power: 12, symbol: 'T' },
  { power: 9, symbol: 'G' },
  { power: 6, symbol: 'M' },
  { power: 3, symbol: 'k' },
  { power: 0, symbol: '' },
  { power: -3, symbol: 'm' },
  { power: -6, symbol: 'µ' },
  { power: -9, symbol: 'n' },
  { power: -12, symbol: 'p' },
] as const;

export function formatEngineering(value: number, unit = '', significant = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `0${unit ? ` ${unit}` : ''}`;
  const absolute = Math.abs(value);
  const selected =
    PREFIXES.find(({ power }) => absolute >= 10 ** power) ?? PREFIXES[PREFIXES.length - 1];
  const scaled = value / 10 ** selected.power;
  const integerDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled))) + 1);
  const decimals = Math.max(0, significant - integerDigits);
  const number = Number(scaled.toFixed(decimals)).toString();
  return `${number} ${selected.symbol}${unit}`.trim();
}

export function parseEngineering(source: string): number | null {
  const normalized = source.trim().replace(',', '.').replace(/\s+/g, '');
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([TGMkmunpµ]?)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const rawPrefix = match[2] ?? '';
  const prefix = rawPrefix === 'u' || rawPrefix === 'U' ? 'µ' : rawPrefix;
  const powers: Record<string, number> = {
    T: 12,
    G: 9,
    M: 6,
    k: 3,
    K: 3,
    '': 0,
    m: -3,
    µ: -6,
    n: -9,
    p: -12,
  };
  const power = powers[prefix];
  return power === undefined ? null : value * 10 ** power;
}

export function formatVoltage(value: number): string {
  return formatEngineering(value, 'V', 4);
}

export function formatCurrent(value: number): string {
  return formatEngineering(value, 'A', 4);
}

export function formatTime(value: number): string {
  return formatEngineering(value, 's', 4);
}

export function componentValue(component: CircuitComponent): string {
  switch (component.kind) {
    case 'resistor':
      return formatEngineering(component.properties.resistance, 'Ω');
    case 'capacitor':
      return formatEngineering(component.properties.capacitance, 'F');
    case 'voltageSource':
      return formatVoltage(component.properties.voltage);
    case 'currentSource':
      return formatCurrent(component.properties.current);
    case 'diode':
      return `n=${component.properties.ideality}`;
    case 'switch':
      return component.properties.closed ? 'closed' : 'open';
    case 'ground':
      return '0 V';
  }
}
