//! Single source of truth for what the frontend sees. Connectors (real or mock) call the
//! `set_*` functions; each one updates the snapshot and emits a typed event only on change.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::overlay::{self, OverlayState};
use crate::ranked::RankInfo;
use crate::settings::{self, Appearance, Settings};
use crate::types::{ChampSelectSession, ConnectionStatus, LiveGame, LiveStatus};

pub mod events {
    pub const CONNECTION: &str = "rift:connection";
    pub const PHASE: &str = "rift:phase";
    pub const CHAMP_SELECT: &str = "rift:champ-select";
    pub const LIVE: &str = "rift:live";
    pub const OVERLAY: &str = "rift:overlay";
    pub const MOCK: &str = "rift:mock";
    pub const DDRAGON: &str = "rift:ddragon";
    pub const RANK: &str = "rift:rank";
    pub const APPEARANCE: &str = "rift:appearance";
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mock: bool,
    pub connection: ConnectionStatus,
    /// Raw LCU gameflow phase ("None", "Lobby", "ChampSelect", "InProgress", "EndOfGame", ...).
    pub phase: String,
    pub champ_select: Option<ChampSelectSession>,
    pub live: LivePayload,
    pub overlay: OverlayState,
    /// Current ranked tier (client, mock, or the cached last client value); None = never known.
    pub rank: Option<RankInfo>,
    pub appearance: Appearance,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivePayload {
    pub status: LiveStatus,
    pub game: Option<LiveGame>,
}

pub struct AppState {
    pub snapshot: Mutex<Snapshot>,
    pub settings: Mutex<Settings>,
}

impl AppState {
    pub fn new(mock: bool, settings: Settings) -> Self {
        Self {
            snapshot: Mutex::new(Snapshot {
                mock,
                connection: if mock { ConnectionStatus::Mock } else { ConnectionStatus::Connecting },
                phase: "None".into(),
                champ_select: None,
                live: LivePayload { status: LiveStatus::Idle, game: None },
                overlay: OverlayState::new(mock, &settings),
                rank: if mock {
                    None
                } else {
                    settings.last_rank.clone().map(|r| RankInfo { source: "cached".into(), ..r })
                },
                appearance: settings.appearance.clone(),
            }),
            settings: Mutex::new(settings),
        }
    }
}

pub fn snapshot(app: &AppHandle) -> Snapshot {
    app.state::<AppState>().snapshot.lock().unwrap().clone()
}

/// Applies `update` to the snapshot field selected by `field`; emits `event` if it changed.
fn update<T: Clone + PartialEq + Serialize>(
    app: &AppHandle,
    event: &str,
    field: impl FnOnce(&mut Snapshot) -> &mut T,
    value: T,
) -> bool {
    let changed = {
        let state = app.state::<AppState>();
        let mut snap = state.snapshot.lock().unwrap();
        let slot = field(&mut snap);
        if *slot == value {
            false
        } else {
            *slot = value.clone();
            true
        }
    };
    if changed {
        let _ = app.emit(event, value);
    }
    changed
}

pub fn set_connection(app: &AppHandle, status: ConnectionStatus) {
    update(app, events::CONNECTION, |s| &mut s.connection, status);
}

pub fn set_phase(app: &AppHandle, phase: &str) {
    if update(app, events::PHASE, |s| &mut s.phase, phase.to_string()) {
        log::info!("gameflow phase → {phase}");
        overlay::sync_mode(app);
    }
}

pub fn set_champ_select(app: &AppHandle, session: Option<ChampSelectSession>) {
    update(app, events::CHAMP_SELECT, |s| &mut s.champ_select, session);
}

pub fn set_live(app: &AppHandle, status: LiveStatus, game: Option<LiveGame>) {
    let had_game = app.state::<AppState>().snapshot.lock().unwrap().live.game.is_some();
    let has_game = game.is_some();
    update(app, events::LIVE, |s| &mut s.live, LivePayload { status, game });
    if had_game != has_game {
        overlay::sync_mode(app);
    }
}

pub fn phase(app: &AppHandle) -> String {
    app.state::<AppState>().snapshot.lock().unwrap().phase.clone()
}

/// New rank from the client/mock. Client ranks are remembered for the next start.
pub fn set_rank(app: &AppHandle, rank: RankInfo) {
    let from_client = rank.source == "client";
    if update(app, events::RANK, |s| &mut s.rank, Some(rank.clone())) && from_client {
        let state = app.state::<AppState>();
        let saved = {
            let mut s = state.settings.lock().unwrap();
            if s.last_rank.as_ref() == Some(&rank) {
                None
            } else {
                s.last_rank = Some(rank);
                Some(s.clone())
            }
        };
        if let Some(saved) = saved {
            settings::save(app, &saved);
        }
    }
}

/// Client went away: keep the rank but mark it as cached so the UI can say so.
pub fn mark_rank_cached(app: &AppHandle) {
    let current = app.state::<AppState>().snapshot.lock().unwrap().rank.clone();
    if let Some(r) = current.filter(|r| r.source == "client") {
        update(app, events::RANK, |s| &mut s.rank, Some(RankInfo { source: "cached".into(), ..r }));
    }
}

pub fn set_appearance(app: &AppHandle, appearance: Appearance) {
    crate::overlay::set_layout(app, appearance.zoom(), appearance.snap_to_edge);
    if update(app, events::APPEARANCE, |s| &mut s.appearance, appearance.clone()) {
        let state = app.state::<AppState>();
        let saved = {
            let mut s = state.settings.lock().unwrap();
            s.appearance = appearance;
            s.clone()
        };
        settings::save(app, &saved);
    }
}
