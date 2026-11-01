//! Configurações do programa, persistidas em `settings.json` no diretório de dados do app.
//! Único dono do arquivo: o restante do backend e o frontend só passam por `SettingsStore`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Campos ausentes ou inválidos no arquivo caem nos valores padrão.
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
    /// Um arquivo ausente ou corrompido não impede o app de abrir: usa os padrões.
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

    /// Grava em arquivo temporário e renomeia, para uma queda no meio não corromper o JSON.
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
