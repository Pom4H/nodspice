# Rust solver notes

## Modified nodal analysis

For a circuit with `n` non-ground nodes and `m` independent voltage sources, nodspice solves an `(n + m) × (n + m)` linear system:

```text
A · x = z
```

`x` contains node voltages followed by voltage-source branch currents. Components add local coefficients to `A` and `z` through stamping.

## Linear devices

### Resistor

For conductance `g = 1 / R` between nodes `a` and `b`:

```text
A[a,a] += g
A[b,b] += g
A[a,b] -= g
A[b,a] -= g
```

Ground is not represented as an unknown, so rows or columns for node `0` are omitted.

### Current source

A positive source current from `a` to `b` contributes:

```text
z[a] -= I
z[b] += I
```

### Voltage source

An independent voltage source adds one branch-current unknown. Its branch row enforces `V(positive) - V(negative) = value`; symmetric column entries inject the branch current into node KCL equations.

## Capacitor transient companion

The first transient integrator is Backward Euler. At timestep `Δt`, a capacitor becomes a conductance plus a history source:

```text
g = C / Δt
Ihistory = g · Vprevious
```

Backward Euler is numerically dissipative, but it is robust and predictable for an initial browser engine. The solver stores the voltage of each capacitor after every converged point.

### Initial point

The result at `t = 0` is solved separately before the first integration step. With no explicit initial-condition property yet, every capacitor starts at `0 V` and is represented by a near-ideal short for this one operating point. The solver then advances exactly `steps` intervals, so a request for `steps = 100` returns 101 samples from `0` through `100 · Δt`.

This removes the former one-step time shift where the first integrated state was incorrectly labelled as `t = 0`.

## Diode model

The diode uses the Shockley equation:

```text
I = Is · (exp(Vd / (n · Vt)) - 1)
```

At each Newton iteration the curve is linearized around the current voltage estimate:

```text
g = dI/dV
Ieq = I - g · Vd
```

The linear companion is stamped as conductance `g` and current source `Ieq`. Early iterations are damped, and the voltage used in the exponential is bounded to prevent numerical overflow.

This is an educational silicon-diode model, not a complete production diode implementation. Junction capacitance, breakdown, series resistance, temperature curves and model cards are not yet present.

## Matrix solve

The MVP performs dense Gauss-Jordan elimination with partial pivoting. It rejects pivots below a small threshold as singular or ill-conditioned.

Why dense first:

- the code is compact and auditable;
- browser examples have only a few nodes;
- element stamping and API design can stabilize before sparse storage is introduced;
- unit tests can compare straightforward results.

For larger schematics this is `O(N³)` and must be replaced by sparse LU-class methods.

## `gmin`

A tiny conductance from each node to ground stabilizes otherwise floating nodes. The default is `1e-12 S`. This can make a topologically incomplete circuit numerically solvable, so the editor separately reports the absence of a ground symbol as a diagnostic.

## WebAssembly interface

`crates/solver/src/lib.rs` exports:

```text
engine_version() -> string
solve_dc(CircuitInput) -> SolveResult
simulate_transient(CircuitInput, timestep, steps) -> TransientResult
```

`serde-wasm-bindgen` transports structured JavaScript values without a JSON text round trip. The result maps become normal JavaScript objects.

## Result direction conventions

- resistor and capacitor current: terminal `a` → terminal `b`;
- voltage-source current: positive terminal → negative terminal according to the MNA branch variable;
- current source: declared `from` → `to`;
- diode current: anode → cathode.

The editor converts those terminal currents into signed ideal-wire flows. For each connected conductor graph it builds a deterministic spanning tree and accumulates Kirchhoff current balance from leaves to the root. Currents on redundant ideal-wire chords are displayed as zero because loop current through zero-impedance parallel paths is not uniquely defined.

## Tests

Rust unit tests verify:

- a 12 V, equal-resistance divider produces 6 V;
- an RC transient begins at a true `t = 0` initial state;
- the first and final Backward-Euler samples match the analytical recurrence;
- a resistor-fed silicon diode converges to a plausible clamp voltage.

TypeScript/Bun tests verify:

- engineering notation parsing and formatting;
- graph connectivity compilation;
- switch-to-resistor compilation;
- signed branch-current reconstruction;
- current metrics over one frame and a complete transient;
- waveform scaling around zero and narrow ripple ranges;
- orthogonal route geometry and rounded path generation.

## Next numerical milestones

1. source waveforms and explicit capacitor initial conditions;
2. inductor MNA state;
3. adaptive timestep with local truncation error;
4. sparse matrix storage and cached symbolic topology;
5. controlled sources;
6. BJT/MOSFET compact models;
7. AC operating-point linearization;
8. text netlist import and model libraries.
