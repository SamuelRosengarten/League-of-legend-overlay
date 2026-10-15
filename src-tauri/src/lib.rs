//! Rift Advisor — Gwen/Amumu overlay. Reads only the official local APIs (LCU + Live Client
//! Data API) and Data Dragon. No input hooks, no memory reading, no screen capture.

mod commands;
mod ddragon;
mod geometry;
mod lcu;
mod live;
mod lockfile;
mod mock;
mod overlay;
mod ranked;
mod settings;
mod state;
mod tls;
mod types;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::settings::Hotkeys;
use crate::state::AppState;

fn is_mock() -> bool {
    std::env::var("RIFT_MOCK").is_ok_and(|v| !v.is_empty() && v != "0") || std::env::args().any(|a| a == "--mock")
}

/// Registered hotkeys, so the shared handler can tell them apart.
struct HotkeyIds {
    visibility: Option<Shortcut>,
    interactive: Option<Shortcut>,
}

fn parse_hotkey(text: &str, fallback: &str) -> Option<Shortcut> {
    text.parse::<Shortcut>()
        .map_err(|e| log::warn!("invalid hotkey {text:?} ({e}); using {fallback}"))
        .or_else(|_| fallback.parse::<Shortcut>())
        .ok()
}

fn register_hotkeys(app: &AppHandle, hotkeys: &Hotkeys) {
    let defaults = Hotkeys::default();
    let ids = HotkeyIds {
        visibility: parse_hotkey(&hotkeys.toggle_visibility, &defaults.toggle_visibility),
        interactive: parse_hotkey(&hotkeys.toggle_interactive, &defaults.toggle_interactive),
    };
    for shortcut in [&ids.visibility, &ids.interactive].into_iter().flatten() {
        // RegisterHotKey under the hood — not a keyboard hook.
        match app.global_shortcut().register(*shortcut) {
            Ok(()) => log::info!("hotkey registered: {}", shortcut.into_string()),
            // Usually another app (or a second copy) already owns the combination.
            Err(e) => log::warn!("could not register hotkey {}: {e}", shortcut.into_string()),
        }
    }
    app.manage(ids);
}

fn on_hotkey(app: &AppHandle, shortcut: &Shortcut) {
    // If a press in game never shows up here, Windows did not deliver it to us (see README).
    log::info!("hotkey pressed: {}", shortcut.into_string());
    let ids = app.state::<HotkeyIds>();
    if ids.visibility.as_ref() == Some(shortcut) {
        overlay::toggle_visibility(app);
    } else if ids.interactive.as_ref() == Some(shortcut) {
        overlay::toggle_interactive(app);
    }
}

fn build_tray(app: &AppHandle, hotkeys: &Hotkeys) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", format!("Show / hide ({})", hotkeys.toggle_visibility), true, None::<&str>)?;
    let interactive =
        MenuItem::with_id(app, "interactive", format!("Interactive mode ({})", hotkeys.toggle_interactive), true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset-position", "Reset position", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Rift Advisor", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &interactive, &reset, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main").tooltip("Rift Advisor").menu(&menu).on_menu_event(|app, event| {
        match event.id.as_ref() {
            "toggle" => overlay::toggle_visibility(app),
            "interactive" => overlay::toggle_interactive(app),
            "reset-position" => overlay::reset_position(app),
            "quit" => app.exit(0),
            _ => {}
        }
    });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info,rift_advisor_lib=debug")).init();
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mock = is_mock();

    tauri::Builder::default()
        // Must be the first plugin. A second copy would fail to register the global hotkeys
        // (RegisterHotKey is per-system), so it hands over to the running overlay and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("second launch: revealing the running overlay");
            overlay::reveal(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        on_hotkey(app, shortcut);
                    }
                })
                .build(),
        )
        .register_asynchronous_uri_scheme_protocol("ddicon", ddragon::icon_protocol)
        .manage(ddragon::DdragonState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_ddragon,
            commands::set_interactive,
            commands::toggle_visibility,
            commands::fit_content,
            commands::reset_position,
            commands::set_hot_zone,
            commands::set_appearance,
            commands::mock_status,
            commands::mock_load,
            commands::mock_step,
            commands::mock_play,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let settings = settings::load(&handle);
            let hotkeys = settings.hotkeys.clone();
            app.manage(AppState::new(mock, settings));
            register_hotkeys(&handle, &hotkeys);
            build_tray(&handle, &hotkeys)?;
            overlay::init(&handle);
            ddragon::spawn_load(handle.clone());
            if mock {
                log::info!("mock mode: replaying fixtures, LCU/Live Client APIs are not contacted");
                mock::start(&handle);
            } else {
                lcu::spawn(handle.clone());
                live::spawn(handle);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Rift Advisor");
}
