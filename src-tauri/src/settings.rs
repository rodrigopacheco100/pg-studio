//! Program settings, persisted in `settings.json` in the app data directory.
//! Sole owner of the file: the rest of the backend and the frontend only go through the store.

use crate::json_store::JsonStore;
use serde::{Deserialize, Serialize};

/// Missing or invalid fields in the file fall back to the default values.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub sidebar_width: u32,
    pub editor_height: u32,
    /// Font ids, resolved by the frontend (`src/lib/fonts.ts`).
    pub ui_font: String,
    pub editor_font: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self { sidebar_width: 256, editor_height: 300, ui_font: "roboto".into(), editor_font: "system-mono".into() }
    }
}

pub type SettingsStore = JsonStore<Settings>;
