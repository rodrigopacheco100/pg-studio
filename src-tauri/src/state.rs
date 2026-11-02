//! Application state shared by the commands.

use crate::pg;
use crate::persist::{session::Session, settings::Settings, themes::ThemeFiles, JsonStore};
use crate::secrets::Secrets;
use crate::storage::{self, connections::ConnectionConfig};
use crate::known_hosts::KnownHosts;
use crate::tunnel::{self, Tunnel};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::Mutex as AsyncMutex;
use tokio_postgres::Client;

pub type CmdResult<T> = Result<T, String>;

/// Tells the frontend something happened (an event name, no payload).
pub type Notifier = Box<dyn Fn(&str) + Send + Sync>;

/// Active connection and the config used to open it (the background count opens its own).
pub struct Active {
    /// The connection with the means to cancel its running query.
    session: Arc<pg::Session>,
    /// What `pg::open` connects with: `origin`, with host and port pointing at the tunnel when there is one.
    config: ConnectionConfig,
    /// The connection as saved (plus the secrets typed for this session), to rebuild the tunnel on reconnect.
    origin: ConnectionConfig,
    /// Kept alive for as long as the connection is active.
    _tunnel: Option<Tunnel>,
}

pub struct AppState {
    notify: Notifier,
    store: Mutex<rusqlite::Connection>,
    pub secrets: Arc<Secrets>,
    pub known_hosts: KnownHosts,
    settings: Mutex<JsonStore<Settings>>,
    session: Mutex<JsonStore<Session>>,
    pub themes: ThemeFiles,
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
    pub fn open(notify: Notifier, dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let state = Self {
            notify,
            store: Mutex::new(storage::open(&dir.join("pg-studio.sqlite"))?),
            secrets: Arc::new(Secrets::load(dir.join("vault.json"))),
            known_hosts: KnownHosts::load(dir.join("known_hosts.json")),
            settings: Mutex::new(JsonStore::load(dir.join("settings.json"))),
            session: Mutex::new(JsonStore::load(dir.join("session.json"))),
            themes: ThemeFiles::open(dir.join("styles"))?,
            active: AsyncMutex::new(None),
            counting: AsyncMutex::new(None),
        };
        let _ = state.migrate_passwords();
        Ok(state)
    }

    /// Locks the master-password vault after the configured idle time. Call once, after the state is managed.
    pub fn watch_vault_idle<R: Runtime>(app: &AppHandle<R>) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(30)).await;
                let state = app.state::<AppState>();
                let minutes = state.settings().map(|s| s.get().vault_auto_lock_minutes).unwrap_or(0);
                if minutes > 0 {
                    state.secrets.lock_if_idle(Duration::from_secs(u64::from(minutes) * 60));
                }
            }
        });
    }

    /// Opens a session with the configured `statement_timeout`.
    async fn open_session(&self, config: &ConnectionConfig) -> CmdResult<pg::Session> {
        let session = pg::open(config).await?;
        pg::set_statement_timeout(&session.client, self.statement_timeout_seconds()).await?;
        Ok(session)
    }

    fn statement_timeout_seconds(&self) -> u32 {
        self.settings().map(|s| s.get().statement_timeout_seconds).unwrap_or(0)
    }

    /// Applies the current `statement_timeout` setting to the active connection (after the setting changed).
    pub async fn apply_statement_timeout(&self) -> CmdResult<()> {
        let client = match self.active.lock().await.as_ref() {
            Some(active) => active.session.client.clone(),
            None => return Ok(()),
        };
        pg::set_statement_timeout(&client, self.statement_timeout_seconds()).await
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
        let session = Arc::new(self.open_session(&config).await?);
        let tables = pg::list_tables(&session.client).await?;
        self.cancel_counting().await;
        *self.active.lock().await = Some(Active { session, config, origin, _tunnel: tunnel });
        Ok(tables)
    }

    /// Asks the server to interrupt the query running on the main connection (no-op if there is none).
    pub async fn cancel_query(&self) {
        let session = self.active.lock().await.as_ref().map(|a| a.session.clone());
        if let Some(session) = session {
            session.cancel().await;
        }
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
        if active.session.client.is_closed() {
            // A dropped connection may mean a dropped tunnel too: build a new one.
            active._tunnel = None;
            let (tunnel, config) = self.route(&active.origin).await?;
            active.session = Arc::new(self.open_session(&config).await?);
            active.config = config;
            active._tunnel = tunnel;
            // The new session lost open transactions, SET, temporary tables, etc.
            (self.notify)("connection-restored");
        }
        Ok(active.session.client.clone())
    }

    /// Counts rows on a connection of its own: the server handles one query at a time per connection, so
    /// counting on the shared one would hold up the user's queries until count(*) finishes. Starting a new
    /// count cancels the previous one.
    pub async fn count_rows(&self, schema: &str, table: &str, view: &pg::GridQuery) -> CmdResult<u64> {
        let config = {
            let active = self.active.lock().await;
            active.as_ref().map(|a| a.config.clone()).ok_or_else(|| "Not connected".to_string())?
        };
        let session = Arc::new(self.open_session(&config).await?);
        if let Some(previous) = self.counting.lock().await.replace(session.clone()) {
            tauri::async_runtime::spawn(async move { previous.cancel().await });
        }

        let total = pg::table_count(&session.client, schema, table, view).await;

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
