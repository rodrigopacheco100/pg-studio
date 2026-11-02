//! Imported themes (see `persist::themes`).

use super::CmdResult;
use crate::persist::themes::StoredTheme;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_themes(state: State<AppState>) -> Vec<StoredTheme> {
    state.themes.list()
}

#[tauri::command]
pub fn save_theme(state: State<AppState>, id: String, content: String) -> CmdResult<()> {
    state.themes.save(&id, &content)
}

#[tauri::command]
pub fn delete_theme(state: State<AppState>, id: String) -> CmdResult<()> {
    state.themes.delete(&id)
}
