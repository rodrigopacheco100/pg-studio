//! Query history and saved queries.

use super::CmdResult;
use crate::state::AppState;
use crate::storage::{history, history::HistoryEntry, saved_queries, saved_queries::SavedQuery};
use tauri::State;

#[tauri::command]
pub fn list_history(state: State<AppState>) -> CmdResult<Vec<HistoryEntry>> {
    state.store(history::list)
}

#[tauri::command]
pub fn clear_history(state: State<AppState>) -> CmdResult<()> {
    state.store(history::clear)
}

#[tauri::command]
pub fn list_saved_queries(state: State<AppState>) -> CmdResult<Vec<SavedQuery>> {
    state.store(saved_queries::list)
}

#[tauri::command]
pub fn save_query(state: State<AppState>, query: SavedQuery) -> CmdResult<()> {
    state.store(|db| saved_queries::save(db, &query))
}

#[tauri::command]
pub fn delete_saved_query(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.store(|db| saved_queries::delete(db, id))
}
