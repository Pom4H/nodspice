import { useEffect, useMemo, useState } from 'react';
import { compileCircuit, type CompiledCircuit } from '../domain/netlist';
import type {
  CircuitDocument,
  SimulationSnapshot,
  SolveResult,
  TransientResult,
} from '../domain/types';
import { simulateTransient, solveDc, solverVersion } from '../solver';

export type SimulationState = {
  compiled: CompiledCircuit;
  status: 'loading' | 'solving' | 'ready' | 'error';
  engineVersion: string | null;
  dcResult: SolveResult | null;
  transientResult: TransientResult | null;
  error: string | null;
};

export function useSimulation(document: CircuitDocument): SimulationState {
  const compiled = useMemo(() => compileCircuit(document), [document]);
  const [state, setState] = useState<Omit<SimulationState, 'compiled'>>({
    status: 'loading',
    engineVersion: null,
    dcResult: null,
    transientResult: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'solving', error: null }));

    const run = async () => {
      try {
        const version = await solverVersion();
        if (document.analysis.mode === 'dc') {
          const result = await solveDc(compiled.input);
          if (!cancelled) {
            setState({
              status: 'ready',
              engineVersion: version,
              dcResult: result,
              transientResult: null,
              error: null,
            });
          }
          return;
        }

        const requestedSteps = Math.ceil(
          document.analysis.duration / document.analysis.timestep,
        );
        const steps = Math.max(2, Math.min(2_000, requestedSteps));
        const timestep = document.analysis.duration / steps;
        const result = await simulateTransient(compiled.input, timestep, steps);
        if (!cancelled) {
          setState({
            status: 'ready',
            engineVersion: version,
            dcResult: null,
            transientResult: result,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: 'error',
            dcResult: null,
            transientResult: null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [compiled, document.analysis]);

  return { compiled, ...state };
}

export function snapshotAt(
  dcResult: SolveResult | null,
  transientResult: TransientResult | null,
  frame: number,
): SimulationSnapshot {
  if (transientResult && transientResult.times.length > 0) {
    const index = Math.max(0, Math.min(transientResult.times.length - 1, frame));
    const nodeVoltages = Object.fromEntries(
      Object.entries(transientResult.nodeVoltages).map(([node, values]) => [
        node,
        values[index] ?? 0,
      ]),
    );
    const elementCurrents = Object.fromEntries(
      Object.entries(transientResult.elementCurrents).map(([element, values]) => [
        element,
        values[index] ?? 0,
      ]),
    );
    return {
      nodeVoltages,
      elementCurrents,
      time: transientResult.times[index] ?? 0,
    };
  }

  if (dcResult) {
    return {
      nodeVoltages: dcResult.nodeVoltages,
      elementCurrents: dcResult.elementCurrents,
      time: 0,
    };
  }

  return { nodeVoltages: { '0': 0 }, elementCurrents: {}, time: 0 };
}
