//! User settings persisted as JSON in the app config dir
//! (`%APPDATA%\dev.rosengarten.riftadvisor\settings.json`). Missing fields fall back to defaults,
//! so the file can be edited by hand.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::geometry::Edge;
use crate::ranked::RankInfo;

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
    /// Theme, companions and motion (edited from the overlay's Appearance view).
    pub appearance: Appearance,
    /// Last rank the client reported; themes the overlay while the client is closed.
    pub last_rank: Option<RankInfo>,
}

/// Visual preferences. Values are validated by the frontend, which owns the option lists
/// (`src/theme/`); unknown values fall back to defaults there.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Appearance {
    /// "auto" (current rank from the client) or a tier id ("iron" … "challenger", "unranked").
    pub theme: String,
    /// "full" | "calm" | "off" — "off" also applies when Windows asks for reduced motion.
    pub motion: String,
    pub companions: Companions,
    /// Overlay zoom (text, icons and window size together), 0.8 – 1.5.
    pub scale: f64,
    /// In game, snap the panel to the nearest left/right screen edge after a drag.
    /// Off: the panel stays exactly where it is dropped.
    pub snap_to_edge: bool,
    /// Outside of champ select and games, stick the panel to the side of the League client
    /// window (same height) and show it only while the client is the active window.
    pub dock_to_client: bool,
}

pub const SCALE_MIN: f64 = 0.8;
pub const SCALE_MAX: f64 = 1.5;

impl Appearance {
    /// The file can be edited by hand; keep the zoom in a usable range.
    pub fn zoom(&self) -> f64 {
        if self.scale.is_finite() {
            self.scale.clamp(SCALE_MIN, SCALE_MAX)
        } else {
            1.0
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Companions {
    pub gwen: bool,
    pub amumu: bool,
    pub fiddlesticks: bool,
    /// Placement preset id, e.g. "top", "corners", "bottom", "left", "right", "hanging", "minimal".
    pub placement: String,
    /// Scale factor, 0.7 – 1.4.
    pub size: f64,
    /// Keep them visible on the in-game panel.
    pub in_game: bool,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: "auto".into(),
            motion: "full".into(),
            companions: Companions::default(),
            scale: 1.0,
            snap_to_edge: false,
            dock_to_client: true,
        }
    }
}

impl Default for Companions {
    fn default() -> Self {
        Self { gwen: true, amumu: true, fiddlesticks: true, placement: "corners".into(), size: 1.0, in_game: true }
    }
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
        Self {
            hotkeys: Hotkeys::default(),
            league_install_dir: None,
            positions: BTreeMap::new(),
            dock: Edge::Right,
            appearance: Appearance::default(),
            last_rank: None,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hand_edited_partial_file_keeps_defaults_for_missing_fields() {
        let s: Settings = serde_json::from_str(r#"{ "hotkeys": { "toggleVisibility": "Alt+F9" }, "leagueInstallDir": "D:/Games/League" }"#).unwrap();
        assert_eq!(s.hotkeys.toggle_visibility, "Alt+F9");
        assert_eq!(s.hotkeys.toggle_interactive, "Ctrl+Shift+Z");
        assert_eq!(s.league_install_dir.as_deref(), Some("D:/Games/League"));
        assert_eq!(s.dock, Edge::Right);
        assert_eq!(s.appearance, Appearance::default());
    }

    #[test]
    fn partial_appearance_keeps_other_defaults() {
        let s: Settings = serde_json::from_str(r#"{ "appearance": { "theme": "gold", "companions": { "amumu": false } } }"#).unwrap();
        assert_eq!(s.appearance.theme, "gold");
        assert_eq!(s.appearance.motion, "full");
        assert!(s.appearance.companions.gwen && !s.appearance.companions.amumu);
        assert_eq!(s.appearance.companions.placement, "corners");
        assert_eq!(s.appearance.scale, 1.0);
        assert!(!s.appearance.snap_to_edge);
    }

    #[test]
    fn zoom_is_clamped() {
        let zoom = |scale| Appearance { scale, ..Appearance::default() }.zoom();
        assert_eq!(zoom(1.25), 1.25);
        assert_eq!(zoom(9.0), SCALE_MAX);
        assert_eq!(zoom(0.1), SCALE_MIN);
        assert_eq!(zoom(f64::NAN), 1.0);
    }

    #[test]
    fn round_trips_through_json() {
        let mut s = Settings::default();
        s.positions.insert("in-game".into(), SavedPosition { x: -1920, y: 40 });
        s.dock = Edge::Left;
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }
}
