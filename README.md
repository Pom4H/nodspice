# NodeSpice

A live, browser-native circuit editor and electrical simulator.

NodeSpice is designed as a live browser-native simulator rather than a desktop workflow copied into the browser. The circuit stays alive: components are dragged directly on an SVG canvas, wires reroute from ports, voltages are visible on the schematic, current moves along conductors, and transient traces loop without a modal **Run** workflow.

## Current MVP

- pure SVG schematic editor;
- orthogonal port-aware routing with rounded corners;
- drag, grid snap, zoom, pan, selection and direct terminal wiring;
- resistor, capacitor, voltage source, current source, diode, switch and ground;
- Rust/WebAssembly Modified Nodal Analysis engine;
- DC analysis;
- transient analysis with backward Euler capacitors;
- nonlinear diode solve with Newton–Raphson iteration;
- animated current flow and inline node voltages;
- oscilloscope view;
- editable engineering notation (`4.7k`, `100n`, `1MΩ`);
- local persistence and JSON import/export;
- bundled RC, diode-clamp and reserve-power examples.

## Stack

- **Rust** — numerical engine;
- **wasm-bindgen / wasm-pack** — WebAssembly boundary;
- **Bun 1.4** — package manager, dev server, tests and production bundler;
- **React 19** — application state and UI composition;
- **SVG** — schematic scene, wires, hit zones and oscilloscope;
- **CSS** — visual system and current animations.

No canvas drawing library and no graph editor dependency are used.

## Run locally

Requirements:

- Bun 1.4.x;
- stable Rust with the `wasm32-unknown-unknown` target.

```bash
bun install
bun run dev
```

Open the printed local URL. `bun run dev` compiles the Rust crate to WebAssembly first, then starts Bun's full-stack development server with HMR.

## Verify

```bash
bun test
cargo test --manifest-path crates/solver/Cargo.toml
bun run build
```

Or run the complete local gate:

```bash
bun run check
```

## Architecture

```text
CircuitDocument
  ├─ components + ports
  └─ ideal wires
          │
          ▼
TypeScript netlist compiler
  ├─ union-find electrical nodes
  ├─ diagnostics
  └─ SolverCircuitInput
          │
          ▼
Rust/WASM MNA engine
  ├─ conductance/current/source stamping
  ├─ Gaussian elimination with pivoting
  ├─ backward Euler transient companion model
  └─ Newton–Raphson diode linearization
          │
          ▼
voltage/current vectors
          │
          ▼
React + SVG live scene
```

The SVG scene and the electrical graph are separate models. Moving a component changes only geometry; wiring changes node topology; editing a value changes only element parameters. This boundary is essential for adding a production SPICE backend later without replacing the editor.

More detail: [`docs/architecture.md`](docs/architecture.md) and [`docs/solver.md`](docs/solver.md).

## Connection routing

The router follows a port-directed orthogonal routing model:

1. leave each terminal through a directional stub;
2. choose a straight, L, Z or U orthogonal route from the two port directions;
3. remove duplicate and collinear waypoints;
4. convert corners to quadratic SVG curves;
5. render a wide invisible hit path over the visible conductor;
6. recompute the route whenever either component moves.

NodeSpice keeps its implementation and tests in `src/editor/router.ts`.

## Solver scope

The present solver is intentionally small and auditable. It is suitable for interactive learning, architectural prototypes and the bundled examples. It is **not yet a drop-in replacement for mature production SPICE engines**. Missing production-SPICE work includes sparse matrices, robust source stepping, controlled sources, inductors, MOS/BJT model families, AC/noise analysis, model-card parsing and a compatibility test corpus.

The UI/graph boundary is designed so a future ngspice-compatible engine can implement the same solver adapter.

## License

MIT.
