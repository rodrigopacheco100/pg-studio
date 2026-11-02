mod files;
mod json_store;
mod local;
mod pg;
mod session;
mod settings;

use local::{ConnectionConfig, HistoryEntry, SavedQuery};
use pg::{QueryResult, TableInfo};
use session::{Session, SessionStore};
use settings::{Settings, SettingsStore};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;
use tokio_postgres::Client;

type CmdResult<T> = Result<T, String>;

/// Active connection and the config used to open it (the background count opens its own).
struct Active {
    client: Arc<Client>,
    config: ConnectionConfig,
}

struct AppState {
    app: AppHandle,
    store: Mutex<rusqlite::Connection>,
    settings: Mutex<SettingsStore>,
    session: Mutex<SessionStore>,
    active: AsyncMutex<Option<Active>>,
    /// Connection of the count in progress; separate from the main one so it never delays the user's queries.
    counting: AsyncMutex<Option<Arc<pg::Session>>>,
}

impl AppState {
    /// Runs `f` with the local SQLite. The lock never crosses an `.await`.
    fn store<T>(&self, f: impl FnOnce(&rusqlite::Connection) -> rusqlite::Result<T>) -> CmdResult<T> {
        let db = self.store.lock().map_err(|e| e.to_string())?;
        f(&db).map_err(|e| e.to_string())
    }

    /// Main connection. If it was already detected as closed, reopens it before returning; nothing was
    /// sent yet, so there is no risk of repeating a statement. A drop in the middle of a query
    /// becomes an error, and the next command reconnects.
    async fn client(&self) -> CmdResult<Arc<Client>> {
        let mut guard = self.active.lock().await;
        let active = guard.as_mut().ok_or_else(|| "Not connected".to_string())?;
        if active.client.is_closed() {
            active.client = Arc::new(pg::open(&active.config).await?.client);
            // The new session lost open transactions, SET, temporary tables, etc.
            let _ = self.app.emit("connection-restored", ());
        }
        Ok(active.client.clone())
    }

    /// Interrupts, without waiting, the count in progress (if any).
    async fn cancel_counting(&self) {
        if let Some(session) = self.counting.lock().await.take() {
            tauri::async_runtime::spawn(async move { session.cancel().await });
        }
    }
}

#[derive(Serialize)]
struct QueryOutput {
    results: Vec<QueryResult>,
    duration_ms: u64,
}

#[tauri::command]
fn list_connections(state: State<AppState>) -> CmdResult<Vec<ConnectionConfig>> {
    state.store(local::list_connections)
}

#[tauri::command]
fn save_connection(state: State<AppState>, config: ConnectionConfig) -> CmdResult<i64> {
    state.store(|db| local::save_connection(db, &config))
}

#[tauri::command]
fn delete_connection(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.store(|db| local::delete_connection(db, id))
}

#[tauri::command]
async fn test_connection(config: ConnectionConfig) -> CmdResult<()> {
    pg::open(&config).await.map(drop)
}

#[tauri::command]
async fn connect(state: State<'_, AppState>, id: i64) -> CmdResult<Vec<TableInfo>> {
    let config = state.store(|db| local::get_connection(db, id))?;
    let client = Arc::new(pg::open(&config).await?.client);
    let tables = pg::list_tables(&client).await?;
    state.cancel_counting().await;
    *state.active.lock().await = Some(Active { client, config });
    Ok(tables)
}

#[tauri::command]
async fn disconnect(state: State<'_, AppState>) -> CmdResult<()> {
    state.cancel_counting().await;
    *state.active.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn refresh_tables(state: State<'_, AppState>) -> CmdResult<Vec<TableInfo>> {
    let client = state.client().await?;
    pg::list_tables(&client).await
}

#[tauri::command]
async fn run_query(state: State<'_, AppState>, sql: String) -> CmdResult<QueryOutput> {
    let client = state.client().await?;
    let start = Instant::now();
    let outcome = pg::run(&client, &sql).await;
    let duration_ms = start.elapsed().as_millis() as u64;
    // A failure to write the history must not hide the query result.
    let _ = state.store(|db| {
        local::add_history(db, &sql, duration_ms as i64, outcome.as_ref().err().map(String::as_str))
    });
    Ok(QueryOutput { results: outcome?, duration_ms })
}

#[tauri::command]
async fn table_data(
    state: State<'_, AppState>,
    schema: String,
    table: String,
    limit: u32,
    offset: u32,
) -> CmdResult<QueryResult> {
    let client = state.client().await?;
    pg::table_data(&client, &schema, &table, limit, offset).await
}

#[tauri::command]
async fn table_count(state: State<'_, AppState>, schema: String, table: String) -> CmdResult<u64> {
    let config = {
        let active = state.active.lock().await;
        active.as_ref().map(|a| a.config.clone()).ok_or_else(|| "Not connected".to_string())?
    };
    // Own connection: the server handles one query at a time per connection, so counting on a
    // shared connection would hold up the user's queries until count(*) finishes.
    let session = Arc::new(pg::open(&config).await?);
    if let Some(previous) = state.counting.lock().await.replace(session.clone()) {
        tauri::async_runtime::spawn(async move { previous.cancel().await });
    }

    let total = pg::table_count(&session.client, &schema, &table).await;

    let mut counting = state.counting.lock().await;
    if counting.as_ref().is_some_and(|c| Arc::ptr_eq(c, &session)) {
        *counting = None; // done: release the connection
    }
    total
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> CmdResult<Settings> {
    Ok(state.settings.lock().map_err(|e| e.to_string())?.get())
}

#[tauri::command]
fn set_settings(state: State<AppState>, settings: Settings) -> CmdResult<()> {
    state.settings.lock().map_err(|e| e.to_string())?.set(settings)
}

#[tauri::command]
fn get_session(state: State<AppState>) -> CmdResult<Session> {
    Ok(state.session.lock().map_err(|e| e.to_string())?.get())
}

#[tauri::command]
fn set_session(state: State<AppState>, session: Session) -> CmdResult<()> {
    state.session.lock().map_err(|e| e.to_string())?.set(session)
}

#[tauri::command]
fn list_history(state: State<AppState>) -> CmdResult<Vec<HistoryEntry>> {
    state.store(local::list_history)
}

#[tauri::command]
fn clear_history(state: State<AppState>) -> CmdResult<()> {
    state.store(local::clear_history)
}

#[tauri::command]
fn list_saved_queries(state: State<AppState>) -> CmdResult<Vec<SavedQuery>> {
    state.store(local::list_saved)
}

#[tauri::command]
fn save_query(state: State<AppState>, query: SavedQuery) -> CmdResult<()> {
    state.store(|db| local::save_query(db, &query))
}

#[tauri::command]
fn delete_saved_query(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.store(|db| local::delete_saved(db, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = local::open(&dir.join("pg-studio.sqlite"))?;
            app.manage(AppState { app: app.handle().clone(), store: Mutex::new(store), settings: Mutex::new(SettingsStore::load(dir.join("settings.json"))), session: Mutex::new(SessionStore::load(dir.join("session.json"))), active: AsyncMutex::new(None), counting: AsyncMutex::new(None) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_connections,
            save_connection,
            delete_connection,
            test_connection,
            connect,
            disconnect,
            refresh_tables,
            run_query,
            table_data,
            table_count,
            list_history,
            clear_history,
            list_saved_queries,
            save_query,
            delete_saved_query,
            get_settings,
            set_settings,
            get_session,
            set_session,
            files::read_text_file,
            files::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error starting PG Studio");
}
