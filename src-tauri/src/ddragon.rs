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

/// Assets the webview may request. Ids are strictly validated — no path traversal.
#[derive(Debug, PartialEq)]
enum Asset<'a> {
    /// `/Gwen.png` — square champion icon.
    Champion(&'a str),
    /// `/item/3074.png`
    Item(u32),
    /// `/spell/Gwen/Q.png` — ability icon, key P/Q/W/E/R.
    Spell(&'a str, usize),
    /// `/splash/Gwen.jpg` — centered default-skin splash (version independent).
    Splash(&'a str),
}

fn champion_id(id: &str) -> Option<&str> {
    (!id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_alphanumeric())).then_some(id)
}

fn parse_asset(path: &str) -> Option<Asset<'_>> {
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        [file] => Some(Asset::Champion(champion_id(file.strip_suffix(".png")?)?)),
        ["item", file] => {
            let id = file.strip_suffix(".png")?;
            (id.len() <= 7 && id.chars().all(|c| c.is_ascii_digit())).then(|| id.parse().ok()).flatten().map(Asset::Item)
        }
        ["spell", champ, file] => {
            let slot = ["P", "Q", "W", "E", "R"].iter().position(|k| Some(*k) == file.strip_suffix(".png"))?;
            Some(Asset::Spell(champion_id(champ)?, slot))
        }
        ["splash", file] => Some(Asset::Splash(champion_id(file.strip_suffix(".jpg")?)?)),
        _ => None,
    }
}

pub fn icon_protocol(ctx: UriSchemeContext<'_, tauri::Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let path = request.uri().path().to_string();
    tauri::async_runtime::spawn(async move {
        let response = match serve_asset(&app, &path).await {
            Ok(bytes) => Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", if path.ends_with(".jpg") { "image/jpeg" } else { "image/png" })
                .header("Cache-Control", "max-age=604800")
                .body(bytes),
            Err((status, msg)) => Response::builder().status(status).body(msg.into_bytes()),
        };
        responder.respond(response.expect("valid icon response"));
    });
}

type ServeError = (StatusCode, String);

async fn download(url: &str) -> Result<Vec<u8>, ServeError> {
    http()
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))
}

/// Disk cache in front of `download`.
async fn cached(file: PathBuf, url: String) -> Result<Vec<u8>, ServeError> {
    if let Ok(bytes) = std::fs::read(&file) {
        return Ok(bytes);
    }
    let bytes = download(&url).await?;
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&file, &bytes);
    Ok(bytes)
}

/// Image file name of a champion's passive (slot 0) or Q/W/E/R (1–4), from `champion/<id>.json`.
pub fn spell_image(detail: &Value, id: &str, slot: usize) -> Option<(String, &'static str)> {
    let champ = &detail["data"][id];
    if slot == 0 {
        Some((champ["passive"]["image"]["full"].as_str()?.to_string(), "passive"))
    } else {
        Some((champ["spells"][slot - 1]["image"]["full"].as_str()?.to_string(), "spell"))
    }
}

async fn serve_asset(app: &AppHandle, path: &str) -> Result<Vec<u8>, ServeError> {
    let asset = parse_asset(path).ok_or((StatusCode::BAD_REQUEST, "bad asset path".into()))?;
    let root = cache_dir(app).ok_or((StatusCode::INTERNAL_SERVER_ERROR, "no cache dir".into()))?;
    if let Asset::Splash(id) = asset {
        return cached(root.join("splash").join(format!("{id}.jpg")), format!("{BASE}/cdn/img/champion/centered/{id}_0.jpg")).await;
    }
    let version = app
        .state::<DdragonState>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|d| d.version.clone())
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Data Dragon not loaded".into()))?;
    let dir = root.join("icons").join(&version);
    match asset {
        Asset::Champion(id) => cached(dir.join(format!("{id}.png")), format!("{BASE}/cdn/{version}/img/champion/{id}.png")).await,
        Asset::Item(id) => cached(dir.join("item").join(format!("{id}.png")), format!("{BASE}/cdn/{version}/img/item/{id}.png")).await,
        Asset::Spell(id, slot) => {
            let file = dir.join("spell").join(format!("{id}-{slot}.png"));
            if let Ok(bytes) = std::fs::read(&file) {
                return Ok(bytes);
            }
            let raw = cached(dir.join(format!("champion-{id}.json")), format!("{BASE}/cdn/{version}/data/en_US/champion/{id}.json")).await?;
            let detail: Value = serde_json::from_slice(&raw).map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
            let (image, kind) = spell_image(&detail, id, slot).ok_or((StatusCode::NOT_FOUND, "no such ability".into()))?;
            cached(file, format!("{BASE}/cdn/{version}/img/{kind}/{image}")).await
        }
        Asset::Splash(_) => unreachable!(),
    }
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
    fn asset_paths_are_sanitized() {
        assert_eq!(parse_asset("/Gwen.png"), Some(Asset::Champion("Gwen")));
        assert_eq!(parse_asset("/item/3074.png"), Some(Asset::Item(3074)));
        assert_eq!(parse_asset("/spell/Gwen/R.png"), Some(Asset::Spell("Gwen", 4)));
        assert_eq!(parse_asset("/spell/Gwen/P.png"), Some(Asset::Spell("Gwen", 0)));
        assert_eq!(parse_asset("/splash/Amumu.jpg"), Some(Asset::Splash("Amumu")));
        for bad in ["/../secrets.png", "/Gwen", "/a/b.png", "/item/../1.png", "/item/12a.png", "/spell/Gwen/X.png", "/spell/../Q.png", "/splash/Gwen.png"] {
            assert_eq!(parse_asset(bad), None, "{bad}");
        }
    }

    #[test]
    fn finds_ability_images() {
        let detail = serde_json::json!({"data": {"Gwen": {
            "passive": {"image": {"full": "Gwen_Passive.png"}},
            "spells": [{"image": {"full": "GwenQ.png"}}, {"image": {"full": "GwenW.png"}}, {"image": {"full": "GwenE.png"}}, {"image": {"full": "GwenR.png"}}]
        }}});
        assert_eq!(spell_image(&detail, "Gwen", 0), Some(("Gwen_Passive.png".into(), "passive")));
        assert_eq!(spell_image(&detail, "Gwen", 4), Some(("GwenR.png".into(), "spell")));
        assert_eq!(spell_image(&detail, "Fiora", 1), None);
    }
}
