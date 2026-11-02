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
pub fn set_settings(state: State<AppState>, settings: Settings) -> CmdResult<()> {
    state.settings()?.set(settings)
}

#[tauri::command]
pub fn get_session(state: State<AppState>) -> CmdResult<Session> {
    Ok(state.session()?.get())
}

#[tauri::command]
pub fn set_session(state: State<AppState>, session: Session) -> CmdResult<()> {
    state.session()?.set(session)
}
