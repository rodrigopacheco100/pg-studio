//! Folders that group saved connections in the sidebar. Flat; deleting one returns its connections to the top level.

use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Serialize)]
pub struct Folder {
    pub id: i64,
    pub name: String,
}

pub(super) fn init(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS connection_folders (
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             position INTEGER NOT NULL DEFAULT 0
         );",
    )
}

pub fn list(db: &Connection) -> rusqlite::Result<Vec<Folder>> {
    let mut stmt = db.prepare("SELECT id, name FROM connection_folders ORDER BY position, id")?;
    let rows = stmt.query_map([], |r| Ok(Folder { id: r.get(0)?, name: r.get(1)? }))?;
    rows.collect()
}

pub fn create(db: &Connection, name: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO connection_folders (name, position) VALUES (?1, (SELECT COALESCE(MAX(position), 0) + 1 FROM connection_folders))",
        [name],
    )?;
    Ok(db.last_insert_rowid())
}

pub fn rename(db: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    db.execute("UPDATE connection_folders SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

/// Connections inside go back to the top level.
pub fn delete(db: &Connection, id: i64) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    tx.execute("UPDATE connections SET folder_id = NULL WHERE folder_id = ?1", [id])?;
    tx.execute("DELETE FROM connection_folders WHERE id = ?1", [id])?;
    tx.commit()
}

pub fn reorder(db: &Connection, ids: &[i64]) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute("UPDATE connection_folders SET position = ?1 WHERE id = ?2", params![i as i64, id])?;
    }
    tx.commit()
}
