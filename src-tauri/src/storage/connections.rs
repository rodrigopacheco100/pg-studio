//! Saved connections. Secrets (password, SSH secret) live in `Secrets`, never in SQLite.

use crate::secrets::Secrets;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    /// Never stored in SQLite: it lives in the secret store (see `secrets.rs`). Lists leave it
    /// empty; on save, empty means "keep the stored one".
    pub password: String,
    pub ssl: bool,
    /// Reach the server through an SSH tunnel (`ssh_*` fields).
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    /// `key`, `password` or `agent`.
    #[serde(default = "ssh_auth")]
    pub ssh_auth: String,
    #[serde(default)]
    pub ssh_key_path: String,
    /// SSH password, or the private key's passphrase. Handled like `password`.
    #[serde(default)]
    pub ssh_secret: String,
    /// When false the passwords are not kept anywhere and are asked on every connect.
    #[serde(default = "yes")]
    pub save_password: bool,
    /// Folder the connection is filed under; `None` = top level. Not touched by `save_connection` on update (see `reorder_connections`).
    #[serde(default)]
    pub folder_id: Option<i64>,
}

fn yes() -> bool {
    true
}
fn ssh_port() -> u16 {
    22
}
fn ssh_auth() -> String {
    "key".into()
}

/// Names of a connection's secrets in the secret store.
fn password_key(id: i64) -> String {
    format!("connection-{id}")
}
fn ssh_secret_key(id: i64) -> String {
    format!("connection-{id}-ssh")
}

const COLUMNS: &str = "id, name, host, port, database, user, password, ssl, folder_id, save_password, \
                       ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path";

/// One entry of the new connection order: its position is its index in the list.
#[derive(Deserialize)]
pub struct Placement {
    pub id: i64,
    pub folder_id: Option<i64>,
}

/// Creates the table, and adds the columns introduced after the first release to older databases.
pub(super) fn init(db: &Connection) -> rusqlite::Result<()> {
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
         );",
    )?;
    let has = |col: &str| -> rusqlite::Result<bool> {
        db.query_row("SELECT COUNT(*) FROM pragma_table_info('connections') WHERE name = ?1", [col], |r| r.get::<_, i64>(0))
            .map(|n| n > 0)
    };
    for (col, def) in [
        ("folder_id", "INTEGER"),
        ("position", "INTEGER NOT NULL DEFAULT 0"),
        ("save_password", "INTEGER NOT NULL DEFAULT 1"),
        ("ssh_enabled", "INTEGER NOT NULL DEFAULT 0"),
        ("ssh_host", "TEXT NOT NULL DEFAULT ''"),
        ("ssh_port", "INTEGER NOT NULL DEFAULT 22"),
        ("ssh_user", "TEXT NOT NULL DEFAULT ''"),
        ("ssh_auth", "TEXT NOT NULL DEFAULT 'key'"),
        ("ssh_key_path", "TEXT NOT NULL DEFAULT ''"),
    ] {
        if !has(col)? {
            db.execute(&format!("ALTER TABLE connections ADD COLUMN {col} {def}"), [])?;
        }
    }
    Ok(())
}

/// Moves passwords left in SQLite by older versions into the secret store. A row is only cleared once
/// the store accepted it, so while it cannot (no keychain and the vault locked) the password stays
/// where it was and keeps working, see `get_connection`. Runs at startup and after the vault is unlocked.
pub fn migrate_passwords(db: &Connection, secrets: &Secrets) -> rusqlite::Result<()> {
    let mut stmt = db.prepare("SELECT id, password FROM connections WHERE password <> ''")?;
    let legacy: Vec<(i64, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    for (id, password) in legacy {
        if secrets.set(&password_key(id), &password).is_ok() {
            db.execute("UPDATE connections SET password = '' WHERE id = ?1", [id])?;
        }
    }
    Ok(())
}

pub fn list(db: &Connection) -> rusqlite::Result<Vec<ConnectionConfig>> {
    let mut stmt = db.prepare(&format!("SELECT {COLUMNS} FROM connections ORDER BY position, name, id"))?;
    let rows = stmt.query_map([], |r| {
        let mut c = row_to_connection(r)?;
        c.password.clear(); // secrets never reach the frontend
        Ok(c)
    })?;
    rows.collect()
}

/// With its password: from the secret store, or from SQLite for rows an older version left there.
pub fn get(db: &Connection, secrets: &Secrets, id: i64) -> rusqlite::Result<ConnectionConfig> {
    let mut c = db.query_row(&format!("SELECT {COLUMNS} FROM connections WHERE id = ?1"), [id], row_to_connection)?;
    if !c.save_password {
        c.password.clear();
    } else {
        if let Some(p) = secrets.get(&password_key(id)) {
            c.password = p;
        }
        if let Some(p) = secrets.get(&ssh_secret_key(id)) {
            c.ssh_secret = p;
        }
    }
    Ok(c)
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
        save_password: r.get::<_, i64>(9)? != 0,
        ssh_enabled: r.get::<_, i64>(10)? != 0,
        ssh_host: r.get(11)?,
        ssh_port: r.get(12)?,
        ssh_user: r.get(13)?,
        ssh_auth: r.get(14)?,
        ssh_key_path: r.get(15)?,
        ssh_secret: String::new(),
    })
}

/// Stores the connection. The password and the SSH secret go to the secret store only when `save_password`
/// is set (an empty one keeps what is stored); otherwise any stored ones are removed.
pub fn save(db: &Connection, secrets: &Secrets, c: &ConnectionConfig) -> Result<i64, String> {
    let e = |e: rusqlite::Error| e.to_string();
    let id = match c.id {
        Some(id) => {
            db.execute(
                "UPDATE connections SET name=?1, host=?2, port=?3, database=?4, user=?5, ssl=?6, save_password=?7,
                 ssh_enabled=?8, ssh_host=?9, ssh_port=?10, ssh_user=?11, ssh_auth=?12, ssh_key_path=?13 WHERE id=?14",
                params![c.name, c.host, c.port, c.database, c.user, c.ssl, c.save_password,
                        c.ssh_enabled, c.ssh_host, c.ssh_port, c.ssh_user, c.ssh_auth, c.ssh_key_path, id],
            )
            .map_err(e)?;
            id
        }
        None => {
            db.execute(
                "INSERT INTO connections (name, host, port, database, user, ssl, folder_id, save_password,
                 ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path, position)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, (SELECT COALESCE(MAX(position), 0) + 1 FROM connections))",
                params![c.name, c.host, c.port, c.database, c.user, c.ssl, c.folder_id, c.save_password,
                        c.ssh_enabled, c.ssh_host, c.ssh_port, c.ssh_user, c.ssh_auth, c.ssh_key_path],
            )
            .map_err(e)?;
            db.last_insert_rowid()
        }
    };
    let stored = if !c.save_password {
        secrets.remove(&password_key(id));
        secrets.remove(&ssh_secret_key(id));
        Ok(())
    } else {
        [(password_key(id), &c.password), (ssh_secret_key(id), &c.ssh_secret)]
            .into_iter()
            .filter(|(_, value)| !value.is_empty())
            .try_for_each(|(key, value)| secrets.set(&key, value))
    };
    if let Err(err) = stored {
        if c.id.is_none() {
            let _ = delete(db, secrets, id); // do not leave a half-saved new connection
        }
        return Err(err);
    }
    db.execute("UPDATE connections SET password = '' WHERE id = ?1", [id]).map_err(e)?;
    Ok(id)
}

pub fn delete(db: &Connection, secrets: &Secrets, id: i64) -> rusqlite::Result<()> {
    db.execute("DELETE FROM connections WHERE id = ?1", [id])?;
    secrets.remove(&password_key(id));
    secrets.remove(&ssh_secret_key(id));
    Ok(())
}

/// Rewrites folder and position of the connections in one transaction.
pub fn reorder(db: &Connection, items: &[Placement]) -> rusqlite::Result<()> {
    let tx = db.unchecked_transaction()?;
    for (i, p) in items.iter().enumerate() {
        tx.execute("UPDATE connections SET folder_id = ?1, position = ?2 WHERE id = ?3", params![p.folder_id, i as i64, p.id])?;
    }
    tx.commit()
}
