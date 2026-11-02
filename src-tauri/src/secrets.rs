//! Connection passwords. Stored in the OS credential store when there is one; otherwise in `vault.json`,
//! encrypted with a key derived from a master password (Argon2id + ChaCha20-Poly1305). The derived key
//! only lives in memory, after `create` / `unlock`.

use crate::persist::JsonStore;
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{aead::Aead, ChaCha20Poly1305, Key, KeyInit, Nonce};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const KEYRING_SERVICE: &str = "pg-studio";
/// Encrypted with the key when the vault is created; decrypting it proves the master password.
const CHECK: &[u8] = b"pg-studio-vault";

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
mod keychain {
    fn entry(name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(super::KEYRING_SERVICE, name).map_err(|e| e.to_string())
    }
    pub fn get(key: &str) -> Option<String> {
        entry(key).ok()?.get_password().ok()
    }
    pub fn set(key: &str, password: &str) -> Result<(), String> {
        entry(key)?
            .set_password(password)
            .map_err(|e| format!("Could not store the password in the system keychain: {e}"))
    }
    pub fn remove(key: &str) {
        if let Ok(e) = entry(key) {
            let _ = e.delete_credential();
        }
    }
    /// Writes and deletes a throwaway credential; fails where no credential store is running.
    pub fn probe() -> Result<(), String> {
        let e = entry("probe")?;
        e.set_password("probe").map_err(|e| e.to_string())?;
        let _ = e.delete_credential();
        Ok(())
    }
}
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod keychain {
    pub fn get(_: &str) -> Option<String> { None }
    pub fn set(_: &str, _: &str) -> Result<(), String> { Err("No system keychain on this platform".into()) }
    pub fn remove(_: &str) {}
    pub fn probe() -> Result<(), String> { Err("No system keychain on this platform".into()) }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct VaultFile {
    /// Base64 salt of the key derivation; empty = vault not created yet.
    salt: String,
    check: String,
    /// Secret name (e.g. `connection-3`) -> base64(nonce || ciphertext).
    entries: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// `None` when the system keychain works, otherwise why it does not.
    keychain_problem: Option<String>,
    /// `none` (not created), `locked` or `unlocked`; only meaningful without a keychain.
    vault: &'static str,
}

pub struct Secrets {
    keychain: OnceLock<Option<String>>,
    file: Mutex<JsonStore<VaultFile>>,
    key: Mutex<Option<[u8; 32]>>,
    /// Last time the vault key was used, for the idle auto-lock.
    used: Mutex<Instant>,
}

impl Secrets {
    pub fn load(path: PathBuf) -> Self {
        Self { keychain: OnceLock::new(), file: Mutex::new(JsonStore::load(path)), key: Mutex::new(None), used: Mutex::new(Instant::now()) }
    }

    /// Probed once per run.
    fn keychain_problem(&self) -> Option<String> {
        self.keychain.get_or_init(|| keychain::probe().err()).clone()
    }

    pub fn status(&self) -> Status {
        let vault = if self.file.lock().unwrap().get().salt.is_empty() {
            "none"
        } else if self.key.lock().unwrap().is_some() {
            "unlocked"
        } else {
            "locked"
        };
        Status { keychain_problem: self.keychain_problem(), vault }
    }

    pub fn get(&self, name: &str) -> Option<String> {
        if self.keychain_problem().is_none() {
            return keychain::get(name);
        }
        let key = self.key_in_use()?;
        let blob = self.file.lock().unwrap().get().entries.get(name)?.clone();
        decrypt(&key, &blob).and_then(|b| String::from_utf8(b).ok())
    }

    pub fn set(&self, name: &str, password: &str) -> Result<(), String> {
        if self.keychain_problem().is_none() {
            return keychain::set(name, password);
        }
        let key = self.key_in_use().ok_or("The password vault is locked")?;
        let mut file = self.file.lock().unwrap();
        let mut value = file.get();
        value.entries.insert(name.to_string(), encrypt(&key, password.as_bytes())?);
        file.set(value)
    }

    pub fn remove(&self, name: &str) {
        if self.keychain_problem().is_none() {
            keychain::remove(name);
        }
        let mut file = self.file.lock().unwrap();
        let mut value = file.get();
        if value.entries.remove(name).is_some() {
            let _ = file.set(value);
        }
    }

    /// The vault key, if unlocked; counts as use for the idle auto-lock.
    fn key_in_use(&self) -> Option<[u8; 32]> {
        let key = *self.key.lock().unwrap();
        if key.is_some() {
            *self.used.lock().unwrap() = Instant::now();
        }
        key
    }

    /// Forgets the vault key if it has not been used for `idle`; the master password is asked again.
    pub fn lock_if_idle(&self, idle: Duration) {
        if self.used.lock().unwrap().elapsed() >= idle {
            *self.key.lock().unwrap() = None;
        }
    }

    /// First use without a keychain: sets the master password and leaves the vault unlocked.
    pub fn create(&self, master: &str) -> Result<(), String> {
        if master.is_empty() {
            return Err("The master password cannot be empty".into());
        }
        let mut file = self.file.lock().unwrap();
        if !file.get().salt.is_empty() {
            return Err("The vault already exists".into());
        }
        let mut salt = [0u8; 16];
        getrandom::getrandom(&mut salt).map_err(|e| e.to_string())?;
        let key = derive(master, &salt)?;
        file.set(VaultFile { salt: B64.encode(salt), check: encrypt(&key, CHECK)?, entries: BTreeMap::new() })?;
        *self.key.lock().unwrap() = Some(key);
        *self.used.lock().unwrap() = Instant::now();
        Ok(())
    }

    pub fn unlock(&self, master: &str) -> Result<(), String> {
        let value = self.file.lock().unwrap().get();
        let salt = B64.decode(&value.salt).map_err(|_| "The vault has not been created")?;
        let key = derive(master, &salt)?;
        if decrypt(&key, &value.check).as_deref() != Some(CHECK) {
            return Err("Wrong master password".into());
        }
        *self.key.lock().unwrap() = Some(key);
        *self.used.lock().unwrap() = Instant::now();
        self.rename_legacy_entries()
    }

    /// Early vaults named entries by the bare connection id (`5`); they are now `connection-5`.
    fn rename_legacy_entries(&self) -> Result<(), String> {
        let mut file = self.file.lock().unwrap();
        let mut value = file.get();
        let legacy: Vec<String> = value.entries.keys().filter(|k| k.parse::<i64>().is_ok()).cloned().collect();
        for old in legacy {
            if let Some(blob) = value.entries.remove(&old) {
                value.entries.entry(format!("connection-{old}")).or_insert(blob);
            }
        }
        file.set(value)
    }
}

fn derive(master: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default().hash_password_into(master.as_bytes(), salt, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt(key: &[u8; 32], plain: &[u8]) -> Result<String, String> {
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let mut blob = nonce.to_vec();
    blob.extend(cipher.encrypt(Nonce::from_slice(&nonce), plain).map_err(|e| e.to_string())?);
    Ok(B64.encode(blob))
}

fn decrypt(key: &[u8; 32], blob: &str) -> Option<Vec<u8>> {
    let blob = B64.decode(blob).ok()?;
    if blob.len() < 12 {
        return None;
    }
    let (nonce, cipher_text) = blob.split_at(12);
    ChaCha20Poly1305::new(Key::from_slice(key)).decrypt(Nonce::from_slice(nonce), cipher_text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlock_renames_entries_named_by_bare_id() {
        let path = std::env::temp_dir().join(format!("pg-studio-vault-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let secrets = Secrets::load(path.clone());
        secrets.create("master").unwrap();
        let key = secrets.key_in_use().unwrap();
        let blob = encrypt(&key, b"pw").unwrap();
        {
            let mut file = secrets.file.lock().unwrap();
            let mut value = file.get();
            value.entries.insert("7".into(), blob);
            file.set(value).unwrap();
        }
        let reopened = Secrets::load(path.clone());
        reopened.unlock("master").unwrap();
        assert!(reopened.keychain.set(Some("test".into())).is_ok()); // force the vault path (no keychain)
        assert_eq!(reopened.get("connection-7").as_deref(), Some("pw"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn encrypts_and_rejects_wrong_key() {
        let key = derive("master", b"0123456789abcdef").unwrap();
        let blob = encrypt(&key, b"secret").unwrap();
        assert_eq!(decrypt(&key, &blob).as_deref(), Some(&b"secret"[..]));
        let other = derive("other", b"0123456789abcdef").unwrap();
        assert!(decrypt(&other, &blob).is_none());
    }
}
