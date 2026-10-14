//! Data Dragon static data: champion list (latest patch) + icons, cached on disk under the
//! app cache dir. Works offline once cached. Icons are served to the webview through the
//! `ddicon://` protocol (`http://ddicon.localhost/<ChampionId>.png` on Windows).

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, UriSchemeContext, UriSchemeResponder};

use crate::state::events;

const BASE: &str = "https://ddragon.leagueoflegends.com";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Champion {
    /// Data Dragon id, e.g. "MonkeyKing" — the key used by all curated data.
    pub id: String,
    /// Numeric key as used by the LCU (`championId`).
    pub key: i64,
    pub name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdragonData {
    pub version: String,
    pub champions: Vec<Champion>,
    /// True if loaded from disk because the network was unavailable.
    #[serde(default)]
    pub offline: bool,
}

#[derive(Default)]
pub struct DdragonState(pub Mutex<Option<DdragonData>>);

fn http() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(10)).build().expect("ddragon client")
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|d| d.join("ddragon"))
}

pub fn spawn_load(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let data = match load(&app).await {
            Ok(d) => Some(d),
            Err(e) => {
                log::warn!("Data Dragon unavailable: {e}");
                None
            }
        };
        *app.state::<DdragonState>().0.lock().unwrap() = data.clone();
        let _ = app.emit(events::DDRAGON, data);
    });
}

async fn load(app: &AppHandle) -> Result<DdragonData, String> {
    let dir = cache_dir(app).ok_or("no cache dir")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    match fetch_latest(&dir).await {
        Ok(d) => Ok(d),
        Err(e) => {
            log::warn!("Data Dragon fetch failed ({e}); using cache");
            newest_cached(&dir).ok_or_else(|| format!("{e}; no cached data"))
        }
    }
}

async fn fetch_latest(dir: &Path) -> Result<DdragonData, String> {
    let client = http();
    let versions: Vec<String> = client
        .get(format!("{BASE}/api/versions.json"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let version = versions.first().ok_or("empty versions.json")?.clone();
    let file = dir.join(format!("champions-{version}.json"));
    if let Some(cached) = read_cache(&file) {
        return Ok(cached);
    }
    let raw: Value = client
        .get(format!("{BASE}/cdn/{version}/data/en_US/champion.json"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let data = DdragonData { version, champions: parse_champions(&raw), offline: false };
    let _ = std::fs::write(&file, serde_json::to_vec(&data).unwrap_or_default());
    Ok(data)
}

pub fn parse_champions(raw: &Value) -> Vec<Champion> {
    let mut list: Vec<Champion> = raw["data"]
        .as_object()
        .map(|m| {
            m.values()
                .filter_map(|c| {
                    Some(Champion {
                        id: c["id"].as_str()?.to_string(),
                        key: c["key"].as_str()?.parse().ok()?,
                        name: c["name"].as_str()?.to_string(),
                        tags: serde_json::from_value(c["tags"].clone()).unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}

fn read_cache(file: &Path) -> Option<DdragonData> {
    serde_json::from_slice(&std::fs::read(file).ok()?).ok()
}

fn newest_cached(dir: &Path) -> Option<DdragonData> {
    let newest = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("champions-"))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())?;
    read_cache(&newest.path()).map(|d| DdragonData { offline: true, ..d })
}

/// Only plain champion ids are served — no path traversal.
fn icon_id(path: &str) -> Option<&str> {
    let id = path.trim_start_matches('/').strip_suffix(".png")?;
    (!id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_alphanumeric())).then_some(id)
}

pub fn icon_protocol(ctx: UriSchemeContext<'_, tauri::Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let path = request.uri().path().to_string();
    tauri::async_runtime::spawn(async move {
        let response = match serve_icon(&app, &path).await {
            Ok(bytes) => Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "image/png")
                .header("Cache-Control", "max-age=604800")
                .body(bytes),
            Err((status, msg)) => Response::builder().status(status).body(msg.into_bytes()),
        };
        responder.respond(response.expect("valid icon response"));
    });
}

async fn serve_icon(app: &AppHandle, path: &str) -> Result<Vec<u8>, (StatusCode, String)> {
    let id = icon_id(path).ok_or((StatusCode::BAD_REQUEST, "bad icon path".into()))?;
    let version = app
        .state::<DdragonState>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|d| d.version.clone())
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Data Dragon not loaded".into()))?;
    let dir = cache_dir(app).ok_or((StatusCode::INTERNAL_SERVER_ERROR, "no cache dir".into()))?.join("icons").join(&version);
    let file = dir.join(format!("{id}.png"));
    if let Ok(bytes) = std::fs::read(&file) {
        return Ok(bytes);
    }
    let bytes = http()
        .get(format!("{BASE}/cdn/{version}/img/champion/{id}.png"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?
        .to_vec();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&file, &bytes);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_champion_json() {
        let raw = serde_json::json!({"data": {
            "MonkeyKing": {"id": "MonkeyKing", "key": "62", "name": "Wukong", "tags": ["Fighter", "Tank"]},
            "Gwen": {"id": "Gwen", "key": "887", "name": "Gwen", "tags": ["Fighter", "Assassin"]}
        }});
        let list = parse_champions(&raw);
        assert_eq!(list.len(), 2);
        assert_eq!((list[1].id.as_str(), list[1].key, list[1].name.as_str()), ("MonkeyKing", 62, "Wukong"));
    }

    #[test]
    fn icon_paths_are_sanitized() {
        assert_eq!(icon_id("/Gwen.png"), Some("Gwen"));
        assert_eq!(icon_id("/../secrets.png"), None);
        assert_eq!(icon_id("/Gwen"), None);
        assert_eq!(icon_id("/a/b.png"), None);
    }
}
