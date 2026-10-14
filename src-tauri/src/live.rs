//! Live Client Data API poller (`https://127.0.0.1:2999/liveclientdata/allgamedata`).
//! Read-only, unauthenticated, only available while a game is loaded.

use std::time::Duration;

use tauri::AppHandle;

use crate::state;
use crate::tls;
use crate::types::{ConnectionStatus, LiveGame, LiveStatus};

const PORT: u16 = 2999;
const PATH: &str = "/liveclientdata/allgamedata";
const IN_GAME_INTERVAL: Duration = Duration::from_millis(1500);
const IDLE_INTERVAL: Duration = Duration::from_secs(5);

fn in_game_phase(phase: &str) -> bool {
    matches!(phase, "GameStart" | "InProgress" | "Reconnect")
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let http = tls::loopback_http_client(Duration::from_secs(2));
        let url = tls::loopback_url(PORT, PATH);
        loop {
            let phase = state::phase(&app);
            let lcu_connected = matches!(state::snapshot(&app).connection, ConnectionStatus::Connected { .. });
            // With the client connected we know exactly when a game runs; without it (client
            // crashed / closed mid-game) keep probing slowly so the in-game view still works.
            let should_poll = in_game_phase(&phase) || !lcu_connected;
            if !should_poll {
                state::set_live(&app, LiveStatus::Idle, None);
                tokio::time::sleep(IN_GAME_INTERVAL).await;
                continue;
            }
            match fetch(&http, &url).await {
                Ok(game) => state::set_live(&app, LiveStatus::Connected, Some(game)),
                Err(e) if in_game_phase(&phase) => {
                    // Loading screen: the API answers 404 / refuses until the game is loaded.
                    let status = if e.is_connect() || e.status().is_some() {
                        LiveStatus::Waiting
                    } else {
                        LiveStatus::Unreachable { message: e.to_string() }
                    };
                    state::set_live(&app, status, None);
                }
                Err(_) => state::set_live(&app, LiveStatus::Idle, None),
            }
            let lcu_says_in_game = in_game_phase(&phase);
            tokio::time::sleep(if lcu_says_in_game { IN_GAME_INTERVAL } else { IDLE_INTERVAL }).await;
        }
    });
}

async fn fetch(http: &reqwest::Client, url: &str) -> Result<LiveGame, reqwest::Error> {
    http.get(url).send().await?.error_for_status()?.json().await
}
