use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EaselFile {
    pub format_version: u32,
    pub name: String,
    pub canvas: Value,
    pub viewport: ViewportState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportState {
    pub zoom: f64,
    pub transform: Vec<f64>,
}

impl EaselFile {
    pub fn new(name: &str) -> Self {
        let now = chrono_now();
        Self {
            format_version: 1,
            name: name.to_string(),
            canvas: serde_json::json!({"version": "7.0.0", "objects": []}),
            viewport: ViewportState {
                zoom: 1.0,
                transform: vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            },
            theme: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        // Atomic write: write to .tmp then rename
        let tmp_path = path.with_extension("easel.tmp");
        fs::write(&tmp_path, &json)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        fs::rename(&tmp_path, path)
            .map_err(|e| format!("Failed to rename temp file: {}", e))?;
        Ok(())
    }
}

fn chrono_now() -> String {
    // ISO 8601 timestamp without external chrono dependency
    // We use the same format as SQLite's datetime('now')
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // Format as UTC datetime string
    let secs_per_day = 86400u64;
    let days = now / secs_per_day;
    let rem = now % secs_per_day;
    let hours = rem / 3600;
    let minutes = (rem % 3600) / 60;
    let seconds = rem % 60;

    // Days since 1970-01-01
    let mut y = 1970i64;
    let mut remaining_days = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        y += 1;
    }
    let month_days: &[i64] = if is_leap(y) {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    for &md in month_days {
        if remaining_days < md {
            break;
        }
        remaining_days -= md;
        m += 1;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        remaining_days + 1,
        hours,
        minutes,
        seconds
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Path to the canvases directory
pub fn canvases_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("canvases")
}

/// Path to a specific canvas .easel file
pub fn canvas_easel_path(app_data_dir: &Path, canvas_id: &str) -> PathBuf {
    canvases_dir(app_data_dir).join(format!("{}.easel", canvas_id))
}

/// One-time migration: convert existing canvas_states DB rows to .easel files.
/// Silently skips if the table doesn't exist or has no rows.
pub fn migrate_canvas_states_to_files(conn: &Connection, app_data_dir: &Path) {
    // Check if canvas_states table exists
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='canvas_states'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !table_exists {
        return;
    }

    // Check if there are any rows
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM canvas_states", [], |row| row.get(0))
        .unwrap_or(0);

    if count == 0 {
        return;
    }

    let canvases_path = canvases_dir(app_data_dir);
    fs::create_dir_all(&canvases_path).ok();

    let mut stmt = conn
        .prepare(
            "SELECT cs.canvas_id, c.name, cs.canvas_json, cs.zoom, cs.viewport_transform, c.created_at, c.updated_at
             FROM canvas_states cs
             JOIN canvases c ON c.id = cs.canvas_id"
        )
        .unwrap();

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .unwrap();

    for row in rows.flatten() {
        let (canvas_id, name, canvas_json, zoom, viewport_transform, created_at, updated_at) = row;

        let easel_path = canvas_easel_path(app_data_dir, &canvas_id);

        // Don't overwrite if file already exists (idempotent)
        if easel_path.exists() {
            continue;
        }

        let canvas: Value = serde_json::from_str(&canvas_json).unwrap_or_else(|_| {
            serde_json::json!({"version": "7.0.0", "objects": []})
        });

        let transform: Vec<f64> = serde_json::from_str(&viewport_transform)
            .unwrap_or_else(|_| vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

        let easel = EaselFile {
            format_version: 1,
            name,
            canvas,
            viewport: ViewportState { zoom, transform },
            theme: None,
            created_at,
            updated_at,
        };

        if let Err(e) = easel.save(&easel_path) {
            eprintln!("Warning: failed to migrate canvas {}: {}", canvas_id, e);
        }
    }
}
