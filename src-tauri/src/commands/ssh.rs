//! SSH servers whose host keys were trusted on first use.

use super::CmdResult;
use crate::known_hosts::KnownHost;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_known_hosts(state: State<AppState>) -> CmdResult<Vec<KnownHost>> {
    state.known_hosts.list()
}

#[tauri::command]
pub fn forget_known_host(state: State<AppState>, server: String) -> CmdResult<()> {
    state.known_hosts.forget(&server)
}
