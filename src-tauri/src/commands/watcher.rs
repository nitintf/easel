use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::easel;
use crate::state::AppState;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasFileChangedPayload {
    pub canvas_id: String,
}

#[tauri::command]
pub fn watch_canvas_file(app: AppHandle, canvas_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let path = easel::canvas_easel_path(&state.app_data_dir, &canvas_id);

    if !path.exists() {
        return Err(format!("Canvas file not found: {}", path.display()));
    }

    // Don't create duplicate watchers
    {
        let watchers = state.canvas_watchers.lock().map_err(|e| e.to_string())?;
        if watchers.contains_key(&canvas_id) {
            return Ok(());
        }
    }

    let app_handle = app.clone();
    let cid = canvas_id.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Only emit on data modifications (write/close), not metadata
                match event.kind {
                    EventKind::Modify(notify::event::ModifyKind::Data(_))
                    | EventKind::Create(_) => {
                        let _ = app_handle.emit(
                            "canvas-file-changed",
                            CanvasFileChangedPayload {
                                canvas_id: cid.clone(),
                            },
                        );
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    let mut watcher = watcher;
    watcher
        .watch(&path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;

    let mut watchers = state.canvas_watchers.lock().map_err(|e| e.to_string())?;
    watchers.insert(canvas_id, watcher);

    Ok(())
}

#[tauri::command]
pub fn unwatch_canvas_file(app: AppHandle, canvas_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut watchers = state.canvas_watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&canvas_id);
    Ok(())
}
