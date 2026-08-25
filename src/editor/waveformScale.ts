export type PlotRange = { min: number; max: number };

export function voltagePlotRange(values: number[]): PlotRange {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { min: -1, max: 1 };

  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const rawSpan = rawMax - rawMin;
  const reference = Math.max(Math.abs(rawMin), Math.abs(rawMax), 1e-9);

  if (rawSpan <= reference * 1e-9) {
    const margin = Math.max(reference * 0.1, 1e-6);
    return { min: rawMin - margin, max: rawMax + margin };
  }

  const margin = Math.max(rawSpan * 0.1, reference * 0.015, 1e-9);
  const nearZeroThreshold = Math.max(rawSpan * 0.35, reference * 0.02);

  if (rawMin >= 0 && rawMin <= nearZeroThreshold) {
    return { min: 0, max: rawMax + margin };
  }
  if (rawMax <= 0 && Math.abs(rawMax) <= nearZeroThreshold) {
    return { min: rawMin - margin, max: 0 };
  }
  return { min: rawMin - margin, max: rawMax + margin };
}
