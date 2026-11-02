//! Program settings, persisted in `settings.json` in the app data directory.
//! Sole owner of the file: the rest of the backend and the frontend only go through `SettingsStore`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Missing or invalid fields in the file fall back to the default values.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub sidebar_width: u32,
    pub editor_height: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self { sidebar_width: 256, editor_height: 300 }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Settings,
}

impl SettingsStore {
    /// A missing or corrupted file does not stop the app from opening: it uses the defaults.
    pub fn load(path: PathBuf) -> Self {
        let current = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self { path, current }
    }

    pub fn get(&self) -> Settings {
        self.current.clone()
    }

    /// Writes to a temporary file and renames it, so a crash midway does not corrupt the JSON.
    pub fn set(&mut self, settings: Settings) -> Result<(), String> {
        if settings == self.current {
            return Ok(());
        }
        let json = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())?;
        self.current = settings;
        Ok(())
    }
}
