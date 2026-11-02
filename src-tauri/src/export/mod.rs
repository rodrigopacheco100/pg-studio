//! File exports that run in the background: a table is read with a cursor, a query's rows arrive with the
//! request. Either way the file is written a chunk at a time, progress goes to the `exports` table (the
//! frontend polls it), and `ExportControl` lets the user cancel.

mod format;

pub use format::{Format, Row};

use crate::pg::{self, GridQuery};
use crate::state::AppState;
use crate::storage::exports;
use format::RowWriter;
use serde::Deserialize;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex as AsyncMutex;

/// Rows read from a table per round trip.
const TABLE_CHUNK: u32 = 1000;
/// Rows written per step of an export of rows already in memory.
const ROWS_CHUNK: usize = 5000;
const CANCELLED: &str = "Cancelled";

#[derive(Deserialize)]
pub struct ExportRequest {
    pub format: Format,
    /// Where to save it, as picked in the native dialog.
    pub path: String,
    pub source: ExportSource,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExportSource {
    /// A table with the sort and filters on screen; read from the server, so it is the whole table.
    Table { schema: String, table: String, view: GridQuery },
    /// The rows of a query's result, already sorted and filtered by the frontend.
    Rows { label: String, columns: Vec<String>, types: Vec<String>, rows: Vec<Row> },
}

impl ExportRequest {
    /// What the history calls the export.
    pub fn label(&self) -> String {
        match &self.source {
            ExportSource::Table { schema, table, .. } => format!("{schema}.{table}"),
            ExportSource::Rows { label, .. } => label.clone(),
        }
    }
}

/// Lets the user stop a running export.
#[derive(Default)]
pub struct ExportControl {
    cancelled: AtomicBool,
    /// The connection reading the table, to interrupt a fetch (or count) in progress.
    session: AsyncMutex<Option<Arc<pg::Session>>>,
}

impl ExportControl {
    pub async fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(session) = self.session.lock().await.as_ref() {
            session.cancel().await;
        }
    }

    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) { Err(CANCELLED.into()) } else { Ok(()) }
    }
}

/// Where the file is built: renamed over the destination only when complete, deleted otherwise.
struct Output {
    part: PathBuf,
    file: BufWriter<File>,
    bytes: i64,
}

impl Output {
    fn create(path: &str) -> Result<Self, String> {
        let part = PathBuf::from(format!("{path}.part"));
        let file = File::create(&part).map_err(|e| format!("{}: {e}", part.display()))?;
        Ok(Self { part, file: BufWriter::new(file), bytes: 0 })
    }

    fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.bytes += bytes.len() as i64;
        self.file.write_all(bytes).map_err(|e| format!("{}: {e}", self.part.display()))
    }

    fn finish(mut self, path: &str) -> Result<(), String> {
        self.file.flush().map_err(|e| format!("{}: {e}", self.part.display()))?;
        std::fs::rename(&self.part, path).map_err(|e| format!("{path}: {e}"))
    }
}

/// Runs the export to its end and records how it went. Meant to be spawned.
pub async fn run(state: &AppState, id: i64, request: ExportRequest, control: &ExportControl) {
    let started = Instant::now();
    let part = format!("{}.part", request.path);
    let outcome = job(state, id, &request, control).await;
    *control.session.lock().await = None; // closes the connection that read the table
    let (status, error) = match &outcome {
        Ok(()) => (exports::DONE, None),
        Err(_) if control.check().is_err() => (exports::CANCELLED, None),
        Err(e) => (exports::FAILED, Some(e.as_str())),
    };
    if outcome.is_err() {
        let _ = std::fs::remove_file(part);
    }
    // A failure to record the end must not leave the export looking busy forever, but there is nobody to tell.
    let _ = state.store(|db| exports::finish(db, id, status, error, started.elapsed().as_millis() as i64));
    state.forget_export(id);
}

async fn job(state: &AppState, id: i64, request: &ExportRequest, control: &ExportControl) -> Result<(), String> {
    let mut out = Output::create(&request.path)?;
    let record = |done: i64, total: Option<i64>, bytes: i64| state.store(|db| exports::progress(db, id, done, total, bytes));

    match &request.source {
        ExportSource::Table { schema, table, view } => {
            let session = Arc::new(state.background_session().await?);
            *control.session.lock().await = Some(session.clone());
            control.check()?;

            // Knowing the total gives the percentage; if counting fails (timeout, permission) the export goes on without it.
            let total = pg::table_count(&session.client, schema, table, view).await.ok().map(|n| n as i64);
            control.check()?;
            record(0, total, 0)?;

            let cursor = pg::Cursor::open(&session.client, &pg::table_select(schema, table, view)?).await?;
            let target = format!("{}.{}", pg::quote_ident(schema), pg::quote_ident(table));
            let mut writer = RowWriter::new(request.format, cursor.columns.clone(), cursor.types.clone(), Some(target))?;
            out.write(&writer.begin())?;

            let mut done = 0i64;
            loop {
                let rows = cursor.fetch(TABLE_CHUNK).await?;
                control.check()?;
                if rows.is_empty() {
                    break;
                }
                done += rows.len() as i64;
                out.write(&writer.rows(&rows))?;
                record(done, total, out.bytes)?;
            }
            out.write(&writer.end())?;
            cursor.close().await;
            record(done, Some(done), out.bytes)?;
        }
        ExportSource::Rows { columns, types, rows, .. } => {
            let total = rows.len() as i64;
            let mut writer = RowWriter::new(request.format, columns.clone(), types.clone(), None)?;
            out.write(&writer.begin())?;
            let mut done = 0i64;
            for chunk in rows.chunks(ROWS_CHUNK) {
                control.check()?;
                out.write(&writer.rows(chunk))?;
                done += chunk.len() as i64;
                record(done, Some(total), out.bytes)?;
                tokio::task::yield_now().await; // lets a cancel (or a poll) in between
            }
            out.write(&writer.end())?;
            record(total, Some(total), out.bytes)?;
        }
    }
    out.finish(&request.path)
}
