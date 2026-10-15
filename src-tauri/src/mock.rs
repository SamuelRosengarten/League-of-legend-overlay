//! Mock mode (`RIFT_MOCK=1`, `npm run dev:mock`): replays fixture scenarios from
//! `fixtures/scenarios/*.json` through the exact same state/event path as the real
//! connectors. The LCU and Live Client APIs are never contacted.
//!
//! Scenario format: `{ name, description, steps: [{ label, delayMs, phase?, champSelect?, liveGame? }] }`.
//! A step only overrides the keys it contains (`null` clears); jumping to step N replays 0..=N.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{self, events};
use crate::types::{ChampSelectSession, LiveGame, LiveStatus};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scenario {
    name: String,
    #[serde(default)]
    description: String,
    steps: Vec<Step>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Step {
    #[serde(default)]
    label: String,
    #[serde(default = "default_delay")]
    delay_ms: u64,
    /// Remaining keys (`phase`, `champSelect`, `liveGame`); presence matters, so kept raw.
    #[serde(flatten)]
    data: serde_json::Map<String, Value>,
}

fn default_delay() -> u64 {
    3000
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioMeta {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockStatus {
    pub scenarios: Vec<ScenarioMeta>,
    pub scenario: Option<String>,
    pub step_index: usize,
    pub step_count: usize,
    pub step_label: String,
    pub playing: bool,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct MockRunner {
    scenarios: Vec<(ScenarioMeta, Scenario)>,
    current: Option<usize>,
    index: usize,
    playing: bool,
    next_at: Option<Instant>,
    error: Option<String>,
}

fn fixtures_dir() -> PathBuf {
    std::env::var_os("RIFT_FIXTURES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/scenarios"))
}

fn load_scenarios() -> (Vec<(ScenarioMeta, Scenario)>, Option<String>) {
    let dir = fixtures_dir();
    let mut out = Vec::new();
    let mut errors = Vec::new();
    let mut paths: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "json")).collect())
        .unwrap_or_default();
    paths.sort();
    for path in paths {
        let id = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let parsed = std::fs::read_to_string(&path)
            .map_err(|e| e.to_string())
            .and_then(|t| serde_json::from_str::<Scenario>(&t).map_err(|e| e.to_string()))
            .and_then(|s| validate(&s).map(|_| s));
        match parsed {
            Ok(s) => out.push((ScenarioMeta { id, name: s.name.clone(), description: s.description.clone() }, s)),
            Err(e) => errors.push(format!("{id}: {e}")),
        }
    }
    if out.is_empty() && errors.is_empty() {
        errors.push(format!("no scenarios in {}", dir.display()));
    }
    (out, (!errors.is_empty()).then(|| errors.join("; ")))
}

/// Every champSelect / liveGame payload must deserialize into the real API types.
fn validate(s: &Scenario) -> Result<(), String> {
    for (i, step) in s.steps.iter().enumerate() {
        if let Some(v) = step.data.get("champSelect").filter(|v| !v.is_null()) {
            serde_json::from_value::<ChampSelectSession>(v.clone()).map_err(|e| format!("step {i} champSelect: {e}"))?;
        }
        if let Some(v) = step.data.get("liveGame").filter(|v| !v.is_null()) {
            serde_json::from_value::<LiveGame>(v.clone()).map_err(|e| format!("step {i} liveGame: {e}"))?;
        }
    }
    if s.steps.is_empty() {
        return Err("scenario has no steps".into());
    }
    Ok(())
}

/// Accumulated state after replaying steps `0..=index`.
#[derive(Debug, Default, PartialEq)]
struct Frame {
    phase: String,
    champ_select: Option<ChampSelectSession>,
    live_game: Option<LiveGame>,
}

fn frame_at(scenario: &Scenario, index: usize) -> Frame {
    let mut frame = Frame { phase: "None".into(), ..Default::default() };
    for step in scenario.steps.iter().take(index + 1) {
        if let Some(p) = step.data.get("phase").and_then(Value::as_str) {
            frame.phase = p.to_string();
        }
        if let Some(v) = step.data.get("champSelect") {
            frame.champ_select = serde_json::from_value(v.clone()).ok();
        }
        if let Some(v) = step.data.get("liveGame") {
            frame.live_game = serde_json::from_value(v.clone()).ok();
        }
    }
    frame
}

fn runner(app: &AppHandle) -> tauri::State<'_, Mutex<MockRunner>> {
    app.state::<Mutex<MockRunner>>()
}

pub fn status(app: &AppHandle) -> MockStatus {
    let r = runner(app);
    let r = r.lock().unwrap();
    let current = r.current.map(|i| &r.scenarios[i]);
    MockStatus {
        scenarios: r.scenarios.iter().map(|(m, _)| m.clone()).collect(),
        scenario: current.map(|(m, _)| m.id.clone()),
        step_index: r.index,
        step_count: current.map_or(0, |(_, s)| s.steps.len()),
        step_label: current.and_then(|(_, s)| s.steps.get(r.index)).map(|s| s.label.clone()).unwrap_or_default(),
        playing: r.playing,
        error: r.error.clone(),
    }
}

fn publish(app: &AppHandle) {
    let frame = {
        let r = runner(app);
        let r = r.lock().unwrap();
        r.current.map(|i| frame_at(&r.scenarios[i].1, r.index))
    };
    if let Some(frame) = frame {
        let in_game = matches!(frame.phase.as_str(), "GameStart" | "InProgress" | "Reconnect");
        let live_status = match (&frame.live_game, in_game) {
            (Some(_), _) => LiveStatus::Connected,
            (None, true) => LiveStatus::Waiting,
            (None, false) => LiveStatus::Idle,
        };
        // Live first so the phase change sees the right game presence when picking the mode.
        state::set_champ_select(app, frame.champ_select);
        state::set_live(app, live_status, frame.live_game);
        state::set_phase(app, &frame.phase);
    }
    let _ = app.emit(events::MOCK, status(app));
}

fn schedule_next(r: &mut MockRunner) {
    let delay = r.current.and_then(|i| r.scenarios[i].1.steps.get(r.index)).map_or(3000, |s| s.delay_ms);
    r.next_at = Some(Instant::now() + Duration::from_millis(delay));
}

pub fn load(app: &AppHandle, id: &str) -> Result<(), String> {
    {
        let r = runner(app);
        let mut r = r.lock().unwrap();
        // Re-read from disk so fixture edits show up without restarting.
        let (scenarios, error) = load_scenarios();
        r.scenarios = scenarios;
        r.error = error;
        let idx = r.scenarios.iter().position(|(m, _)| m.id == id).ok_or(format!("unknown scenario {id}"))?;
        r.current = Some(idx);
        r.index = 0;
        r.playing = true;
        schedule_next(&mut r);
    }
    publish(app);
    Ok(())
}

pub fn step(app: &AppHandle, delta: i64) {
    {
        let r = runner(app);
        let mut r = r.lock().unwrap();
        let Some(i) = r.current else { return };
        let last = r.scenarios[i].1.steps.len() as i64 - 1;
        r.index = (r.index as i64 + delta).clamp(0, last) as usize;
        r.playing = false;
    }
    publish(app);
}

pub fn set_playing(app: &AppHandle, playing: bool) {
    {
        let r = runner(app);
        let mut r = r.lock().unwrap();
        r.playing = playing;
        schedule_next(&mut r);
    }
    let _ = app.emit(events::MOCK, status(app));
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn start(app: &AppHandle) {
    app.manage(Mutex::new(MockRunner::default()));
    let (scenarios, error) = load_scenarios();
    if let Some(e) = &error {
        log::error!("mock fixtures: {e}");
    }
    // RIFT_MOCK_RANK="gold II 47" picks the mock rank (theme); default emerald II.
    state::set_rank(app, crate::ranked::mock_rank(std::env::var("RIFT_MOCK_RANK").ok().as_deref()));
    state::set_history(app, crate::history::sample(now_ms()));
    let wanted = std::env::var("RIFT_MOCK_SCENARIO").ok();
    let first = wanted
        .filter(|w| scenarios.iter().any(|(m, _)| &m.id == w))
        .or_else(|| scenarios.first().map(|(m, _)| m.id.clone()));
    {
        let r = runner(app);
        let mut r = r.lock().unwrap();
        r.scenarios = scenarios;
        r.error = error;
    }
    if let Some(id) = first {
        let _ = load(app, &id);
        // RIFT_MOCK_STEP=<n> (1-based) starts paused on that step — handy for UI work.
        if let Some(n) = std::env::var("RIFT_MOCK_STEP").ok().and_then(|v| v.parse::<i64>().ok()) {
            step(app, n - 1);
        }
    } else {
        let _ = app.emit(events::MOCK, status(app));
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let advanced = {
                let r = runner(&app);
                let mut r = r.lock().unwrap();
                let Some(i) = r.current else { continue };
                let len = r.scenarios[i].1.steps.len();
                let due = r.next_at.is_some_and(|t| Instant::now() >= t);
                if r.playing && due && r.index + 1 < len {
                    r.index += 1;
                    schedule_next(&mut r);
                    true
                } else {
                    if r.playing && r.index + 1 >= len {
                        r.playing = false;
                    }
                    false
                }
            };
            if advanced {
                publish(&app);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_fixture_scenarios_are_valid() {
        let (scenarios, error) = load_scenarios();
        assert_eq!(error, None);
        let ids: Vec<_> = scenarios.iter().map(|(m, _)| m.id.as_str()).collect();
        for required in ["gwen-vs-fiora", "amumu-vs-leesin-red", "unsupported-champion", "partially-hidden-enemies"] {
            assert!(ids.contains(&required), "missing fixture {required}");
        }
    }

    #[test]
    fn steps_override_only_present_keys() {
        let s: Scenario = serde_json::from_value(serde_json::json!({
            "name": "t",
            "steps": [
                {"phase": "ChampSelect", "champSelect": {"localPlayerCellId": 1}},
                {"label": "phase only", "phase": "InProgress"},
                {"champSelect": null, "liveGame": {"gameData": {"gameTime": 12.5}}}
            ]
        }))
        .unwrap();
        let f1 = frame_at(&s, 1);
        assert_eq!(f1.phase, "InProgress");
        assert_eq!(f1.champ_select.as_ref().map(|c| c.local_player_cell_id), Some(1));
        let f2 = frame_at(&s, 2);
        assert!(f2.champ_select.is_none());
        assert_eq!(f2.live_game.map(|g| g.game_data.game_time), Some(12.5));
    }
}
