//! Opening a connection (plain or TLS) and cancelling its running query.

use super::error::error_text;
use crate::storage::connections::ConnectionConfig;
use postgres_native_tls::MakeTlsConnector;
use std::time::Duration;
use tokio_postgres::{CancelToken, Client, Config, NoTls};

/// Connection with the token that allows cancelling the running query.
pub struct Session {
    pub client: Client,
    token: CancelToken,
    tls: Option<MakeTlsConnector>,
}

impl Session {
    /// Asks the server to interrupt the query running on this connection.
    pub async fn cancel(&self) {
        let _ = match &self.tls {
            Some(tls) => self.token.cancel_query(tls.clone()).await,
            None => self.token.cancel_query(NoTls).await,
        };
    }
}

pub async fn open(c: &ConnectionConfig) -> Result<Session, String> {
    let mut cfg = Config::new();
    cfg.host(&c.host)
        .port(c.port)
        .dbname(&c.database)
        .user(&c.user)
        .password(&c.password)
        .connect_timeout(Duration::from_secs(10))
        // TCP's default is to probe after 2 h of idleness; networks and proxies drop idle
        // connections well before that. Probing every 30 s keeps the connection alive and reveals drops early.
        .keepalives(true)
        .keepalives_idle(Duration::from_secs(30));

    if c.ssl {
        // Equivalent to libpq's sslmode=require: encrypts, but does not validate the certificate.
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;
        let tls = MakeTlsConnector::new(tls);
        let (client, conn) = cfg.connect(tls.clone()).await.map_err(|e| error_text(&e, None))?;
        tauri::async_runtime::spawn(async move {
            let _ = conn.await;
        });
        Ok(Session { token: client.cancel_token(), client, tls: Some(tls) })
    } else {
        let (client, conn) = cfg.connect(NoTls).await.map_err(|e| error_text(&e, None))?;
        tauri::async_runtime::spawn(async move {
            let _ = conn.await;
        });
        Ok(Session { token: client.cancel_token(), client, tls: None })
    }
}
