use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::RecommendedWatcher;
use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub app_data_dir: PathBuf,
    /// Tracks running Claude CLI process PIDs by run_id for cancellation
    pub claude_pids: Mutex<HashMap<String, u32>>,
    /// File watchers for canvas .easel files, keyed by canvas_id
    pub canvas_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    /// Whether reconciliation has already run
    pub reconciled: Mutex<bool>,
}
