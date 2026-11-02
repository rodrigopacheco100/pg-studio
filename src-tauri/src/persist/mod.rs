//! Values persisted as JSON files in the app data directory: program settings and work in progress.

mod json_store;
pub mod session;
pub mod settings;

pub use json_store::JsonStore;
