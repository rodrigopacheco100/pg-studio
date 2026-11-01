//! Armazenamento local (SQLite): conexões salvas, histórico e queries salvas.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
}

#[derive(Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub sql: String,
    pub ran_at: String,
    pub duration_ms: i64,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: Option<i64>,
    pub name: String,
    pub sql: String,
}

const HISTORY_LIMIT: i64 = 500;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS connections (
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             host TEXT NOT NULL,
             port INTEGER NOT NULL,
             database TEXT NOT NULL,
             user TEXT NOT NULL,
             password TEXT NOT NULL DEFAULT '',
             ssl INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS history (
             id INTEGER PRIMARY KEY,
             sql TEXT NOT NULL,
             ran_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
             duration_ms INTEGER NOT NULL,
             error TEXT
         );
         CREATE TABLE IF NOT EXISTS saved_queries (
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             sql TEXT NOT NULL
         );",
    )?;
    Ok(db)
}

pub fn list_connections(db: &Connection) -> rusqlite::Result<Vec<ConnectionConfig>> {
    let mut stmt = db.prepare(
        "SELECT id, name, host, port, database, user, password, ssl FROM connections ORDER BY name",
    )?;
    let rows = stmt.query_map([], row_to_connection)?;
    rows.collect()
}

pub fn get_connection(db: &Connection, id: i64) -> rusqlite::Result<ConnectionConfig> {
    db.query_row(
        "SELECT id, name, host, port, database, user, password, ssl FROM connections WHERE id = ?1",
        [id],
        row_to_connection,
    )
}

fn row_to_connection(r: &rusqlite::Row) -> rusqlite::Result<ConnectionConfig> {
    Ok(ConnectionConfig {
        id: Some(r.get(0)?),
        name: r.get(1)?,
        host: r.get(2)?,
        port: r.get(3)?,
        database: r.get(4)?,
        user: r.get(5)?,
        password: r.get(6)?,
        ssl: r.get::<_, i64>(7)? != 0,
    })
}

pub fn save_connection(db: &Connection, c: &ConnectionConfig) -> rusqlite::Result<i64> {
    match c.id {
        Some(id) => {
            db.execute(
                "UPDATE connections SET name=?1, host=?2, port=?3, database=?4, user=?5, password=?6, ssl=?7 WHERE id=?8",
                params![c.name, c.host, c.port, c.database, c.user, c.password, c.ssl, id],
            )?;
            Ok(id)
        }
        None => {
            db.execute(
                "INSERT INTO connections (name, host, port, database, user, password, ssl) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![c.name, c.host, c.port, c.database, c.user, c.password, c.ssl],
            )?;
            Ok(db.last_insert_rowid())
        }
    }
}

pub fn delete_connection(db: &Connection, id: i64) -> rusqlite::Result<()> {
    db.execute("DELETE FROM connections WHERE id = ?1", [id])?;
    Ok(())
}

pub fn add_history(
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

pub fn list_history(db: &Connection) -> rusqlite::Result<Vec<HistoryEntry>> {
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

pub fn clear_history(db: &Connection) -> rusqlite::Result<()> {
    db.execute("DELETE FROM history", [])?;
    Ok(())
}

pub fn list_saved(db: &Connection) -> rusqlite::Result<Vec<SavedQuery>> {
    let mut stmt = db.prepare("SELECT id, name, sql FROM saved_queries ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(SavedQuery { id: Some(r.get(0)?), name: r.get(1)?, sql: r.get(2)? })
    })?;
    rows.collect()
}

pub fn save_query(db: &Connection, q: &SavedQuery) -> rusqlite::Result<()> {
    match q.id {
        Some(id) => db.execute(
            "UPDATE saved_queries SET name=?1, sql=?2 WHERE id=?3",
            params![q.name, q.sql, id],
        )?,
        None => db.execute(
            "INSERT INTO saved_queries (name, sql) VALUES (?1, ?2)",
            params![q.name, q.sql],
        )?,
    };
    Ok(())
}

pub fn delete_saved(db: &Connection, id: i64) -> rusqlite::Result<()> {
    db.execute("DELETE FROM saved_queries WHERE id = ?1", [id])?;
    Ok(())
}
