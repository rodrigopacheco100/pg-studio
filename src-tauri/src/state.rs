//! Application state shared by the commands.

use crate::pg;
use crate::persist::{session::Session, settings::Settings, JsonStore};
use crate::secrets::Secrets;
use crate::storage::{self, connections::ConnectionConfig};
use crate::tunnel::{self, KnownHosts, Tunnel};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use tokio_postgres::Client;

pub type CmdResult<T> = Result<T, String>;

/// Active connection and the config used to open it (the background count opens its own).
pub struct Active {
    client: Arc<Client>,
    /// What `pg::open` connects with: `origin`, with host and port pointing at the tunnel when there is one.
    config: ConnectionConfig,
    /// The connection as saved (plus the secrets typed for this session), to rebuild the tunnel on reconnect.
    origin: ConnectionConfig,
    /// Kept alive for as long as the connection is active.
    _tunnel: Option<Tunnel>,
}

pub struct AppState {
    app: AppHandle,
    store: Mutex<rusqlite::Connection>,
    pub secrets: Arc<Secrets>,
    pub known_hosts: KnownHosts,
    settings: Mutex<JsonStore<Settings>>,
    session: Mutex<JsonStore<Session>>,
    active: AsyncMutex<Option<Active>>,
    /// Connection of the count in progress; separate from the main one so it never delays the user's queries.
    counting: AsyncMutex<Option<Arc<pg::Session>>>,
}

/// Locks a std mutex, turning poisoning into a command error.
fn lock<T>(m: &Mutex<T>) -> CmdResult<MutexGuard<'_, T>> {
    m.lock().map_err(|e| e.to_string())
}

impl AppState {
    /// Opens the local stores in `dir`. Passwords left in SQLite by older versions move to the secret
    /// store (or stay until the vault is unlocked).
    pub fn open(app: AppHandle, dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let state = Self {
            app,
            store: Mutex::new(storage::open(&dir.join("pg-studio.sqlite"))?),
            secrets: Arc::new(Secrets::load(dir.join("vault.json"))),
            known_hosts: KnownHosts::load(dir.join("known_hosts.json")),
            settings: Mutex::new(JsonStore::load(dir.join("settings.json"))),
            session: Mutex::new(JsonStore::load(dir.join("session.json"))),
            active: AsyncMutex::new(None),
            counting: AsyncMutex::new(None),
        };
        let _ = state.migrate_passwords();
        Ok(state)
    }

    /// Runs `f` with the local SQLite. The lock never crosses an `.await`.
    pub fn store<T, E: ToString>(&self, f: impl FnOnce(&rusqlite::Connection) -> Result<T, E>) -> CmdResult<T> {
        f(&*lock(&self.store)?).map_err(|e| e.to_string())
    }

    pub fn settings(&self) -> CmdResult<MutexGuard<'_, JsonStore<Settings>>> {
        lock(&self.settings)
    }

    pub fn session(&self) -> CmdResult<MutexGuard<'_, JsonStore<Session>>> {
        lock(&self.session)
    }

    pub fn migrate_passwords(&self) -> CmdResult<()> {
        self.store(|db| storage::connections::migrate_passwords(db, &self.secrets))
    }

    /// A saved connection with its stored secrets.
    pub fn saved_connection(&self, id: i64) -> CmdResult<ConnectionConfig> {
        self.store(|db| storage::connections::get(db, &self.secrets, id))
    }

    /// Connects and makes it the active connection (replacing any previous one).
    pub async fn connect(&self, origin: ConnectionConfig) -> CmdResult<Vec<pg::TableInfo>> {
        let (tunnel, config) = self.route(&origin).await?;
        let client = Arc::new(pg::open(&config).await?.client);
        let tables = pg::list_tables(&client).await?;
        self.cancel_counting().await;
        *self.active.lock().await = Some(Active { client, config, origin, _tunnel: tunnel });
        Ok(tables)
    }

    pub async fn disconnect(&self) {
        self.cancel_counting().await;
        *self.active.lock().await = None;
    }

    /// Opens the SSH tunnel if the connection asks for one, and returns the config to connect with.
    pub async fn route(&self, origin: &ConnectionConfig) -> CmdResult<(Option<Tunnel>, ConnectionConfig)> {
        if !origin.ssh_enabled {
            return Ok((None, origin.clone()));
        }
        let tunnel = tunnel::open(origin, &self.known_hosts).await?;
        let config = ConnectionConfig { host: "127.0.0.1".into(), port: tunnel.local_port, ..origin.clone() };
        Ok((Some(tunnel), config))
    }

    /// Main connection. If it was already detected as closed, reopens it before returning; nothing was
    /// sent yet, so there is no risk of repeating a statement. A drop in the middle of a query
    /// becomes an error, and the next command reconnects.
    pub async fn client(&self) -> CmdResult<Arc<Client>> {
        let mut guard = self.active.lock().await;
        let active = guard.as_mut().ok_or_else(|| "Not connected".to_string())?;
        if active.client.is_closed() {
            // A dropped connection may mean a dropped tunnel too: build a new one.
            active._tunnel = None;
            let (tunnel, config) = self.route(&active.origin).await?;
            active.client = Arc::new(pg::open(&config).await?.client);
            active.config = config;
            active._tunnel = tunnel;
            // The new session lost open transactions, SET, temporary tables, etc.
            let _ = self.app.emit("connection-restored", ());
        }
        Ok(active.client.clone())
    }

    /// Counts rows on a connection of its own: the server handles one query at a time per connection, so
    /// counting on the shared one would hold up the user's queries until count(*) finishes. Starting a new
    /// count cancels the previous one.
    pub async fn count_rows(&self, schema: &str, table: &str) -> CmdResult<u64> {
        let config = {
            let active = self.active.lock().await;
            active.as_ref().map(|a| a.config.clone()).ok_or_else(|| "Not connected".to_string())?
        };
        let session = Arc::new(pg::open(&config).await?);
        if let Some(previous) = self.counting.lock().await.replace(session.clone()) {
            tauri::async_runtime::spawn(async move { previous.cancel().await });
        }

        let total = pg::table_count(&session.client, schema, table).await;

        let mut counting = self.counting.lock().await;
        if counting.as_ref().is_some_and(|c| Arc::ptr_eq(c, &session)) {
            *counting = None; // done: release the connection
        }
        total
    }

    /// Interrupts, without waiting, the count in progress (if any).
    async fn cancel_counting(&self) {
        if let Some(session) = self.counting.lock().await.take() {
            tauri::async_runtime::spawn(async move { session.cancel().await });
        }
    }
}
