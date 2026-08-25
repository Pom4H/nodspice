use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

fn default_ground() -> String {
    "0".to_owned()
}

fn default_max_iterations() -> usize {
    80
}

fn default_tolerance() -> f64 {
    1e-9
}

fn default_gmin() -> f64 {
    1e-12
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CircuitInput {
    #[serde(default = "default_ground")]
    pub ground: String,
    pub elements: Vec<Element>,
    #[serde(default)]
    pub options: SolveOptions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Element {
    Resistor {
        id: String,
        a: String,
        b: String,
        resistance: f64,
    },
    Capacitor {
        id: String,
        a: String,
        b: String,
        capacitance: f64,
    },
    VoltageSource {
        id: String,
        positive: String,
        negative: String,
        voltage: f64,
    },
    CurrentSource {
        id: String,
        from: String,
        to: String,
        current: f64,
    },
    Diode {
        id: String,
        anode: String,
        cathode: String,
        saturation_current: f64,
        ideality: f64,
    },
}

impl Element {
    pub fn id(&self) -> &str {
        match self {
            Self::Resistor { id, .. }
            | Self::Capacitor { id, .. }
            | Self::VoltageSource { id, .. }
            | Self::CurrentSource { id, .. }
            | Self::Diode { id, .. } => id,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveOptions {
    #[serde(default = "default_max_iterations")]
    pub max_iterations: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
    #[serde(default = "default_gmin")]
    pub gmin: f64,
}

impl Default for SolveOptions {
    fn default() -> Self {
        Self {
            max_iterations: default_max_iterations(),
            tolerance: default_tolerance(),
            gmin: default_gmin(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveResult {
    pub node_voltages: BTreeMap<String, f64>,
    pub element_currents: BTreeMap<String, f64>,
    pub iterations: usize,
    pub converged: bool,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransientResult {
    pub times: Vec<f64>,
    pub node_voltages: BTreeMap<String, Vec<f64>>,
    pub element_currents: BTreeMap<String, Vec<f64>>,
    pub converged: bool,
    pub max_iterations: usize,
    pub warnings: Vec<String>,
}
