//! SSH tunnel to the PostgreSQL server: authenticates with russh and forwards a local port on
//! 127.0.0.1 to the database host through the SSH server (like `ssh -L`).

use crate::known_hosts::KnownHosts;
use crate::storage::connections::ConnectionConfig;
use russh::client::{self, Handle};
use russh::keys::{agent::client::AgentClient, ssh_key::HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;

struct Verifier {
    hosts: KnownHosts,
    server: String,
    /// Why the key was refused, to report instead of the generic error.
    refusal: Arc<Mutex<Option<String>>>,
}

impl client::Handler for Verifier {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let PublicKeyOrCertificate::PublicKey { key, .. } = key else {
            *self.refusal.lock().unwrap() = Some("SSH host certificates are not supported".into());
            return Ok(false);
        };
        match self.hosts.check(&self.server, &key.fingerprint(HashAlg::Sha256).to_string()) {
            Ok(()) => Ok(true),
            Err(reason) => {
                *self.refusal.lock().unwrap() = Some(reason);
                Ok(false)
            }
        }
    }
}

/// A live tunnel. Dropping it closes the local port and the SSH session.
pub struct Tunnel {
    pub local_port: u16,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn expand_home(path: &str) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(|home| PathBuf::from(home).join(rest))
            .unwrap_or_else(|| PathBuf::from(path)),
        None => PathBuf::from(path),
    }
}

async fn authenticate(handle: &mut Handle<Verifier>, c: &ConnectionConfig) -> Result<(), String> {
    let user = c.ssh_user.clone();
    let accepted = match c.ssh_auth.as_str() {
        "password" => handle.authenticate_password(user, &c.ssh_secret).await.map_err(|e| e.to_string())?.success(),
        "agent" => {
            #[cfg(unix)]
            let agent = AgentClient::connect_env().await;
            #[cfg(windows)]
            let agent = AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await;
            let mut agent = agent.map_err(|e| format!("Could not reach the SSH agent: {e}"))?;
            let identities = agent.request_identities().await.map_err(|e| format!("SSH agent: {e}"))?;
            if identities.is_empty() {
                return Err("The SSH agent has no keys loaded (ssh-add)".into());
            }
            let mut ok = false;
            for identity in identities {
                let public = identity.public_key().into_owned();
                let hash = handle.best_supported_rsa_hash().await.map_err(|e| e.to_string())?.flatten();
                let result = handle.authenticate_publickey_with(user.clone(), public, hash, &mut agent).await;
                if result.map_err(|e| e.to_string())?.success() {
                    ok = true;
                    break;
                }
            }
            ok
        }
        _ => {
            let passphrase = (!c.ssh_secret.is_empty()).then_some(c.ssh_secret.as_str());
            let key = russh::keys::load_secret_key(expand_home(&c.ssh_key_path), passphrase)
                .map_err(|e| format!("Could not load the SSH key: {e}"))?;
            let hash = handle.best_supported_rsa_hash().await.map_err(|e| e.to_string())?.flatten();
            handle
                .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await
                .map_err(|e| e.to_string())?
                .success()
        }
    };
    if accepted { Ok(()) } else { Err("The SSH server rejected the credentials".into()) }
}

/// Opens the tunnel for `c` (which must have `ssh_enabled`) to `c.host:c.port`.
pub async fn open(c: &ConnectionConfig, hosts: &KnownHosts) -> Result<Tunnel, String> {
    let server = format!("{}:{}", c.ssh_host, c.ssh_port);
    let refusal = Arc::new(Mutex::new(None));
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    });
    let verifier = Verifier { hosts: hosts.clone(), server: server.clone(), refusal: refusal.clone() };
    let connecting = client::connect(config, (c.ssh_host.as_str(), c.ssh_port), verifier);
    let mut handle = match tokio::time::timeout(Duration::from_secs(10), connecting).await {
        Err(_) => return Err(format!("Timed out connecting to the SSH server {server}")),
        Ok(Err(e)) => {
            let reason = refusal.lock().unwrap().take();
            return Err(reason.unwrap_or_else(|| format!("SSH connection to {server} failed: {e}")));
        }
        Ok(Ok(handle)) => handle,
    };
    authenticate(&mut handle, c).await?;

    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| e.to_string())?;
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (host, port) = (c.host.clone(), c.port as u32);
    let task = tauri::async_runtime::spawn(async move {
        // The task owns the SSH session: aborting it (dropping the Tunnel) tears everything down.
        while let Ok((mut socket, _)) = listener.accept().await {
            match handle.channel_open_direct_tcpip(host.clone(), port, "127.0.0.1", 0).await {
                Ok(channel) => {
                    tauri::async_runtime::spawn(async move {
                        let mut remote = channel.into_stream();
                        let _ = tokio::io::copy_bidirectional(&mut socket, &mut remote).await;
                    });
                }
                Err(_) => break, // the SSH session is gone; the next connect builds a new tunnel
            }
        }
    });
    Ok(Tunnel { local_port, task })
}
