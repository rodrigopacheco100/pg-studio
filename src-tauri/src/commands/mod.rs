//! Tauri commands, grouped by what they act on. They only translate between the frontend and
//! `AppState` / `storage` / `pg`; each one is registered in `lib.rs` and wrapped in `src/api.ts`.

pub mod connections;
pub mod files;
pub mod folders;
pub mod history;
pub mod preferences;
pub mod queries;
pub mod ssh;
pub mod vault;

pub use crate::state::CmdResult;
