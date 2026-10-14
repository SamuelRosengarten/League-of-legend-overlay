//! Commands invoked by the frontend (`src/bridge.ts`).

use tauri::{AppHandle, Manager};

use crate::ddragon::{DdragonData, DdragonState};
use crate::state::{self, Snapshot};
use crate::{mock, overlay};

#[tauri::command]
pub fn get_snapshot(app: AppHandle) -> Snapshot {
    state::snapshot(&app)
}

#[tauri::command]
pub fn get_ddragon(app: AppHandle) -> Option<DdragonData> {
    app.state::<DdragonState>().0.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_interactive(app: AppHandle, interactive: bool) {
    overlay::set_interactive(&app, interactive);
}

#[tauri::command]
pub fn toggle_visibility(app: AppHandle) {
    overlay::toggle_visibility(&app);
}

#[tauri::command]
pub fn fit_content(app: AppHandle, height: f64) {
    overlay::fit_content(&app, height);
}

fn require_mock(app: &AppHandle) -> Result<(), String> {
    if state::snapshot(app).mock {
        Ok(())
    } else {
        Err("not in mock mode".into())
    }
}

#[tauri::command]
pub fn mock_status(app: AppHandle) -> Result<mock::MockStatus, String> {
    require_mock(&app)?;
    Ok(mock::status(&app))
}

#[tauri::command]
pub fn mock_load(app: AppHandle, id: String) -> Result<(), String> {
    require_mock(&app)?;
    mock::load(&app, &id)
}

#[tauri::command]
pub fn mock_step(app: AppHandle, delta: i64) -> Result<(), String> {
    require_mock(&app)?;
    mock::step(&app, delta);
    Ok(())
}

#[tauri::command]
pub fn mock_play(app: AppHandle, playing: bool) -> Result<(), String> {
    require_mock(&app)?;
    mock::set_playing(&app, playing);
    Ok(())
}
