//! Program settings, persisted in `settings.json` in the app data directory.
//! Sole owner of the file: the rest of the backend and the frontend only go through the store.

use serde::{Deserialize, Serialize};

/// Missing or invalid fields in the file fall back to the default values.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub sidebar_width: u32,
    pub editor_height: u32,
    /// `dark`, `light` or `system`.
    pub theme: String,
    /// Font ids, resolved by the frontend (`src/lib/fonts.ts`).
    pub ui_font: String,
    pub editor_font: String,
    /// Interface base size and editor text size, in px.
    pub ui_font_size: u32,
    pub editor_font_size: u32,
    pub tab_size: u32,
    pub line_numbers: bool,
    /// Keyword case of the formatter: `upper`, `lower` or `preserve`.
    pub keyword_case: String,
    /// Rows per page in the results.
    pub page_size: u32,
    /// `statement_timeout` of the sessions, in seconds; 0 = no limit.
    pub statement_timeout_seconds: u32,
    /// Ask before running DROP, TRUNCATE, or DELETE / UPDATE without WHERE.
    pub confirm_destructive: bool,
    /// Reconnect to the last active connection when the app starts.
    pub restore_connection: bool,
    /// Lock the master-password vault after this many idle minutes; 0 = never.
    pub vault_auto_lock_minutes: u32,
    /// Ask before closing a tab with unsaved changes.
    pub confirm_close_dirty: bool,
    /// Look for a new version when the app starts.
    pub check_for_updates: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sidebar_width: 256,
            editor_height: 300,
            theme: "dark".into(),
            ui_font: "roboto".into(),
            editor_font: "system-mono".into(),
            ui_font_size: 16,
            editor_font_size: 13,
            tab_size: 2,
            line_numbers: true,
            keyword_case: "upper".into(),
            page_size: 100,
            statement_timeout_seconds: 0,
            confirm_destructive: true,
            restore_connection: true,
            vault_auto_lock_minutes: 0,
            confirm_close_dirty: true,
            check_for_updates: true,
        }
    }
}
