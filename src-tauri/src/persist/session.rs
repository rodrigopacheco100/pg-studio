//! Work in progress, persisted in `session.json` so the app reopens as it was left:
//! the open editor documents (including unsaved text) and the active connection.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionDoc {
    pub id: u32,
    pub path: Option<String>,
    pub name: String,
    pub sql: String,
    /// Content as last read from or written to disk; the document is unsaved when it differs from `sql`.
    pub saved: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Session {
    pub docs: Vec<SessionDoc>,
    pub active_doc: Option<u32>,
    pub connection_id: Option<i64>,
}
