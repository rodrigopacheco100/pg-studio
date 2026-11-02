//! Program settings and the session to restore (see `persist`).

use super::CmdResult;
use crate::persist::{session::Session, settings::Settings};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> CmdResult<Settings> {
    Ok(state.settings()?.get())
}

#[tauri::command]
pub async fn set_settings(state: State<'_, AppState>, settings: Settings) -> CmdResult<()> {
    let timeout_changed = {
        let mut store = state.settings()?;
        let changed = store.get().statement_timeout_seconds != settings.statement_timeout_seconds;
        store.set(settings)?;
        changed
    };
    if timeout_changed {
        // Best effort: the setting is saved either way, and new sessions pick it up.
        let _ = state.apply_statement_timeout().await;
    }
    Ok(())
}

#[tauri::command]
pub fn get_session(state: State<AppState>) -> CmdResult<Session> {
    Ok(state.session()?.get())
}

#[tauri::command]
pub fn set_session(state: State<AppState>, session: Session) -> CmdResult<()> {
    state.session()?.set(session)
}
