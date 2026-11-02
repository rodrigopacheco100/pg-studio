//! A value persisted as a JSON file in the app data directory.

use serde::{de::DeserializeOwned, Serialize};
use std::path::PathBuf;

pub struct JsonStore<T> {
    path: PathBuf,
    current: T,
}

impl<T: Serialize + DeserializeOwned + Default + Clone + PartialEq> JsonStore<T> {
    /// A missing or corrupted file does not stop the app from opening: it starts from the defaults.
    pub fn load(path: PathBuf) -> Self {
        let current = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self { path, current }
    }

    pub fn get(&self) -> T {
        self.current.clone()
    }

    /// Writes to a temporary file and renames it, so a crash midway does not corrupt the JSON.
    pub fn set(&mut self, value: T) -> Result<(), String> {
        if value == self.current {
            return Ok(());
        }
        let json = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())?;
        self.current = value;
        Ok(())
    }
}
