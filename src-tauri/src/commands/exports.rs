//! File exports: starting one in the background, cancelling it, and their history.

use super::CmdResult;
use crate::export::ExportRequest;
use crate::state::AppState;
use crate::storage::{exports, exports::ExportEntry};
use tauri::State;

/// Starts an export and returns its id at once; follow it with `list_exports`.
#[tauri::command]
pub fn start_export(state: State<AppState>, request: ExportRequest) -> CmdResult<i64> {
    let id = state.store(|db| exports::start(db, &request.label(), request.format.name(), &request.path))?;
    state.start_export(id, request);
    Ok(id)
}

#[tauri::command]
pub async fn cancel_export(state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    state.cancel_export(id).await;
    Ok(())
}

#[tauri::command]
pub fn list_exports(state: State<AppState>) -> CmdResult<Vec<ExportEntry>> {
    state.store(exports::list)
}

#[tauri::command]
pub fn clear_exports(state: State<AppState>) -> CmdResult<()> {
    state.store(exports::clear_finished)
}
