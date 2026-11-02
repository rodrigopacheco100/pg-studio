//! Reading and writing user-chosen text files (SQL scripts). The paths come from the native dialogs.

use std::path::PathBuf;

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub async fn read_text_file(path: PathBuf) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display())))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_text_file(path: PathBuf, content: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display())))
        .await
        .map_err(|e| e.to_string())?
}
