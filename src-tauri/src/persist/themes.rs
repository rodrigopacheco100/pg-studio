//! Themes the user imported: one JSON file each in the `styles` folder of the app data directory.
//! The frontend validates and interprets them (`src/lib/theme.ts`); this only stores the text.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// A theme file is a few dozen colors; anything much bigger is not one.
const MAX_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
pub struct StoredTheme {
    pub id: String,
    pub content: String,
}

pub struct ThemeFiles {
    dir: PathBuf,
}

/// Ids become file names, so only a slug is accepted (no separators, dots or empty names).
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl ThemeFiles {
    pub fn open(dir: PathBuf) -> Result<Self, std::io::Error> {
        fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    fn path(&self, id: &str) -> Result<PathBuf, String> {
        if valid_id(id) { Ok(self.dir.join(format!("{id}.json"))) } else { Err(format!("Invalid theme id: {id}")) }
    }

    /// Every readable theme file; files that are not valid UTF-8 JSON are skipped.
    pub fn list(&self) -> Vec<StoredTheme> {
        let Ok(entries) = fs::read_dir(&self.dir) else { return Vec::new() };
        let mut themes: Vec<StoredTheme> = entries
            .filter_map(|entry| {
                let path = entry.ok()?.path();
                if path.extension()? != "json" {
                    return None;
                }
                let id = path.file_stem()?.to_str()?.to_string();
                let content = fs::read_to_string(&path).ok()?;
                (valid_id(&id) && serde_json::from_str::<serde_json::Value>(&content).is_ok()).then_some(StoredTheme { id, content })
            })
            .collect();
        themes.sort_by(|a, b| a.id.cmp(&b.id));
        themes
    }

    /// Writes (or replaces) a theme; `content` must be a JSON object of a reasonable size.
    pub fn save(&self, id: &str, content: &str) -> Result<(), String> {
        let path = self.path(id)?;
        if content.len() > MAX_BYTES {
            return Err("The theme file is too large.".into());
        }
        if !serde_json::from_str::<serde_json::Value>(content).map_or(false, |v| v.is_object()) {
            return Err("A theme is a JSON object.".into());
        }
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, content).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        match fs::remove_file(self.path(id)?) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> ThemeFiles {
        let dir = std::env::temp_dir().join(format!("pg-studio-themes-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&dir);
        ThemeFiles::open(dir).unwrap()
    }

    #[test]
    fn saves_lists_and_deletes() {
        let files = files();
        files.save("midnight", r#"{"name":"Midnight"}"#).unwrap();
        files.save("midnight", r#"{"name":"Midnight 2"}"#).unwrap(); // replaces
        fs::write(files.dir.join("broken.json"), "{").unwrap(); // skipped
        let listed = files.list();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "midnight");
        assert!(listed[0].content.contains("Midnight 2"));
        files.delete("midnight").unwrap();
        files.delete("midnight").unwrap(); // already gone: fine
        assert!(files.list().is_empty());
    }

    #[test]
    fn refuses_ids_that_could_leave_the_folder() {
        let files = files();
        for id in ["", "../x", "a/b", "A", "a.b", &"x".repeat(41)] {
            assert!(files.save(id, "{}").is_err(), "{id}");
            assert!(files.delete(id).is_err(), "{id}");
        }
    }

    #[test]
    fn refuses_content_that_is_not_a_theme_object() {
        let files = files();
        assert!(files.save("a", "[1]").is_err());
        assert!(files.save("a", "nope").is_err());
        assert!(files.save("a", &format!("{{\"x\":\"{}\"}}", "y".repeat(70_000))).is_err());
    }
}
