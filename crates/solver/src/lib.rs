mod model;
mod solver;

pub use model::{CircuitInput, Element, SolveOptions, SolveResult, TransientResult};
pub use solver::{
    SolverError, simulate_transient as simulate_transient_native, solve_dc as solve_dc_native,
};
use wasm_bindgen::prelude::*;

fn serialize<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value
        .serialize(&serializer)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[wasm_bindgen]
pub fn solve_dc(input: JsValue) -> Result<JsValue, JsValue> {
    let input: CircuitInput = serde_wasm_bindgen::from_value(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = solver::solve_dc(&input).map_err(|error| JsValue::from_str(&error.to_string()))?;
    serialize(&result)
}

#[wasm_bindgen]
pub fn simulate_transient(input: JsValue, timestep: f64, steps: usize) -> Result<JsValue, JsValue> {
    let input: CircuitInput = serde_wasm_bindgen::from_value(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = solver::simulate_transient(&input, timestep, steps)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serialize(&result)
}
