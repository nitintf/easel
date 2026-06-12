use base64::Engine as _;
use tauri::State;
use uuid::Uuid;

use crate::db;
use crate::easel;
use crate::state::AppState;

#[tauri::command]
pub fn list_canvases(state: State<'_, AppState>) -> Result<Vec<db::canvas::CanvasMeta>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Guard: only reconcile once per app session
    let mut reconciled = state.reconciled.lock().map_err(|e| e.to_string())?;
    if !*reconciled {
        *reconciled = true;

        let canvases_dir = easel::canvases_dir(&state.app_data_dir);

        // Phase 1: Remove DB entries whose .easel files no longer exist
        if let Ok(existing) = db::canvas::list_canvases(&conn) {
            for meta in &existing {
                let path = easel::canvas_easel_path(&state.app_data_dir, &meta.id);
                if !path.exists() {
                    let _ = db::canvas::delete_canvas(&conn, &meta.id);
                }
            }
        }

        // Phase 2: Scan canvases directory for .easel files not yet in DB
        if canvases_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&canvases_dir) {
                let count: i32 = conn
                    .query_row("SELECT COUNT(*) FROM canvases", [], |row| row.get(0))
                    .unwrap_or(0);
                let mut offset = 0;

                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("easel") {
                        continue;
                    }
                    let id = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if id.is_empty() {
                        continue;
                    }

                    let exists = db::canvas::canvas_exists(&conn, &id).unwrap_or(true);
                    if exists {
                        continue;
                    }

                    // Read the .easel file to get metadata
                    if let Ok(easel_file) = easel::EaselFile::load(&path) {
                        let _ = db::canvas::create_canvas_with_timestamps(
                            &conn,
                            &id,
                            &easel_file.name,
                            count + offset,
                            &easel_file.created_at,
                            &easel_file.updated_at,
                        );
                        offset += 1;
                    }
                }
            }
        }
    }

    db::canvas::list_canvases(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_canvas(state: State<'_, AppState>, name: String) -> Result<db::canvas::CanvasMeta, String> {
    let id = Uuid::new_v4().to_string();

    // Write .easel file FIRST, then DB entry
    let easel = easel::EaselFile::new(&name);
    let path = easel::canvas_easel_path(&state.app_data_dir, &id);
    easel.save(&path)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM canvases", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    match db::canvas::create_canvas(&conn, &id, &name, count) {
        Ok(meta) => Ok(meta),
        Err(e) => {
            // DB failed — clean up orphaned file
            let _ = std::fs::remove_file(&path);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn rename_canvas(state: State<'_, AppState>, id: String, name: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::canvas::rename_canvas(&conn, &id, &name).map_err(|e| e.to_string())?;

    // Also update the name in the .easel file
    let path = easel::canvas_easel_path(&state.app_data_dir, &id);
    if path.exists() {
        let mut easel_file = easel::EaselFile::load(&path)?;
        easel_file.name = name;
        easel_file.save(&path)?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_canvas(state: State<'_, AppState>, id: String) -> Result<(), String> {
    // Delete .easel file FIRST, then DB entry
    let path = easel::canvas_easel_path(&state.app_data_dir, &id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::canvas::delete_canvas(&conn, &id).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn import_easel_file(state: State<'_, AppState>, file_path: String) -> Result<db::canvas::CanvasMeta, String> {
    let source = std::path::PathBuf::from(&file_path);
    if !source.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let easel_file = easel::EaselFile::load(&source)?;

    let id = Uuid::new_v4().to_string();

    // Copy the .easel file to the canvases directory first
    let dest = easel::canvas_easel_path(&state.app_data_dir, &id);
    easel_file.save(&dest)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM canvases", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    match db::canvas::create_canvas(&conn, &id, &easel_file.name, count) {
        Ok(meta) => Ok(meta),
        Err(e) => {
            let _ = std::fs::remove_file(&dest);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn get_canvas_state(state: State<'_, AppState>, canvas_id: String) -> Result<Option<db::canvas::CanvasState>, String> {
    let path = easel::canvas_easel_path(&state.app_data_dir, &canvas_id);

    if !path.exists() {
        return Ok(None);
    }

    let easel_file = easel::EaselFile::load(&path)?;
    let canvas_json = serde_json::to_string(&easel_file.canvas)
        .map_err(|e| e.to_string())?;
    let viewport_transform = serde_json::to_string(&easel_file.viewport.transform)
        .map_err(|e| e.to_string())?;

    let theme_json = easel_file.theme.as_ref().and_then(|t| {
        serde_json::to_string(t).ok()
    });

    Ok(Some(db::canvas::CanvasState {
        canvas_id,
        canvas_json,
        zoom: easel_file.viewport.zoom,
        viewport_transform,
        theme_json,
        updated_at: easel_file.updated_at,
    }))
}

#[tauri::command]
pub fn save_canvas_state(
    state: State<'_, AppState>,
    canvas_id: String,
    canvas_json: String,
    zoom: f64,
    viewport_transform: String,
    theme_json: Option<String>,
) -> Result<(), String> {
    let path = easel::canvas_easel_path(&state.app_data_dir, &canvas_id);

    let canvas: serde_json::Value = serde_json::from_str(&canvas_json)
        .map_err(|e| format!("Invalid canvas JSON: {}", e))?;
    let transform: Vec<f64> = serde_json::from_str(&viewport_transform)
        .map_err(|e| format!("Invalid viewport transform: {}", e))?;

    // Load existing file or create new
    let mut easel_file = if path.exists() {
        easel::EaselFile::load(&path)?
    } else {
        // Get canvas name from DB
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let name = db::canvas::get_canvas_name(&conn, &canvas_id)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "Untitled".to_string());
        easel::EaselFile::new(&name)
    };

    easel_file.canvas = canvas;
    easel_file.viewport.zoom = zoom;
    easel_file.viewport.transform = transform;

    // Persist theme data if provided
    if let Some(ref tj) = theme_json {
        if !tj.is_empty() {
            easel_file.theme = serde_json::from_str::<serde_json::Value>(tj).ok();
        }
    }

    easel_file.save(&path)?;

    // Update timestamp in canvases table
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::canvas::update_canvas_timestamp(&conn, &canvas_id).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_canvas_thumbnail(
    state: State<'_, AppState>,
    canvas_id: String,
    data_url: String,
) -> Result<(), String> {
    // Strip the data URL prefix (e.g. "data:image/png;base64,")
    let base64_data = data_url
        .split(',')
        .nth(1)
        .ok_or("Invalid data URL format")?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let canvases_dir = easel::canvases_dir(&state.app_data_dir);
    let png_path = canvases_dir.join(format!("{}.png", canvas_id));

    std::fs::write(&png_path, bytes)
        .map_err(|e| format!("Failed to write thumbnail: {}", e))?;

    Ok(())
}
