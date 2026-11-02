mod commands;
mod known_hosts;
mod pg;
mod persist;
mod secrets;
mod state;
mod storage;
mod tunnel;

use commands::{connections, files, folders, history, preferences, queries, ssh, vault};
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppState::open(app.handle().clone(), &dir)?);
            AppState::watch_vault_idle(app.handle());
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
            ssh::list_known_hosts,
            ssh::forget_known_host,
            vault::vault_status,
            vault::vault_open,
            queries::refresh_tables,
            queries::run_query,
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
        .run(tauri::generate_context!())
        .expect("error starting PG Studio");
}
