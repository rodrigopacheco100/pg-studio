//! History of file exports, with how each one went: progress, size, duration and any error.
//! A row is written when the export starts and updated as it runs, so the frontend can follow it by polling.

use rusqlite::{params, Connection};
use serde::Serialize;

const EXPORT_LIMIT: i64 = 500;

pub const RUNNING: &str = "running";
pub const DONE: &str = "done";
pub const CANCELLED: &str = "cancelled";
pub const FAILED: &str = "failed";

#[derive(Serialize)]
pub struct ExportEntry {
    pub id: i64,
    /// What was exported: `schema.table`, or a label for a query's results.
    pub source: String,
    pub format: String,
    pub path: String,
    /// `running`, `done`, `cancelled` or `failed`.
    pub status: String,
    pub rows_done: i64,
    /// Rows to export, when known (not while a table is still being counted, or if counting failed).
    pub rows_total: Option<i64>,
    pub bytes: i64,
    pub error: Option<String>,
    pub started_at: String,
    /// Set when the export ended.
    pub duration_ms: Option<i64>,
}

pub(super) fn init(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS exports (
             id INTEGER PRIMARY KEY,
             source TEXT NOT NULL,
             format TEXT NOT NULL,
             path TEXT NOT NULL,
             status TEXT NOT NULL,
             rows_done INTEGER NOT NULL DEFAULT 0,
             rows_total INTEGER,
             bytes INTEGER NOT NULL DEFAULT 0,
             error TEXT,
             started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
             duration_ms INTEGER
         );",
    )?;
    // An export cannot outlive the app: whatever was still running when it closed did not finish.
    db.execute(
        "UPDATE exports SET status = ?1, error = 'Interrupted: the app was closed' WHERE status = ?2",
        params![FAILED, RUNNING],
    )?;
    Ok(())
}

pub fn start(db: &Connection, source: &str, format: &str, path: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO exports (source, format, path, status) VALUES (?1, ?2, ?3, ?4)",
        params![source, format, path, RUNNING],
    )?;
    let id = db.last_insert_rowid();
    db.execute(
        "DELETE FROM exports WHERE status <> ?1 AND id NOT IN (SELECT id FROM exports ORDER BY id DESC LIMIT ?2)",
        params![RUNNING, EXPORT_LIMIT],
    )?;
    Ok(id)
}

pub fn progress(db: &Connection, id: i64, rows_done: i64, rows_total: Option<i64>, bytes: i64) -> rusqlite::Result<()> {
    db.execute(
        "UPDATE exports SET rows_done = ?2, rows_total = ?3, bytes = ?4 WHERE id = ?1",
        params![id, rows_done, rows_total, bytes],
    )?;
    Ok(())
}

pub fn finish(db: &Connection, id: i64, status: &str, error: Option<&str>, duration_ms: i64) -> rusqlite::Result<()> {
    db.execute(
        "UPDATE exports SET status = ?2, error = ?3, duration_ms = ?4 WHERE id = ?1",
        params![id, status, error, duration_ms],
    )?;
    Ok(())
}

pub fn list(db: &Connection) -> rusqlite::Result<Vec<ExportEntry>> {
    let mut stmt = db.prepare(
        "SELECT id, source, format, path, status, rows_done, rows_total, bytes, error, started_at, duration_ms
         FROM exports ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(ExportEntry {
            id: r.get(0)?,
            source: r.get(1)?,
            format: r.get(2)?,
            path: r.get(3)?,
            status: r.get(4)?,
            rows_done: r.get(5)?,
            rows_total: r.get(6)?,
            bytes: r.get(7)?,
            error: r.get(8)?,
            started_at: r.get(9)?,
            duration_ms: r.get(10)?,
        })
    })?;
    rows.collect()
}

/// Removes the history of finished exports; the ones still running stay.
pub fn clear_finished(db: &Connection) -> rusqlite::Result<()> {
    db.execute("DELETE FROM exports WHERE status <> ?1", [RUNNING])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        init(&db).unwrap();
        db
    }

    #[test]
    fn follows_an_export_from_start_to_finish() {
        let db = db();
        let id = start(&db, "public.users", "csv", "/tmp/u.csv").unwrap();
        assert_eq!(list(&db).unwrap()[0].status, RUNNING);

        progress(&db, id, 500, Some(1000), 4096).unwrap();
        let e = &list(&db).unwrap()[0];
        assert_eq!((e.rows_done, e.rows_total, e.bytes, e.duration_ms), (500, Some(1000), 4096, None));

        finish(&db, id, DONE, None, 1200).unwrap();
        let e = &list(&db).unwrap()[0];
        assert_eq!((e.status.as_str(), e.duration_ms, e.error.as_deref()), (DONE, Some(1200), None));
    }

    #[test]
    fn an_export_left_running_is_marked_failed_on_the_next_start() {
        let db = db();
        start(&db, "t", "csv", "/x").unwrap();
        init(&db).unwrap();
        let e = &list(&db).unwrap()[0];
        assert_eq!(e.status, FAILED);
        assert!(e.error.as_deref().unwrap().contains("Interrupted"));
    }

    #[test]
    fn newest_first_and_clearing_keeps_what_is_running() {
        let db = db();
        let a = start(&db, "a", "csv", "/a").unwrap();
        let b = start(&db, "b", "json", "/b").unwrap();
        finish(&db, a, CANCELLED, None, 1).unwrap();
        assert_eq!(list(&db).unwrap().iter().map(|e| e.id).collect::<Vec<_>>(), vec![b, a]);
        clear_finished(&db).unwrap();
        assert_eq!(list(&db).unwrap().iter().map(|e| e.id).collect::<Vec<_>>(), vec![b]);
    }
}
