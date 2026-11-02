//! Local storage (`pg-studio.sqlite`): saved connections and folders, history and saved queries.
//! Each submodule owns its table and creates / upgrades it in `init`.

pub mod connections;
pub mod folders;
pub mod history;
pub mod saved_queries;

use rusqlite::Connection;
use std::path::Path;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    connections::init(&db)?;
    folders::init(&db)?;
    history::init(&db)?;
    saved_queries::init(&db)?;
    Ok(db)
}
