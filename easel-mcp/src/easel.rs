use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EaselFile {
    pub format_version: u32,
    pub name: String,
    pub canvas: Value,
    pub viewport: ViewportState,
    #[serde(default)]
    pub theme: Option<ThemeData>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeData {
    pub modes: Vec<ThemeMode>,
    pub tokens: Vec<DesignToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMode {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignToken {
    pub name: String,
    #[serde(rename = "type")]
    pub token_type: String,
    pub values: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportState {
    pub zoom: f64,
    pub transform: Vec<f64>,
}

impl EaselFile {
    pub fn new(name: &str) -> Self {
        let now = Utc::now();
        Self {
            format_version: 1,
            name: name.to_string(),
            canvas: serde_json::json!({"version": "7.0.0", "objects": []}),
            viewport: ViewportState {
                zoom: 1.0,
                transform: vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            },
            theme: None,
            created_at: now,
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

    pub fn objects(&self) -> &Vec<Value> {
        static EMPTY: Vec<Value> = Vec::new();
        self.canvas
            .get("objects")
            .and_then(|v| v.as_array())
            .unwrap_or(&EMPTY)
    }

    pub fn objects_mut(&mut self) -> &mut Vec<Value> {
        self.canvas
            .as_object_mut()
            .expect("canvas must be an object")
            .entry("objects")
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .expect("objects must be an array")
    }

    /// Find an object by ID (flat search + recursive into groups)
    pub fn find_object(&self, id: &str) -> Option<&Value> {
        let objects = self.objects();
        // Top-level search
        for obj in objects {
            if obj.get("id").and_then(|v| v.as_str()) == Some(id) {
                return Some(obj);
            }
        }
        // Recursive search into groups
        for obj in objects {
            if let Some(children) = obj.get("objects").and_then(|v| v.as_array()) {
                for child in children {
                    if child.get("id").and_then(|v| v.as_str()) == Some(id) {
                        return Some(child);
                    }
                }
            }
        }
        None
    }

    /// Find a mutable reference to an object by ID.
    /// Uses index-based approach to satisfy the borrow checker.
    pub fn find_object_mut(&mut self, id: &str) -> Option<&mut Value> {
        let objects = self.objects_mut();

        // First: find index at top level
        let top_idx = objects
            .iter()
            .position(|obj| obj.get("id").and_then(|v| v.as_str()) == Some(id));

        if let Some(i) = top_idx {
            return Some(&mut objects[i]);
        }

        // Second: find (parent_idx, child_idx) inside groups
        let mut found: Option<(usize, usize)> = None;
        'outer: for i in 0..objects.len() {
            if let Some(children) = objects[i].get("objects").and_then(|v| v.as_array()) {
                for j in 0..children.len() {
                    if children[j].get("id").and_then(|v| v.as_str()) == Some(id) {
                        found = Some((i, j));
                        break 'outer;
                    }
                }
            }
        }

        if let Some((i, j)) = found {
            return objects[i]
                .get_mut("objects")
                .and_then(|v| v.as_array_mut())
                .and_then(|children| children.get_mut(j));
        }

        None
    }

    /// Remove objects by ID array. Returns IDs that were actually removed.
    pub fn remove_objects(&mut self, ids: &[String]) -> Vec<String> {
        let mut removed = Vec::new();
        let objects = self.objects_mut();

        for id in ids {
            let len_before = objects.len();
            objects.retain(|obj| obj.get("id").and_then(|v| v.as_str()) != Some(id));
            if objects.len() < len_before {
                removed.push(id.clone());
                continue;
            }
            // Also check inside groups
            for obj in objects.iter_mut() {
                if let Some(children) = obj.get_mut("objects").and_then(|v| v.as_array_mut()) {
                    let child_len_before = children.len();
                    children.retain(|c| c.get("id").and_then(|v| v.as_str()) != Some(id));
                    if children.len() < child_len_before {
                        removed.push(id.clone());
                    }
                }
            }
        }
        removed
    }
}
