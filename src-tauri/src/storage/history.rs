//! History of executed statements, capped at `HISTORY_LIMIT` entries.

use rusqlite::{params, Connection};
use serde::Serialize;

const HISTORY_LIMIT: i64 = 500;

#[derive(Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub sql: String,
    pub ran_at: String,
    pub duration_ms: i64,
    pub error: Option<String>,
}

pub(super) fn init(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
             id INTEGER PRIMARY KEY,
             sql TEXT NOT NULL,
             ran_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
             duration_ms INTEGER NOT NULL,
             error TEXT
         );",
    )
}

pub fn add(
    db: &Connection,
    sql: &str,
    duration_ms: i64,
    error: Option<&str>,
) -> rusqlite::Result<()> {
    db.execute(
        "INSERT INTO history (sql, duration_ms, error) VALUES (?1, ?2, ?3)",
        params![sql, duration_ms, error],
    )?;
    db.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?1)",
        [HISTORY_LIMIT],
    )?;
    Ok(())
}

pub fn list(db: &Connection) -> rusqlite::Result<Vec<HistoryEntry>> {
    let mut stmt = db.prepare(
        "SELECT id, sql, ran_at, duration_ms, error FROM history ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(HistoryEntry {
            id: r.get(0)?,
            sql: r.get(1)?,
            ran_at: r.get(2)?,
            duration_ms: r.get(3)?,
            error: r.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn clear(db: &Connection) -> rusqlite::Result<()> {
    db.execute("DELETE FROM history", [])?;
    Ok(())
}
