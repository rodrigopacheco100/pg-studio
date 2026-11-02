//! Named queries saved by the user.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: Option<i64>,
    pub name: String,
    pub sql: String,
}

pub(super) fn init(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS saved_queries (
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             sql TEXT NOT NULL
         );",
    )
}

pub fn list(db: &Connection) -> rusqlite::Result<Vec<SavedQuery>> {
    let mut stmt = db.prepare("SELECT id, name, sql FROM saved_queries ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(SavedQuery { id: Some(r.get(0)?), name: r.get(1)?, sql: r.get(2)? })
    })?;
    rows.collect()
}

pub fn save(db: &Connection, q: &SavedQuery) -> rusqlite::Result<()> {
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

pub fn delete(db: &Connection, id: i64) -> rusqlite::Result<()> {
    db.execute("DELETE FROM saved_queries WHERE id = ?1", [id])?;
    Ok(())
}
