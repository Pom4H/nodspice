export type Point = { x: number; y: number };
export type PortDirection = 'left' | 'right' | 'top' | 'bottom';

export type ComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'voltageSource'
  | 'currentSource'
  | 'diode'
  | 'switch'
  | 'ground';

type ComponentBase<K extends ComponentKind, P> = {
  id: string;
  kind: K;
  label: string;
  x: number;
  y: number;
  properties: P;
};

export type ResistorComponent = ComponentBase<'resistor', { resistance: number }>;
export type CapacitorComponent = ComponentBase<'capacitor', { capacitance: number }>;
export type VoltageSourceComponent = ComponentBase<'voltageSource', { voltage: number }>;
export type CurrentSourceComponent = ComponentBase<'currentSource', { current: number }>;
export type DiodeComponent = ComponentBase<
  'diode',
  { saturationCurrent: number; ideality: number }
>;
export type SwitchComponent = ComponentBase<
  'switch',
  { closed: boolean; onResistance: number; offResistance: number }
>;
export type GroundComponent = ComponentBase<'ground', Record<string, never>>;

export type CircuitComponent =
  | ResistorComponent
  | CapacitorComponent
  | VoltageSourceComponent
  | CurrentSourceComponent
  | DiodeComponent
  | SwitchComponent
  | GroundComponent;

export type PortSpec = {
  id: string;
  x: number;
  y: number;
  direction: PortDirection;
  polarity?: 'positive' | 'negative';
};

export type TerminalRef = {
  componentId: string;
  portId: string;
};

export type Wire = {
  id: string;
  from: TerminalRef;
  to: TerminalRef;
};

export type AnalysisSettings =
  | { mode: 'dc' }
  | { mode: 'transient'; duration: number; timestep: number };

export type CircuitDocument = {
  version: 1;
  name: string;
  components: CircuitComponent[];
  wires: Wire[];
  analysis: AnalysisSettings;
};

export type SelectedItem =
  | { type: 'component'; id: string }
  | { type: 'wire'; id: string }
  | null;

export type SolverElement =
  | { type: 'resistor'; id: string; a: string; b: string; resistance: number }
  | { type: 'capacitor'; id: string; a: string; b: string; capacitance: number }
  | {
      type: 'voltageSource';
      id: string;
      positive: string;
      negative: string;
      voltage: number;
    }
  | { type: 'currentSource'; id: string; from: string; to: string; current: number }
  | {
      type: 'diode';
      id: string;
      anode: string;
      cathode: string;
      saturationCurrent: number;
      ideality: number;
    };

export type SolverCircuitInput = {
  ground: '0';
  elements: SolverElement[];
  options?: {
    maxIterations?: number;
    tolerance?: number;
    gmin?: number;
  };
};

export type SolveResult = {
  nodeVoltages: Record<string, number>;
  elementCurrents: Record<string, number>;
  iterations: number;
  converged: boolean;
  warnings: string[];
};

export type TransientResult = {
  times: number[];
  nodeVoltages: Record<string, number[]>;
  elementCurrents: Record<string, number[]>;
  converged: boolean;
  maxIterations: number;
  warnings: string[];
};

export type SimulationSnapshot = {
  nodeVoltages: Record<string, number>;
  elementCurrents: Record<string, number>;
  time: number;
};
