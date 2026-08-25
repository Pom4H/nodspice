# nodspice architecture

## Product boundary

nodspice is a browser-first electrical design environment. The editor owns visual interaction and circuit topology; the Rust core owns numerical analysis. Neither layer silently re-implements the other.

```text
React application
  ├─ SVG editor and viewport
  ├─ serializable CircuitDocument
  ├─ graph → electrical nets compiler
  ├─ playback, probes and inspector
  └─ typed WASM boundary
          ↓
Rust nodspice-solver
  ├─ modified nodal analysis stamping
  ├─ dense pivoted linear solve
  ├─ Newton iteration for nonlinear devices
  └─ Backward-Euler transient integration
```

## Source layout

```text
crates/solver/       Rust numerical engine and wasm-bindgen exports
src/domain/          persistent circuit model, net compiler and examples
src/editor/          SVG canvas, symbols, router, viewport and panels
src/hooks/           React orchestration for solving and playback
src/solver/          lazy WebAssembly loader
scripts/             production static server
```

## Circuit document

`CircuitDocument` is the source of truth for editing and persistence. It contains positioned components, terminal-to-terminal wires and analysis settings. SVG paths and solver node numbers are derived and never persisted.

This separation is important:

- moving a component changes only its coordinates;
- a wire still references semantic terminal IDs;
- the orthogonal SVG path is regenerated from current port positions;
- electrical nets are rebuilt from wire connectivity;
- the solver receives a compact, coordinate-free netlist.

## Electrical topology compiler

The TypeScript compiler uses union-find over terminal keys such as `r1:a`. Every wire unions its two terminal sets. Connected sets become deterministic solver nodes (`n1`, `n2`, …); every ground component maps its set to node `0`.

Switches are intentionally compiled as resistors in the first milestone. A closed switch uses `onResistance`; an open switch uses `offResistance`. This keeps the numerical core small without creating a second switching semantics in the UI.

## SVG interaction model

The canvas follows these invariants:

1. Wires render below components.
2. Components expose explicit ports with a side/direction.
3. Routing starts with an outward port stub, then chooses an orthogonal L/Z/U route.
4. Collinear points are removed before generating the SVG path.
5. Corners use quadratic curves with a bounded radius.
6. A wide transparent path handles pointer targeting independently of the visible stroke.
7. Pointer coordinates are transformed with the SVG screen CTM, so drag remains correct under zoom and pan.
8. Wheel zoom uses a native non-passive listener and preserves the scene point under the cursor.
9. Component positions snap to the electrical grid; connectivity never depends on pixel overlap.

These rules are implemented as a standalone geometry layer. The electrical-domain model remains independent from SVG routing and interaction details.

## Live simulation

A document edit causes this pipeline:

```text
CircuitDocument change
  → compileCircuit()
  → SolverCircuitInput
  → WASM solve
  → node voltage and element current vectors
  → SVG colour/flow + inspector + waveform
```

The application does not require a modal Run command. Transient analysis still computes a finite interval, but playback loops over the resulting vector in the interface.

The WebAssembly module is loaded once and cached. React effects are cancellable so an obsolete result cannot overwrite a newer edit.

## Numerical ownership

Rust owns:

- validation of physical values;
- element stamping;
- MNA matrix construction;
- pivoted Gaussian elimination;
- nonlinear convergence;
- transient state history;
- current and voltage result generation.

TypeScript owns:

- editor document validation;
- visual graph connectivity;
- mapping components to solver element DTOs;
- display formatting and animation.

## Scope of the first engine

Supported:

- resistor;
- capacitor;
- independent voltage source;
- independent current source;
- Shockley diode;
- idealized switch via finite resistance;
- ground;
- DC operating point;
- Backward-Euler transient analysis.

Not yet supported:

- inductors and coupled inductors;
- MOSFET/BJT production models;
- controlled sources;
- AC small-signal and noise analysis;
- sparse matrices;
- adaptive timestep and LTE control;
- SPICE text/netlist compatibility;
- convergence aids beyond damping, voltage limiting and `gmin`.

The public solver interface is deliberately backend-shaped. A future ngspice-compatible or richer Rust engine can implement the same application contract without replacing the editor.

## Performance path

The MVP uses a dense matrix because it is easier to audit and is fast enough for small interactive schematics. The upgrade path is:

1. retain semantic topology and result contracts;
2. replace dense rows with sparse triplet stamping;
3. cache symbolic factorization while topology is unchanged;
4. move transient analysis to a dedicated Web Worker;
5. stream result chunks to the waveform and canvas;
6. add adaptive timestep and device-specific state.

## Security and persistence

Circuits are local JSON documents. Imported data is validated structurally before use. The renderer never injects imported SVG or HTML. Component labels render as React text nodes. No arbitrary SPICE expression parser is exposed in this milestone.
