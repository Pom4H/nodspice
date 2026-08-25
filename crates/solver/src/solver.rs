use crate::model::{CircuitInput, Element, SolveResult, TransientResult};
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;

const THERMAL_VOLTAGE: f64 = 0.025_852;
const DIODE_VOLTAGE_LIMIT: f64 = 0.8;

#[derive(Debug, Error)]
pub enum SolverError {
    #[error("{0} must be finite and positive")]
    InvalidValue(String),
    #[error("timestep must be finite and positive")]
    InvalidTimestep,
    #[error("steps must be greater than zero")]
    InvalidSteps,
    #[error("singular or ill-conditioned matrix near column {0}")]
    SingularMatrix(usize),
}

struct Topology {
    nodes: Vec<String>,
    node_index: BTreeMap<String, usize>,
    voltage_sources: Vec<usize>,
}

struct LinearSystem {
    matrix: Vec<Vec<f64>>,
    rhs: Vec<f64>,
}

impl LinearSystem {
    fn new(size: usize) -> Self {
        Self {
            matrix: vec![vec![0.0; size]; size],
            rhs: vec![0.0; size],
        }
    }

    fn stamp_conductance(&mut self, a: Option<usize>, b: Option<usize>, conductance: f64) {
        if let Some(a) = a {
            self.matrix[a][a] += conductance;
        }
        if let Some(b) = b {
            self.matrix[b][b] += conductance;
        }
        if let (Some(a), Some(b)) = (a, b) {
            self.matrix[a][b] -= conductance;
            self.matrix[b][a] -= conductance;
        }
    }

    fn stamp_current_source(&mut self, from: Option<usize>, to: Option<usize>, current: f64) {
        if let Some(from) = from {
            self.rhs[from] -= current;
        }
        if let Some(to) = to {
            self.rhs[to] += current;
        }
    }
}

struct StepResult {
    voltages: BTreeMap<String, f64>,
    currents: BTreeMap<String, f64>,
    iterations: usize,
    converged: bool,
}

pub fn solve_dc(input: &CircuitInput) -> Result<SolveResult, SolverError> {
    validate(input)?;
    let topology = topology(input);
    let mut guess = vec![0.0; topology.nodes.len() + topology.voltage_sources.len()];
    let step = solve_step(input, &topology, &mut guess, None, None)?;
    let mut warnings = Vec::new();
    if !step.converged {
        warnings.push(format!(
            "Newton iteration reached the configured {} iteration limit",
            input.options.max_iterations
        ));
    }
    Ok(SolveResult {
        node_voltages: step.voltages,
        element_currents: step.currents,
        iterations: step.iterations,
        converged: step.converged,
        warnings,
    })
}

pub fn simulate_transient(
    input: &CircuitInput,
    timestep: f64,
    steps: usize,
) -> Result<TransientResult, SolverError> {
    validate(input)?;
    if !timestep.is_finite() || timestep <= 0.0 {
        return Err(SolverError::InvalidTimestep);
    }
    if steps == 0 {
        return Err(SolverError::InvalidSteps);
    }

    let topology = topology(input);
    let size = topology.nodes.len() + topology.voltage_sources.len();
    let mut guess = vec![0.0; size];
    let mut capacitor_voltages = BTreeMap::<String, f64>::new();
    let mut times = Vec::with_capacity(steps + 1);
    let mut node_voltages = topology
        .nodes
        .iter()
        .map(|node| (node.clone(), Vec::with_capacity(steps + 1)))
        .collect::<BTreeMap<_, _>>();
    node_voltages.insert(input.ground.clone(), vec![0.0; steps + 1]);
    let mut element_currents = input
        .elements
        .iter()
        .map(|element| (element.id().to_owned(), Vec::with_capacity(steps + 1)))
        .collect::<BTreeMap<_, _>>();
    let mut all_converged = true;
    let mut max_iterations = 0;

    for step_index in 0..=steps {
        let time = step_index as f64 * timestep;
        let result = solve_step(
            input,
            &topology,
            &mut guess,
            Some(timestep),
            Some(&capacitor_voltages),
        )?;
        all_converged &= result.converged;
        max_iterations = max_iterations.max(result.iterations);
        times.push(time);

        for (node, series) in &mut node_voltages {
            if node == &input.ground {
                continue;
            }
            series.push(*result.voltages.get(node).unwrap_or(&0.0));
        }
        for (element, series) in &mut element_currents {
            series.push(*result.currents.get(element).unwrap_or(&0.0));
        }

        for element in &input.elements {
            if let Element::Capacitor { id, a, b, .. } = element {
                capacitor_voltages.insert(id.clone(), voltage_between(&result.voltages, a, b));
            }
        }
    }

    let warnings = if all_converged {
        Vec::new()
    } else {
        vec!["At least one transient point did not converge".to_owned()]
    };

    Ok(TransientResult {
        times,
        node_voltages,
        element_currents,
        converged: all_converged,
        max_iterations,
        warnings,
    })
}

#[allow(clippy::too_many_arguments)]
fn stamp_system(
    input: &CircuitInput,
    topology: &Topology,
    estimate: &[f64],
    timestep: Option<f64>,
    capacitor_voltages: Option<&BTreeMap<String, f64>>,
) -> LinearSystem {
    let size = topology.nodes.len() + topology.voltage_sources.len();
    let mut system = LinearSystem::new(size);

    for index in 0..topology.nodes.len() {
        system.matrix[index][index] += input.options.gmin;
    }

    let mut source_offset = 0;
    for element in &input.elements {
        match element {
            Element::Resistor {
                a, b, resistance, ..
            } => {
                system.stamp_conductance(
                    node_index(topology, input, a),
                    node_index(topology, input, b),
                    1.0 / resistance,
                );
            }
            Element::Capacitor {
                id,
                a,
                b,
                capacitance,
            } => {
                if let Some(timestep) = timestep {
                    let conductance = capacitance / timestep;
                    let previous = capacitor_voltages
                        .and_then(|values| values.get(id))
                        .copied()
                        .unwrap_or(0.0);
                    let a_index = node_index(topology, input, a);
                    let b_index = node_index(topology, input, b);
                    system.stamp_conductance(a_index, b_index, conductance);
                    system.stamp_current_source(b_index, a_index, conductance * previous);
                }
            }
            Element::CurrentSource {
                from, to, current, ..
            } => system.stamp_current_source(
                node_index(topology, input, from),
                node_index(topology, input, to),
                *current,
            ),
            Element::VoltageSource {
                positive,
                negative,
                voltage,
                ..
            } => {
                let branch = topology.nodes.len() + source_offset;
                source_offset += 1;
                if let Some(positive) = node_index(topology, input, positive) {
                    system.matrix[positive][branch] += 1.0;
                    system.matrix[branch][positive] += 1.0;
                }
                if let Some(negative) = node_index(topology, input, negative) {
                    system.matrix[negative][branch] -= 1.0;
                    system.matrix[branch][negative] -= 1.0;
                }
                system.rhs[branch] += voltage;
            }
            Element::Diode {
                anode,
                cathode,
                saturation_current,
                ideality,
                ..
            } => {
                let anode_index = node_index(topology, input, anode);
                let cathode_index = node_index(topology, input, cathode);
                let raw_voltage =
                    estimate_value(estimate, anode_index) - estimate_value(estimate, cathode_index);
                let voltage = raw_voltage.clamp(-DIODE_VOLTAGE_LIMIT, DIODE_VOLTAGE_LIMIT);
                let thermal = ideality * THERMAL_VOLTAGE;
                let exponential = (voltage / thermal).exp();
                let conductance =
                    (saturation_current * exponential / thermal).max(input.options.gmin);
                let current = saturation_current * (exponential - 1.0);
                let equivalent_current = current - conductance * voltage;
                system.stamp_conductance(anode_index, cathode_index, conductance);
                system.stamp_current_source(anode_index, cathode_index, equivalent_current);
            }
        }
    }
    system
}

fn solve_step(
    input: &CircuitInput,
    topology: &Topology,
    guess: &mut [f64],
    timestep: Option<f64>,
    capacitor_voltages: Option<&BTreeMap<String, f64>>,
) -> Result<StepResult, SolverError> {
    let nonlinear = input
        .elements
        .iter()
        .any(|element| matches!(element, Element::Diode { .. }));
    let iterations = if nonlinear {
        input.options.max_iterations.max(1)
    } else {
        1
    };
    let mut converged = !nonlinear;
    let mut used_iterations = 0;

    for iteration in 1..=iterations {
        used_iterations = iteration;
        let system = stamp_system(input, topology, guess, timestep, capacitor_voltages);
        let solved = gaussian_solve(system.matrix, system.rhs)?;
        let difference = solved
            .iter()
            .zip(guess.iter())
            .map(|(next, previous)| (next - previous).abs())
            .fold(0.0, f64::max);
        let damping = if nonlinear && iteration < 12 {
            0.72
        } else {
            1.0
        };
        for (previous, next) in guess.iter_mut().zip(solved) {
            *previous += (next - *previous) * damping;
        }
        if !nonlinear || difference <= input.options.tolerance {
            converged = true;
            break;
        }
    }

    let voltages = voltage_map(input, topology, guess);
    let currents = current_map(
        input,
        topology,
        guess,
        &voltages,
        timestep,
        capacitor_voltages,
    );
    Ok(StepResult {
        voltages,
        currents,
        iterations: used_iterations,
        converged,
    })
}

fn topology(input: &CircuitInput) -> Topology {
    let mut nodes = BTreeSet::new();
    let mut voltage_sources = Vec::new();
    for (index, element) in input.elements.iter().enumerate() {
        match element {
            Element::Resistor { a, b, .. } | Element::Capacitor { a, b, .. } => {
                insert_node(&mut nodes, &input.ground, a);
                insert_node(&mut nodes, &input.ground, b);
            }
            Element::VoltageSource {
                positive, negative, ..
            } => {
                insert_node(&mut nodes, &input.ground, positive);
                insert_node(&mut nodes, &input.ground, negative);
                voltage_sources.push(index);
            }
            Element::CurrentSource { from, to, .. } => {
                insert_node(&mut nodes, &input.ground, from);
                insert_node(&mut nodes, &input.ground, to);
            }
            Element::Diode { anode, cathode, .. } => {
                insert_node(&mut nodes, &input.ground, anode);
                insert_node(&mut nodes, &input.ground, cathode);
            }
        }
    }
    let nodes = nodes.into_iter().collect::<Vec<_>>();
    let node_index = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.clone(), index))
        .collect();
    Topology {
        nodes,
        node_index,
        voltage_sources,
    }
}

fn insert_node(nodes: &mut BTreeSet<String>, ground: &str, node: &str) {
    if node != ground {
        nodes.insert(node.to_owned());
    }
}

fn node_index(topology: &Topology, input: &CircuitInput, node: &str) -> Option<usize> {
    if node == input.ground {
        None
    } else {
        topology.node_index.get(node).copied()
    }
}

fn estimate_value(estimate: &[f64], index: Option<usize>) -> f64 {
    index
        .and_then(|index| estimate.get(index))
        .copied()
        .unwrap_or(0.0)
}

fn voltage_map(
    input: &CircuitInput,
    topology: &Topology,
    solution: &[f64],
) -> BTreeMap<String, f64> {
    let mut voltages = BTreeMap::from([(input.ground.clone(), 0.0)]);
    for (node, index) in &topology.node_index {
        voltages.insert(node.clone(), solution[*index]);
    }
    voltages
}

fn current_map(
    input: &CircuitInput,
    topology: &Topology,
    solution: &[f64],
    voltages: &BTreeMap<String, f64>,
    timestep: Option<f64>,
    capacitor_voltages: Option<&BTreeMap<String, f64>>,
) -> BTreeMap<String, f64> {
    let mut currents = BTreeMap::new();
    let mut source_offset = 0;
    for element in &input.elements {
        let current = match element {
            Element::Resistor {
                a, b, resistance, ..
            } => voltage_between(voltages, a, b) / resistance,
            Element::Capacitor {
                id,
                a,
                b,
                capacitance,
            } => timestep
                .map(|timestep| {
                    let previous = capacitor_voltages
                        .and_then(|values| values.get(id))
                        .copied()
                        .unwrap_or(0.0);
                    capacitance * (voltage_between(voltages, a, b) - previous) / timestep
                })
                .unwrap_or(0.0),
            Element::VoltageSource { .. } => {
                let index = topology.nodes.len() + source_offset;
                source_offset += 1;
                solution[index]
            }
            Element::CurrentSource { current, .. } => *current,
            Element::Diode {
                anode,
                cathode,
                saturation_current,
                ideality,
                ..
            } => {
                let voltage = voltage_between(voltages, anode, cathode)
                    .clamp(-DIODE_VOLTAGE_LIMIT, DIODE_VOLTAGE_LIMIT);
                saturation_current * ((voltage / (ideality * THERMAL_VOLTAGE)).exp() - 1.0)
            }
        };
        currents.insert(element.id().to_owned(), current);
    }
    currents
}

fn voltage_between(voltages: &BTreeMap<String, f64>, a: &str, b: &str) -> f64 {
    voltages.get(a).copied().unwrap_or(0.0) - voltages.get(b).copied().unwrap_or(0.0)
}

fn validate(input: &CircuitInput) -> Result<(), SolverError> {
    for element in &input.elements {
        match element {
            Element::Resistor { id, resistance, .. }
                if !resistance.is_finite() || *resistance <= 0.0 =>
            {
                return Err(SolverError::InvalidValue(format!("resistance for {id}")));
            }
            Element::Capacitor {
                id, capacitance, ..
            } if !capacitance.is_finite() || *capacitance <= 0.0 => {
                return Err(SolverError::InvalidValue(format!("capacitance for {id}")));
            }
            Element::Diode {
                id,
                saturation_current,
                ideality,
                ..
            } if !saturation_current.is_finite()
                || *saturation_current <= 0.0
                || !ideality.is_finite()
                || *ideality <= 0.0 =>
            {
                return Err(SolverError::InvalidValue(format!("diode model for {id}")));
            }
            _ => {}
        }
    }
    Ok(())
}

fn gaussian_solve(mut matrix: Vec<Vec<f64>>, mut rhs: Vec<f64>) -> Result<Vec<f64>, SolverError> {
    let size = rhs.len();
    for column in 0..size {
        let pivot = (column..size)
            .max_by(|left, right| {
                matrix[*left][column]
                    .abs()
                    .total_cmp(&matrix[*right][column].abs())
            })
            .unwrap_or(column);
        if matrix[pivot][column].abs() < 1e-18 {
            return Err(SolverError::SingularMatrix(column));
        }
        if pivot != column {
            matrix.swap(pivot, column);
            rhs.swap(pivot, column);
        }
        let divisor = matrix[column][column];
        for value in &mut matrix[column][column..] {
            *value /= divisor;
        }
        rhs[column] /= divisor;
        let pivot_row = matrix[column].clone();
        for row in 0..size {
            if row == column {
                continue;
            }
            let factor = matrix[row][column];
            if factor.abs() < 1e-24 {
                continue;
            }
            for (value, pivot_value) in matrix[row][column..]
                .iter_mut()
                .zip(&pivot_row[column..])
            {
                *value -= factor * *pivot_value;
            }
            rhs[row] -= factor * rhs[column];
        }
    }
    Ok(rhs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::SolveOptions;
    use approx::assert_abs_diff_eq;

    fn input(elements: Vec<Element>) -> CircuitInput {
        CircuitInput {
            ground: "0".to_owned(),
            elements,
            options: SolveOptions::default(),
        }
    }

    #[test]
    fn solves_a_twelve_volt_divider() {
        let circuit = input(vec![
            Element::VoltageSource {
                id: "v1".into(),
                positive: "vin".into(),
                negative: "0".into(),
                voltage: 12.0,
            },
            Element::Resistor {
                id: "r1".into(),
                a: "vin".into(),
                b: "out".into(),
                resistance: 1_000.0,
            },
            Element::Resistor {
                id: "r2".into(),
                a: "out".into(),
                b: "0".into(),
                resistance: 1_000.0,
            },
        ]);
        let result = solve_dc(&circuit).unwrap();
        assert_abs_diff_eq!(result.node_voltages["out"], 6.0, epsilon = 1e-7);
    }

    #[test]
    fn charges_an_rc_node_to_one_time_constant() {
        let circuit = input(vec![
            Element::VoltageSource {
                id: "v1".into(),
                positive: "vin".into(),
                negative: "0".into(),
                voltage: 10.0,
            },
            Element::Resistor {
                id: "r1".into(),
                a: "vin".into(),
                b: "out".into(),
                resistance: 1_000.0,
            },
            Element::Capacitor {
                id: "c1".into(),
                a: "out".into(),
                b: "0".into(),
                capacitance: 100e-6,
            },
        ]);
        let result = simulate_transient(&circuit, 0.001, 100).unwrap();
        let final_voltage = *result.node_voltages["out"].last().unwrap();
        assert_abs_diff_eq!(final_voltage, 6.34, epsilon = 0.12);
    }

    #[test]
    fn converges_a_diode_clamp() {
        let circuit = input(vec![
            Element::VoltageSource {
                id: "v1".into(),
                positive: "vin".into(),
                negative: "0".into(),
                voltage: 5.0,
            },
            Element::Resistor {
                id: "r1".into(),
                a: "vin".into(),
                b: "out".into(),
                resistance: 1_000.0,
            },
            Element::Diode {
                id: "d1".into(),
                anode: "out".into(),
                cathode: "0".into(),
                saturation_current: 1e-12,
                ideality: 1.0,
            },
        ]);
        let result = solve_dc(&circuit).unwrap();
        assert!(result.converged);
        assert!(result.node_voltages["out"] > 0.45);
        assert!(result.node_voltages["out"] < 0.9);
    }
}
