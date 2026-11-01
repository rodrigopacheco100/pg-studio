mod local;
mod pg;

use local::{ConnectionConfig, HistoryEntry, SavedQuery};
use pg::{QueryResult, TableInfo};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;
use tokio_postgres::Client;

type CmdResult<T> = Result<T, String>;

/// Conexão ativa e a configuração usada para abri-la (a contagem em segundo plano reabre uma própria).
struct Active {
    client: Arc<Client>,
    config: ConnectionConfig,
}

struct AppState {
    app: AppHandle,
    store: Mutex<rusqlite::Connection>,
    active: AsyncMutex<Option<Active>>,
    /// Conexão da contagem em andamento; separada da principal para nunca atrasar as queries do usuário.
    counting: AsyncMutex<Option<Arc<pg::Session>>>,
}

impl AppState {
    /// Executa `f` com o SQLite local. O lock nunca atravessa um `.await`.
    fn store<T>(&self, f: impl FnOnce(&rusqlite::Connection) -> rusqlite::Result<T>) -> CmdResult<T> {
        let db = self.store.lock().map_err(|e| e.to_string())?;
        f(&db).map_err(|e| e.to_string())
    }

    /// Conexão principal. Se ela já foi detectada como fechada, reabre antes de devolver; nada foi
    /// enviado ainda, então não há risco de repetir uma instrução. Uma queda no meio de uma query
    /// vira erro, e o próximo comando reconecta.
    async fn client(&self) -> CmdResult<Arc<Client>> {
        let mut guard = self.active.lock().await;
        let active = guard.as_mut().ok_or_else(|| "Não conectado".to_string())?;
        if active.client.is_closed() {
            active.client = Arc::new(pg::open(&active.config).await?.client);
            // A sessão nova perdeu transações abertas, SET, tabelas temporárias etc.
            let _ = self.app.emit("connection-restored", ());
        }
        Ok(active.client.clone())
    }

    /// Interrompe, sem esperar, a contagem em andamento (se houver).
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
    // Falha ao gravar o histórico não deve esconder o resultado da query.
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
        active.as_ref().map(|a| a.config.clone()).ok_or_else(|| "Não conectado".to_string())?
    };
    // Conexão própria: o servidor atende uma query por vez por conexão, então contar numa
    // conexão compartilhada seguraria as queries do usuário até o fim do count(*).
    let session = Arc::new(pg::open(&config).await?);
    if let Some(previous) = state.counting.lock().await.replace(session.clone()) {
        tauri::async_runtime::spawn(async move { previous.cancel().await });
    }

    let total = pg::table_count(&session.client, &schema, &table).await;

    let mut counting = state.counting.lock().await;
    if counting.as_ref().is_some_and(|c| Arc::ptr_eq(c, &session)) {
        *counting = None; // terminou: libera a conexão
    }
    total
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
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = local::open(&dir.join("pg-studio.sqlite"))?;
            app.manage(AppState { app: app.handle().clone(), store: Mutex::new(store), active: AsyncMutex::new(None), counting: AsyncMutex::new(None) });
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
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o PG Studio");
}
