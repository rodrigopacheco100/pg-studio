//! Running SQL and browsing the connected database.

use super::CmdResult;
use crate::pg::{self, DetailItem, QueryResult, TableInfo};
use crate::state::AppState;
use crate::storage::history;
use serde::Serialize;
use std::time::Instant;
use tauri::State;

#[derive(Serialize)]
pub struct QueryOutput {
    results: Vec<QueryResult>,
    duration_ms: u64,
}

#[tauri::command]
pub async fn refresh_tables(state: State<'_, AppState>) -> CmdResult<Vec<TableInfo>> {
    let client = state.client().await?;
    pg::list_tables(&client).await
}

#[tauri::command]
pub async fn run_query(state: State<'_, AppState>, sql: String, statements: Vec<String>) -> CmdResult<QueryOutput> {
    let client = state.client().await?;
    let start = Instant::now();
    let outcome = pg::run_typed(&client, &sql, &statements).await;
    let duration_ms = start.elapsed().as_millis() as u64;
    // A failure to write the history must not hide the query result.
    let _ = state.store(|db| history::add(db, &sql, duration_ms as i64, outcome.as_ref().err().map(String::as_str)));
    Ok(QueryOutput { results: outcome?, duration_ms })
}

/// Interrupts the query running on the active connection; the pending `run_query` / `table_data` fails with the server's "canceling statement" error.
#[tauri::command]
pub async fn cancel_query(state: State<'_, AppState>) -> CmdResult<()> {
    state.cancel_query().await;
    Ok(())
}

#[tauri::command]
pub async fn table_data(
    state: State<'_, AppState>,
    schema: String,
    table: String,
    limit: u32,
    offset: u32,
    view: pg::GridQuery,
) -> CmdResult<QueryResult> {
    let client = state.client().await?;
    pg::table_data(&client, &schema, &table, limit, offset, &view).await
}

#[tauri::command]
pub async fn table_count(state: State<'_, AppState>, schema: String, table: String, view: pg::GridQuery) -> CmdResult<u64> {
    state.count_rows(&schema, &table, &view).await
}

#[tauri::command]
pub async fn table_details(state: State<'_, AppState>, schema: String, table: String, kind: String) -> CmdResult<Vec<DetailItem>> {
    let client = state.client().await?;
    pg::table_details(&client, &schema, &table, &kind).await
}

#[tauri::command]
pub async fn table_item(
    state: State<'_, AppState>,
    schema: String,
    table: String,
    kind: String,
    name: String,
) -> CmdResult<serde_json::Value> {
    let client = state.client().await?;
    pg::table_item(&client, &schema, &table, &kind, &name).await
}
