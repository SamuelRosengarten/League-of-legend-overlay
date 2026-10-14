//! User settings persisted as JSON in the app config dir
//! (`%APPDATA%\dev.rosengarten.riftadvisor\settings.json`). Missing fields fall back to defaults,
//! so the file can be edited by hand.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::geometry::Edge;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub hotkeys: Hotkeys,
    /// Override if League is not installed in `C:\Riot Games\League of Legends`.
    pub league_install_dir: Option<String>,
    /// Remembered top-left window positions (physical px) per overlay mode.
    pub positions: BTreeMap<String, SavedPosition>,
    /// Screen edge the in-game panel is docked to.
    pub dock: Edge,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Hotkeys {
    pub toggle_visibility: String,
    pub toggle_interactive: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SavedPosition {
    pub x: i32,
    pub y: i32,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self { toggle_visibility: "Ctrl+Shift+A".into(), toggle_interactive: "Ctrl+Shift+Z".into() }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self { hotkeys: Hotkeys::default(), league_install_dir: None, positions: BTreeMap::new(), dock: Edge::Right }
    }
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    let Some(path) = path(app) else { return Settings::default() };
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
            log::warn!("invalid {}: {e} — using defaults", path.display());
            Settings::default()
        }),
        Err(_) => {
            let defaults = Settings::default();
            save(app, &defaults);
            defaults
        }
    }
}

pub fn save(app: &AppHandle, settings: &Settings) {
    let Some(path) = path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = std::fs::write(&path, serde_json::to_string_pretty(settings).unwrap_or_default()) {
        log::warn!("could not save {}: {e}", path.display());
    }
}
