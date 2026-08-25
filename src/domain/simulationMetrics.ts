import type { SimulationSnapshot, TransientResult } from './types';

export type CurrentPeak = {
  elementId: string;
  current: number;
  magnitude: number;
  frame: number;
  time: number;
};

export function currentPeakAt(snapshot: SimulationSnapshot): CurrentPeak | null {
  let peak: CurrentPeak | null = null;
  for (const [elementId, current] of Object.entries(snapshot.elementCurrents)) {
    if (!Number.isFinite(current)) continue;
    const magnitude = Math.abs(current);
    if (!peak || magnitude > peak.magnitude) {
      peak = { elementId, current, magnitude, frame: 0, time: snapshot.time };
    }
  }
  return peak;
}

export function currentPeakAcross(result: TransientResult | null): CurrentPeak | null {
  if (!result) return null;
  let peak: CurrentPeak | null = null;
  for (const [elementId, series] of Object.entries(result.elementCurrents)) {
    for (let frame = 0; frame < series.length; frame += 1) {
      const current = series[frame];
      if (current === undefined || !Number.isFinite(current)) continue;
      const magnitude = Math.abs(current);
      if (!peak || magnitude > peak.magnitude) {
        peak = {
          elementId,
          current,
          magnitude,
          frame,
          time: result.times[frame] ?? 0,
        };
      }
    }
  }
  return peak;
}
