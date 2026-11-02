//! Saved connections, and connecting to a database.

use super::CmdResult;
use crate::pg::{self, TableInfo};
use crate::state::AppState;
use crate::storage::connections::{self, ConnectionConfig, Placement};
use tauri::State;

#[tauri::command]
pub fn list_connections(state: State<AppState>) -> CmdResult<Vec<ConnectionConfig>> {
    state.store(connections::list)
}

#[tauri::command]
pub fn save_connection(state: State<AppState>, config: ConnectionConfig) -> CmdResult<i64> {
    state.store(|db| connections::save(db, &state.secrets, &config))
}

#[tauri::command]
pub fn delete_connection(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.store(|db| connections::delete(db, &state.secrets, id))
}

#[tauri::command]
pub fn reorder_connections(state: State<AppState>, items: Vec<Placement>) -> CmdResult<()> {
    state.store(|db| connections::reorder(db, &items))
}

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>, mut config: ConnectionConfig) -> CmdResult<()> {
    // Editing a saved connection with secrets left blank: test with the stored ones.
    if let (Some(id), true) = (config.id, config.save_password) {
        if let Ok(stored) = state.saved_connection(id) {
            if config.password.is_empty() {
                config.password = stored.password;
            }
            if config.ssh_secret.is_empty() {
                config.ssh_secret = stored.ssh_secret;
            }
        }
    }
    let (_tunnel, config) = state.route(&config).await?;
    pg::open(&config).await.map(drop)
}

/// `password` / `ssh_secret` are the ones typed by the user for connections that do not save them.
#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    id: i64,
    password: Option<String>,
    ssh_secret: Option<String>,
) -> CmdResult<Vec<TableInfo>> {
    let mut config = state.saved_connection(id)?;
    if let Some(password) = password {
        config.password = password;
    }
    if let Some(secret) = ssh_secret {
        config.ssh_secret = secret;
    }
    state.connect(config).await
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>) -> CmdResult<()> {
    state.disconnect().await;
    Ok(())
}
