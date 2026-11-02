//! Folders that group saved connections.

use super::CmdResult;
use crate::state::AppState;
use crate::storage::folders::{self, Folder};
use tauri::State;

#[tauri::command]
pub fn list_folders(state: State<AppState>) -> CmdResult<Vec<Folder>> {
    state.store(folders::list)
}

#[tauri::command]
pub fn create_folder(state: State<AppState>, name: String) -> CmdResult<i64> {
    state.store(|db| folders::create(db, &name))
}

#[tauri::command]
pub fn rename_folder(state: State<AppState>, id: i64, name: String) -> CmdResult<()> {
    state.store(|db| folders::rename(db, id, &name))
}

#[tauri::command]
pub fn delete_folder(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.store(|db| folders::delete(db, id))
}

#[tauri::command]
pub fn reorder_folders(state: State<AppState>, ids: Vec<i64>) -> CmdResult<()> {
    state.store(|db| folders::reorder(db, &ids))
}
