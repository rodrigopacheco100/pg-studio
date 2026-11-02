//! Local storage (SQLite): saved connections, history and saved queries.

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
    /// Folder the connection is filed under; `None` = top level. Not touched by `save_connection` on update (see `reorder_connections`).
    #[serde(default)]
    pub folder_id: Option<i64>,
}

#[derive(Serialize)]
pub struct Folder {
    pub id: i64,
    pub name: String,
}

/// One entry of the new connection order: its position is its index in the list.
#[derive(Deserialize)]
pub struct Placement {
    pub id: i64,
    pub folder_id: Option<i64>,
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
         CREATE TABLE IF NOT EXISTS connection_folders (
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             position INTEGER NOT NULL DEFAULT 0
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
    // Columns added after the first release.
    let has = |col: &str| -> rusqlite::Result<bool> {
        db.query_row("SELECT COUNT(*) FROM pragma_table_info('connections') WHERE name = ?1", [col], |r| r.get::<_, i64>(0))
            .map(|n| n > 0)
    };
    if !has("folder_id")? {
        db.execute("ALTER TABLE connections ADD COLUMN folder_id INTEGER", [])?;
    }
    if !has("position")? {
        db.execute("ALTER TABLE connections ADD COLUMN position INTEGER NOT NULL DEFAULT 0", [])?;
    }
    Ok(db)
}

pub fn list_connections(db: &Connection) -> rusqlite::Result<Vec<ConnectionConfig>> {
    let mut stmt = db.prepare(
        "SELECT id, name, host, port, database, user, password, ssl, folder_id FROM connections ORDER BY position, name, id",
    )?;
    let rows = stmt.query_map([], row_to_connection)?;
    rows.collect()
}

pub fn get_connection(db: &Connection, id: i64) -> rusqlite::Result<ConnectionConfig> {
    db.query_row(
        "SELECT id, name, host, port, database, user, password, ssl, folder_id FROM connections WHERE id = ?1",
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
        folder_id: r.get(8)?,
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
                "INSERT INTO connections (name, host, port, database, user, password, ssl, folder_id, position)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8, (SELECT COALESCE(MAX(position), 0) + 1 FROM connections))",
                params![c.name, c.host, c.port, c.database, c.user, c.password, c.ssl, c.folder_id],
            )?;
            Ok(db.last_insert_rowid())
        }
    }
}

pub fn delete_connection(db: &Connection, id: i64) -> rusqlite::Result<()> {
    db.execute("DELETE FROM connections WHERE id = ?1", [id])?;
    Ok(())
}

/// Rewrites folder and position of the connections in one transaction.
pub fn reorder_connections(db: &Connection, items: &[Placement]) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    for (i, p) in items.iter().enumerate() {
        tx.execute("UPDATE connections SET folder_id = ?1, position = ?2 WHERE id = ?3", params![p.folder_id, i as i64, p.id])?;
    }
    tx.commit()
}

pub fn list_folders(db: &Connection) -> rusqlite::Result<Vec<Folder>> {
    let mut stmt = db.prepare("SELECT id, name FROM connection_folders ORDER BY position, id")?;
    let rows = stmt.query_map([], |r| Ok(Folder { id: r.get(0)?, name: r.get(1)? }))?;
    rows.collect()
}

pub fn create_folder(db: &Connection, name: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO connection_folders (name, position) VALUES (?1, (SELECT COALESCE(MAX(position), 0) + 1 FROM connection_folders))",
        [name],
    )?;
    Ok(db.last_insert_rowid())
}

pub fn rename_folder(db: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    db.execute("UPDATE connection_folders SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

/// Connections inside go back to the top level.
pub fn delete_folder(db: &Connection, id: i64) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    tx.execute("UPDATE connections SET folder_id = NULL WHERE folder_id = ?1", [id])?;
    tx.execute("DELETE FROM connection_folders WHERE id = ?1", [id])?;
    tx.commit()
}

pub fn reorder_folders(db: &Connection, ids: &[i64]) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute("UPDATE connection_folders SET position = ?1 WHERE id = ?2", params![i as i64, id])?;
    }
    tx.commit()
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
