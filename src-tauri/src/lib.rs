mod commands;
mod known_hosts;
mod pg;
mod persist;
mod secrets;
mod state;
mod storage;
mod tunnel;

use commands::{connections, files, folders, history, preferences, queries, ssh, themes, vault};
use state::AppState;
use std::path::PathBuf;
use tauri::{Builder, Emitter, Manager, Runtime};

/// Adds the app's state and commands to `builder`. The data directory is the platform's app data
/// directory unless `data_dir` is given (the end-to-end test server uses a throwaway one).
pub fn configure<R: Runtime>(builder: Builder<R>, data_dir: Option<PathBuf>) -> Builder<R> {
    builder
        .setup(move |app| {
            let dir = match data_dir {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let handle = app.handle().clone();
            let notify = Box::new({
                let handle = handle.clone();
                move |event: &str| {
                    let _ = handle.emit(event, ());
                }
            });
            app.manage(AppState::open(notify, &dir)?);
            AppState::watch_vault_idle(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connections::list_connections,
            connections::save_connection,
            connections::delete_connection,
            connections::reorder_connections,
            connections::test_connection,
            connections::connect,
            connections::disconnect,
            folders::list_folders,
            folders::create_folder,
            folders::rename_folder,
            folders::delete_folder,
            folders::reorder_folders,
            themes::list_themes,
            themes::save_theme,
            themes::delete_theme,
            ssh::list_known_hosts,
            ssh::forget_known_host,
            vault::vault_status,
            vault::vault_open,
            queries::refresh_tables,
            queries::run_query,
            queries::cancel_query,
            queries::table_data,
            queries::table_count,
            queries::table_details,
            queries::table_item,
            history::list_history,
            history::clear_history,
            history::list_saved_queries,
            history::save_query,
            history::delete_saved_query,
            preferences::get_settings,
            preferences::set_settings,
            preferences::get_session,
            preferences::set_session,
            files::read_text_file,
            files::write_text_file,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::default().plugin(tauri_plugin_dialog::init());
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    configure(builder, None)
        .run(tauri::generate_context!())
        .expect("error starting PG Studio");
}
