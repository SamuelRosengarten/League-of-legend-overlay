//! League Client (LCU) connector: lockfile → HTTPS + WAMP WebSocket on 127.0.0.1.
//! Subscribes to gameflow-phase and champ-select session events; falls back to polling
//! if the WebSocket cannot be established or drops while the HTTP API still answers.

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;

use crate::lockfile::{self, Lockfile};
use crate::ranked::{self, RANKED_EVENT, RANKED_PATH};
use crate::state::{self, AppState};
use crate::tls;
use crate::types::{ChampSelectSession, ConnectionStatus, Transport};

const PHASE_PATH: &str = "/lol-gameflow/v1/gameflow-phase";
const SESSION_PATH: &str = "/lol-champ-select/v1/session";
const PHASE_EVENT: &str = "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase";
const SESSION_EVENT: &str = "OnJsonApiEvent_lol-champ-select_v1_session";

const RETRY: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_millis(1000);
/// Rank changes rarely; when polling, re-read it every this many polls.
const RANK_POLL_EVERY: u32 = 30;

struct Lcu {
    lock: Lockfile,
    http: reqwest::Client,
}

impl Lcu {
    fn new(lock: Lockfile) -> Self {
        Self { lock, http: tls::loopback_http_client(Duration::from_secs(3)) }
    }

    fn auth_header(&self) -> String {
        let token = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", self.lock.password));
        format!("Basic {token}")
    }

    /// `Ok(None)` for 404 (e.g. no champ select session right now).
    async fn get(&self, path: &str) -> Result<Option<Value>, reqwest::Error> {
        let res = self
            .http
            .get(tls::loopback_url(self.lock.port, path))
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;
        if res.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        Ok(Some(res.error_for_status()?.json().await?))
    }

    async fn refresh(&self, app: &AppHandle) -> Result<(), reqwest::Error> {
        let phase = self.get(PHASE_PATH).await?.and_then(|v| v.as_str().map(str::to_owned));
        let phase = phase.unwrap_or_else(|| "None".into());
        state::set_phase(app, &phase);
        let session = if phase == "ChampSelect" { self.get(SESSION_PATH).await? } else { None };
        state::set_champ_select(app, session.and_then(parse_session));
        Ok(())
    }

    /// Ranked stats are optional: a failure here must not drop the connection.
    async fn refresh_rank(&self, app: &AppHandle) {
        match self.get(RANKED_PATH).await {
            Ok(Some(v)) => match ranked::from_ranked_stats(&v) {
                Some(rank) => state::set_rank(app, rank),
                None => log::warn!("unexpected ranked-stats payload"),
            },
            Ok(None) => {}
            Err(e) => log::debug!("ranked stats unavailable: {e}"),
        }
    }
}

fn parse_session(v: Value) -> Option<ChampSelectSession> {
    serde_json::from_value(v).map_err(|e| log::warn!("unexpected champ-select payload: {e}")).ok()
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            run_once(&app).await;
            tokio::time::sleep(RETRY).await;
        }
    });
}

/// One connection lifetime: discover → connect → stream/poll until the client goes away.
async fn run_once(app: &AppHandle) {
    let override_dir = app.state::<AppState>().settings.lock().unwrap().league_install_dir.clone().map(PathBuf::from);
    let Some(lock) = lockfile::discover(override_dir.as_deref()) else {
        state::set_connection(app, ConnectionStatus::ClientNotRunning);
        reset(app);
        return;
    };
    state::set_connection(app, ConnectionStatus::Connecting);
    let lcu = Lcu::new(lock);
    if let Err(e) = lcu.refresh(app).await {
        state::set_connection(app, ConnectionStatus::ApiUnreachable { message: short_error(&e) });
        reset(app);
        return;
    }
    lcu.refresh_rank(app).await;

    match websocket(app, &lcu).await {
        Ok(()) => log::info!("LCU websocket closed"),
        Err(e) => log::warn!("LCU websocket unavailable ({e}); polling instead"),
    }

    // Polling fallback (also covers the gap after a websocket drop): runs until HTTP fails.
    state::set_connection(app, ConnectionStatus::Connected { port: lcu.lock.port, transport: Transport::Polling });
    let mut polls: u32 = 0;
    loop {
        polls = polls.wrapping_add(1);
        if polls % RANK_POLL_EVERY == 0 {
            lcu.refresh_rank(app).await;
        }
        if let Err(e) = lcu.refresh(app).await {
            log::info!("LCU unreachable, rediscovering: {e}");
            state::set_connection(app, ConnectionStatus::ApiUnreachable { message: short_error(&e) });
            reset(app);
            return;
        }
        tokio::time::sleep(POLL).await;
        // A new client session writes a new lockfile; reconnect (and retry the websocket) if so.
        if lockfile::discover(override_dir.as_deref()).map(|l| l.port) != Some(lcu.lock.port) {
            return;
        }
    }
}

fn reset(app: &AppHandle) {
    state::mark_rank_cached(app);
    state::set_phase(app, "None");
    state::set_champ_select(app, None);
}

fn short_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "timed out".into()
    } else if e.is_connect() {
        "connection refused".into()
    } else if let Some(status) = e.status() {
        format!("HTTP {status}")
    } else {
        "request failed".into()
    }
}

async fn websocket(app: &AppHandle, lcu: &Lcu) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut request = format!("wss://{}:{}/", tls::LOOPBACK, lcu.lock.port).into_client_request()?;
    request.headers_mut().insert("Authorization", HeaderValue::from_str(&lcu.auth_header())?);
    let connector = Connector::Rustls(tls::loopback_tls_config());
    let (mut ws, _) = tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector)).await?;

    // WAMP 1.0: [5, topic] = subscribe; events arrive as [8, topic, {data, eventType, uri}].
    for topic in [PHASE_EVENT, SESSION_EVENT, RANKED_EVENT] {
        ws.send(Message::text(serde_json::json!([5, topic]).to_string())).await?;
    }
    state::set_connection(app, ConnectionStatus::Connected { port: lcu.lock.port, transport: Transport::Websocket });
    // Re-sync in case something changed between the first refresh and the subscription.
    lcu.refresh(app).await?;

    while let Some(msg) = ws.next().await {
        let text = match msg? {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };
        if text.is_empty() {
            continue;
        }
        let Ok(Value::Array(frame)) = serde_json::from_str::<Value>(&text) else { continue };
        if let Some((topic, event)) = parse_event(&frame) {
            handle_event(app, topic, event);
        }
    }
    Ok(())
}

/// Returns `(topic, payload)` for a WAMP EVENT frame.
fn parse_event(frame: &[Value]) -> Option<(&str, &Value)> {
    match frame {
        [code, topic, payload] if code.as_i64() == Some(8) => Some((topic.as_str()?, payload)),
        _ => None,
    }
}

fn handle_event(app: &AppHandle, topic: &str, event: &Value) {
    let deleted = event.get("eventType").and_then(Value::as_str) == Some("Delete");
    let data = event.get("data").cloned().unwrap_or(Value::Null);
    match topic {
        PHASE_EVENT => {
            let phase = if deleted { "None" } else { data.as_str().unwrap_or("None") };
            state::set_phase(app, phase);
            if phase != "ChampSelect" {
                state::set_champ_select(app, None);
            }
        }
        SESSION_EVENT => state::set_champ_select(app, if deleted { None } else { parse_session(data) }),
        RANKED_EVENT if !deleted => {
            if let Some(rank) = ranked::from_ranked_stats(&data) {
                state::set_rank(app, rank);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_wamp_event_frames() {
        let frame = json!([8, SESSION_EVENT, {"data": {"localPlayerCellId": 3}, "eventType": "Update"}]);
        let (topic, payload) = parse_event(frame.as_array().unwrap()).unwrap();
        assert_eq!(topic, SESSION_EVENT);
        assert_eq!(payload["data"]["localPlayerCellId"], 3);
        assert!(parse_event(json!([5, SESSION_EVENT]).as_array().unwrap()).is_none());
        assert!(parse_event(json!([0, "welcome", 1]).as_array().unwrap()).is_none());
    }

    #[test]
    fn basic_auth_uses_riot_user_and_lockfile_password() {
        let lock = Lockfile { process: "LeagueClient".into(), pid: 1, port: 50000, password: "abc".into(), protocol: "https".into() };
        // base64("riot:abc")
        assert_eq!(Lcu::new(lock).auth_header(), "Basic cmlvdDphYmM=");
    }

    #[test]
    fn champ_select_payload_tolerates_unknown_shapes() {
        assert!(parse_session(json!({"localPlayerCellId": 0, "extra": true})).is_some());
        assert!(parse_session(json!("not a session")).is_none());
    }
}
