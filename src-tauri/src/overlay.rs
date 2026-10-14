//! The single overlay window: mode (from gameflow phase), visibility, click-through,
//! placement (remembered per mode, docked in game, clamped to the monitor work area).
//!
//! The window never takes keyboard focus (`WS_EX_NOACTIVATE`), so the game/client keeps
//! receiving input even while the overlay is shown or clicked.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::geometry::{self, Edge, Rect, MARGIN};
use crate::settings::{self, SavedPosition, Settings};
use crate::state::{events, AppState};

pub const WINDOW_LABEL: &str = "overlay";
const CHAMP_SELECT_WIDTH: f64 = 460.0;
const CHAMP_SELECT_MAX_HEIGHT: f64 = 900.0;
const COMPACT_WIDTH: f64 = 320.0;
const MIN_HEIGHT: f64 = 40.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Mode {
    /// Client open, not in champ select / game: small status panel.
    Idle,
    ChampSelect,
    InGame,
    /// End of game: hidden until the next phase change (or the hotkey).
    Hidden,
}

impl Mode {
    fn key(self) -> &'static str {
        match self {
            Mode::Idle | Mode::Hidden => "idle",
            Mode::ChampSelect => "champ-select",
            Mode::InGame => "in-game",
        }
    }
}

/// Mode from the LCU phase, upgraded to `InGame` when the Live Client API reports a game
/// (covers the client being closed/crashed mid-game).
pub fn mode_for(phase: &str, live_game: bool) -> Mode {
    match mode_for_phase(phase) {
        Mode::Idle if live_game => Mode::InGame,
        mode => mode,
    }
}

pub fn mode_for_phase(phase: &str) -> Mode {
    match phase {
        "ChampSelect" => Mode::ChampSelect,
        "GameStart" | "InProgress" | "Reconnect" => Mode::InGame,
        "WaitingForStats" | "PreEndOfGame" | "EndOfGame" | "TerminatedInError" => Mode::Hidden,
        _ => Mode::Idle,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayState {
    pub mode: Mode,
    pub visible: bool,
    /// false = click-through.
    pub interactive: bool,
    pub dock: Edge,
    pub hotkeys: settings::Hotkeys,
    /// Hotkey override of the mode's default visibility; reset on every mode change.
    #[serde(skip)]
    visible_override: Option<bool>,
    /// Frontend-reported content height (logical px) for compact modes.
    #[serde(skip)]
    content_height: f64,
    /// Last position we set ourselves, to tell user drags apart from our own moves.
    #[serde(skip)]
    last_applied: Option<(i32, i32)>,
}

impl OverlayState {
    pub fn new(mock: bool, settings: &Settings) -> Self {
        Self {
            mode: Mode::Idle,
            visible: true,
            // Mock mode starts interactive so the fixture controls are clickable.
            interactive: mock,
            dock: settings.dock,
            hotkeys: settings.hotkeys.clone(),
            visible_override: None,
            content_height: 220.0,
            last_applied: None,
        }
    }

    fn effective_visible(&self) -> bool {
        self.visible_override.unwrap_or(self.mode != Mode::Hidden)
    }
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
}

fn with_overlay<T>(app: &AppHandle, f: impl FnOnce(&mut OverlayState) -> T) -> T {
    let state = app.state::<AppState>();
    let mut snap = state.snapshot.lock().unwrap();
    f(&mut snap.overlay)
}

fn emit_state(app: &AppHandle) {
    let overlay = with_overlay(app, |o| o.clone());
    let _ = app.emit(events::OVERLAY, overlay);
}

/// Called once at startup.
pub fn init(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    win_native::make_non_activating(&win);
    let interactive = with_overlay(app, |o| o.interactive);
    set_click_through(&win, !interactive);

    let handle = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(_) = event {
            schedule_move_settled(&handle);
        }
    });
    sync_mode(app);
    apply(app);
}

/// Re-derives the mode from the current phase and re-applies placement/visibility if it changed.
pub fn sync_mode(app: &AppHandle) {
    let snap = crate::state::snapshot(app);
    let mode = mode_for(&snap.phase, snap.live.game.is_some());
    let changed = with_overlay(app, |o| {
        if o.mode == mode {
            return false;
        }
        o.mode = mode;
        o.visible_override = None;
        true
    });
    if changed {
        apply(app);
    }
}

pub fn toggle_visibility(app: &AppHandle) {
    with_overlay(app, |o| o.visible_override = Some(!o.effective_visible()));
    apply(app);
}

/// Show the overlay (e.g. the app was launched again while already running).
pub fn reveal(app: &AppHandle) {
    with_overlay(app, |o| o.visible_override = Some(true));
    apply(app);
}

pub fn set_interactive(app: &AppHandle, interactive: bool) {
    with_overlay(app, |o| o.interactive = interactive);
    if let Some(win) = window(app) {
        set_click_through(&win, !interactive);
    }
    emit_state(app);
}

pub fn toggle_interactive(app: &AppHandle) {
    let next = !with_overlay(app, |o| o.interactive);
    set_interactive(app, next);
}

/// Frontend reports its content height so compact panels hug their content.
pub fn fit_content(app: &AppHandle, height: f64) {
    let changed = with_overlay(app, |o| {
        let h = height.max(MIN_HEIGHT).round();
        let changed = (o.content_height - h).abs() >= 1.0;
        o.content_height = h;
        changed && o.mode != Mode::ChampSelect
    });
    if changed {
        apply_geometry(app);
    }
}

/// Applies visibility + placement for the current mode and emits the overlay state.
fn apply(app: &AppHandle) {
    let (visible, interactive) = with_overlay(app, |o| {
        o.visible = o.effective_visible();
        (o.visible, o.interactive)
    });
    if let Some(win) = window(app) {
        if visible {
            apply_geometry(app);
            win_native::show_without_activating(&win);
            // Showing can reset tao's style bits; re-assert ours.
            win_native::make_non_activating(&win);
            set_click_through(&win, !interactive);
        } else {
            win_native::hide(&win);
        }
    }
    emit_state(app);
}

struct MonitorInfo {
    work: Rect,
    scale: f64,
}

fn monitors(win: &WebviewWindow) -> Vec<MonitorInfo> {
    win.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let area = m.work_area();
            MonitorInfo {
                work: Rect {
                    x: area.position.x,
                    y: area.position.y,
                    w: area.size.width as i32,
                    h: area.size.height as i32,
                },
                scale: m.scale_factor(),
            }
        })
        .collect()
}

fn primary_point(win: &WebviewWindow) -> (i32, i32) {
    win.primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let a = m.work_area();
            (a.position.x + a.size.width as i32 / 2, a.position.y + a.size.height as i32 / 2)
        })
        .unwrap_or((0, 0))
}

/// Size + position for the current mode, clamped to the target monitor, DPI-aware.
fn apply_geometry(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    let (mode, content_height, dock) = with_overlay(app, |o| (o.mode, o.content_height, o.dock));
    let saved = app.state::<AppState>().settings.lock().unwrap().positions.get(mode.key()).copied();

    let mons = monitors(&win);
    let works: Vec<Rect> = mons.iter().map(|m| m.work).collect();
    let anchor = saved.map(|p| (p.x, p.y)).unwrap_or_else(|| primary_point(&win));
    let Some(idx) = geometry::pick_monitor(&works, anchor.0, anchor.1) else { return };
    let MonitorInfo { work, scale } = mons[idx];

    let work_h_logical = work.h as f64 / scale;
    let max_h = work_h_logical - 2.0 * MARGIN as f64 / scale;
    let (lw, lh) = match mode {
        Mode::ChampSelect => (CHAMP_SELECT_WIDTH, CHAMP_SELECT_MAX_HEIGHT.min(max_h)),
        _ => (COMPACT_WIDTH, content_height.clamp(MIN_HEIGHT, max_h)),
    };
    let (w, h) = ((lw * scale).round() as i32, (lh * scale).round() as i32);

    let (x, y) = match (saved, mode) {
        (Some(p), Mode::InGame) => (geometry::docked_x(dock, w, work), p.y),
        (Some(p), _) => (p.x, p.y),
        (None, Mode::ChampSelect) => (geometry::docked_x(Edge::Right, w, work), work.y + (work.h - h) / 2),
        (None, Mode::InGame) => (geometry::docked_x(dock, w, work), work.y + work.h / 5),
        (None, _) => (geometry::docked_x(Edge::Right, w, work), work.y + MARGIN),
    };
    let (x, y) = geometry::clamp(x, y, w, h, work);

    with_overlay(app, |o| o.last_applied = Some((x, y)));
    let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

static MOVE_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Windows emits a stream of `Moved` events while dragging; act once it has been quiet.
fn schedule_move_settled(app: &AppHandle) {
    let generation = MOVE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(350)).await;
        if MOVE_GENERATION.load(Ordering::SeqCst) == generation {
            on_user_moved(&app);
        }
    });
}

fn on_user_moved(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { return };
    let (mode, last) = with_overlay(app, |o| (o.mode, o.last_applied));
    if last == Some((pos.x, pos.y)) || mode == Mode::Hidden {
        return;
    }
    let (w, h) = (size.width as i32, size.height as i32);
    let works: Vec<Rect> = monitors(&win).iter().map(|m| m.work).collect();
    let Some(idx) = geometry::pick_monitor(&works, pos.x + w / 2, pos.y + h / 2) else { return };
    let work = works[idx];

    let mut x = pos.x;
    if mode == Mode::InGame {
        let edge = geometry::nearest_edge(pos.x, w, work);
        with_overlay(app, |o| o.dock = edge);
        x = geometry::docked_x(edge, w, work);
    }
    let (x, y) = geometry::clamp(x, pos.y, w, h, work);
    if (x, y) != (pos.x, pos.y) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    with_overlay(app, |o| o.last_applied = Some((x, y)));

    let dock = with_overlay(app, |o| o.dock);
    let settings = {
        let state = app.state::<AppState>();
        let mut s = state.settings.lock().unwrap();
        s.positions.insert(mode.key().to_string(), SavedPosition { x, y });
        s.dock = dock;
        s.clone()
    };
    settings::save(app, &settings);
    emit_state(app);
}

/// Click-through is set natively, never through tao's `set_ignore_cursor_events`.
///
/// Root cause of "interactive mode makes the overlay disappear": tao re-applies all of its
/// window flags on any flag change, and `apply_diff` calls `ShowWindow(SW_HIDE)` whenever its
/// own VISIBLE flag is unset. We show the window natively (`show_without_activating`, so it
/// never steals focus), which tao never learns about — so every click-through toggle through
/// tao hid the window. Owning the styles here keeps tao's flags untouched.
fn set_click_through(win: &WebviewWindow, ignore: bool) {
    win_native::set_click_through(win, ignore);
}

#[cfg(windows)]
mod win_native {
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_LAYERED,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };

    fn hwnd(win: &WebviewWindow) -> Option<HWND> {
        win.hwnd().ok().map(|h| h.0 as HWND)
    }

    /// Never steal keyboard focus from the game/client; keep out of Alt+Tab.
    pub fn make_non_activating(win: &WebviewWindow) {
        let Some(h) = hwnd(win) else { return };
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let wanted = ex | (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as isize;
            if wanted != ex {
                SetWindowLongPtrW(h, GWL_EXSTYLE, wanted);
            }
        }
    }

    /// WS_EX_TRANSPARENT + WS_EX_LAYERED = mouse input falls through to the game. Same bits
    /// tao uses, minus its visibility side effects. Also re-asserts no-activate + topmost so
    /// the overlay can never drop behind the game when the mode changes.
    pub fn set_click_through(win: &WebviewWindow, ignore: bool) {
        let Some(h) = hwnd(win) else { return };
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let wanted = click_through_style(ex, ignore);
            if wanted != ex {
                SetWindowLongPtrW(h, GWL_EXSTYLE, wanted);
            }
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        }
    }

    /// Extended style for a mode: click-through bits on/off, never-activate + tool window always.
    pub fn click_through_style(ex: isize, ignore: bool) -> isize {
        let through = (WS_EX_TRANSPARENT | WS_EX_LAYERED) as isize;
        let base = ex | (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as isize;
        if ignore {
            base | through
        } else {
            base & !through
        }
    }

    pub fn show_without_activating(win: &WebviewWindow) {
        let Some(h) = hwnd(win) else { return };
        unsafe {
            ShowWindow(h, SW_SHOWNOACTIVATE);
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    /// Must mirror `show_without_activating`: tao never learned the window was shown, so its
    /// own `hide()` would be a no-op.
    pub fn hide(win: &WebviewWindow) {
        let Some(h) = hwnd(win) else { return };
        unsafe {
            ShowWindow(h, SW_HIDE);
        }
    }
}

#[cfg(not(windows))]
mod win_native {
    use tauri::WebviewWindow;
    pub fn make_non_activating(_win: &WebviewWindow) {}
    pub fn set_click_through(win: &WebviewWindow, ignore: bool) {
        let _ = win.set_ignore_cursor_events(ignore);
    }
    pub fn show_without_activating(win: &WebviewWindow) {
        let _ = win.show();
    }
    pub fn hide(win: &WebviewWindow) {
        let _ = win.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_gameflow_phases_to_modes() {
        assert_eq!(mode_for_phase("ChampSelect"), Mode::ChampSelect);
        assert_eq!(mode_for_phase("InProgress"), Mode::InGame);
        assert_eq!(mode_for_phase("Reconnect"), Mode::InGame);
        assert_eq!(mode_for_phase("EndOfGame"), Mode::Hidden);
        assert_eq!(mode_for_phase("Lobby"), Mode::Idle);
        assert_eq!(mode_for_phase("None"), Mode::Idle);
        assert_eq!(mode_for("None", true), Mode::InGame);
        assert_eq!(mode_for("EndOfGame", true), Mode::Hidden);
    }

    #[cfg(windows)]
    #[test]
    fn click_through_toggles_only_input_bits() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
        };
        let through = (WS_EX_TRANSPARENT | WS_EX_LAYERED) as isize;
        let keep = (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST) as isize;
        let passive = win_native::click_through_style(WS_EX_TOPMOST as isize, true);
        assert_eq!(passive & through, through);
        assert_eq!(passive & keep, keep);
        let interactive = win_native::click_through_style(passive, false);
        assert_eq!(interactive & through, 0);
        // Interactive mode must keep the window topmost and non-activating (never steals focus).
        assert_eq!(interactive & keep, keep);
        assert_eq!(win_native::click_through_style(interactive, true), passive);
    }
}
