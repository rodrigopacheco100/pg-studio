//! SSH servers the app has connected to, with the key fingerprint each presented.

use crate::persist::JsonStore;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Fingerprints of the SSH servers seen so far (`host:port` -> `SHA256:...`), persisted in `known_hosts.json`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
struct Trusted {
    hosts: BTreeMap<String, String>,
}

#[derive(Serialize)]
pub struct KnownHost {
    pub server: String,
    pub fingerprint: String,
}

/// Trust on first use: the first key a server presents is remembered, and a different one later is
/// refused (it may be a man-in-the-middle). A legitimately changed key is accepted again after the
/// entry is forgotten (Settings › Security).
#[derive(Clone)]
pub struct KnownHosts(Arc<Mutex<JsonStore<Trusted>>>);

impl KnownHosts {
    pub fn load(path: PathBuf) -> Self {
        Self(Arc::new(Mutex::new(JsonStore::load(path))))
    }

    pub fn list(&self) -> Result<Vec<KnownHost>, String> {
        let trusted = self.0.lock().map_err(|e| e.to_string())?.get();
        Ok(trusted.hosts.into_iter().map(|(server, fingerprint)| KnownHost { server, fingerprint }).collect())
    }

    pub fn forget(&self, server: &str) -> Result<(), String> {
        let mut store = self.0.lock().map_err(|e| e.to_string())?;
        let mut trusted = store.get();
        trusted.hosts.remove(server);
        store.set(trusted)
    }

    pub(crate) fn check(&self, server: &str, fingerprint: &str) -> Result<(), String> {
        let mut store = self.0.lock().map_err(|e| e.to_string())?;
        let mut trusted = store.get();
        match trusted.hosts.get(server) {
            Some(known) if known == fingerprint => Ok(()),
            Some(known) => Err(format!(
                "The SSH server key of {server} changed (expected {known}, got {fingerprint}). \
                 This may be an attack. If the change is legitimate, forget the server in Settings › Security and connect again."
            )),
            None => {
                trusted.hosts.insert(server.to_string(), fingerprint.to_string());
                store.set(trusted)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusts_first_key_and_refuses_a_different_one() {
        let path = std::env::temp_dir().join(format!("pg-studio-known-hosts-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let hosts = KnownHosts::load(path.clone());
        assert!(hosts.check("db:22", "SHA256:aaa").is_ok());
        assert!(hosts.check("db:22", "SHA256:aaa").is_ok());
        assert!(hosts.check("db:22", "SHA256:bbb").unwrap_err().contains("changed"));
        assert!(hosts.check("other:22", "SHA256:bbb").is_ok());
        assert!(KnownHosts::load(path.clone()).check("db:22", "SHA256:bbb").is_err()); // persisted
        hosts.forget("db:22").unwrap();
        assert!(hosts.check("db:22", "SHA256:bbb").is_ok()); // accepted again after forgetting
        assert_eq!(hosts.list().unwrap().len(), 2);
        let _ = std::fs::remove_file(path);
    }
}
