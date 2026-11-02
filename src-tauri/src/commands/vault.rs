//! The place where connection passwords are kept: system keychain or master-password vault.

use super::CmdResult;
use crate::secrets::Status;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn vault_status(state: State<'_, AppState>) -> CmdResult<Status> {
    // The first call probes the keychain, which may block on the session bus.
    let secrets = state.secrets.clone();
    tauri::async_runtime::spawn_blocking(move || secrets.status())
        .await
        .map_err(|e| e.to_string())
}

/// Creates (first use) or unlocks the vault, then moves any password still left in SQLite into it.
#[tauri::command]
pub fn vault_open(state: State<AppState>, password: String, create: bool) -> CmdResult<()> {
    if create { state.secrets.create(&password)? } else { state.secrets.unlock(&password)? }
    state.migrate_passwords()
}
