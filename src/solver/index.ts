import type {
  SolveResult,
  SolverCircuitInput,
  TransientResult,
} from '../domain/types';

type WasmSolverModule = {
  default: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
  engine_version: () => string;
  solve_dc: (input: SolverCircuitInput) => SolveResult;
  simulate_transient: (
    input: SolverCircuitInput,
    timestep: number,
    steps: number,
  ) => TransientResult;
};

let modulePromise: Promise<WasmSolverModule> | null = null;

async function loadModule(): Promise<WasmSolverModule> {
  if (!modulePromise) {
    modulePromise = import('../wasm/pkg/nodspice_solver.js').then(async (module) => {
      const typed = module as unknown as WasmSolverModule;
      await typed.default();
      return typed;
    });
  }
  return modulePromise;
}

export async function solverVersion(): Promise<string> {
  return (await loadModule()).engine_version();
}

export async function solveDc(input: SolverCircuitInput): Promise<SolveResult> {
  return (await loadModule()).solve_dc(input);
}

export async function simulateTransient(
  input: SolverCircuitInput,
  timestep: number,
  steps: number,
): Promise<TransientResult> {
  return (await loadModule()).simulate_transient(input, timestep, steps);
}
