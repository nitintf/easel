use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::easel;
use crate::state::AppState;

/// Find the largest byte index <= `max` that is a valid UTF-8 char boundary.
fn safe_truncate(s: &str, max: usize) -> usize {
    if max >= s.len() {
        return s.len();
    }
    let mut i = max;
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartClaudeParams {
    pub run_id: String,
    pub prompt: String,
    pub canvas_id: String,
    pub model: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStreamPayload {
    pub run_id: String,
    pub event_type: String, // "started" | "stream_line" | "finished" | "error"
    pub data: String,
}

#[tauri::command]
pub async fn start_claude(
    app: AppHandle,
    state: State<'_, AppState>,
    params: StartClaudeParams,
) -> Result<(), String> {
    let run_id = params.run_id.clone();
    let app_data_dir = state.app_data_dir.clone();

    // Resolve canvas .easel file path
    let canvas_path = easel::canvas_easel_path(&app_data_dir, &params.canvas_id);
    let canvas_path_str = canvas_path
        .to_str()
        .ok_or("Invalid canvas path")?
        .to_string();

    // Resolve easel-mcp binary path
    // In dev: relative to the Cargo manifest dir
    // In prod: bundled alongside the app
    let mcp_binary = resolve_mcp_binary()?;

    // Build MCP config JSON
    let mcp_config = serde_json::json!({
        "mcpServers": {
            "easel": {
                "command": mcp_binary,
                "args": []
            }
        }
    });
    let mcp_config_str = serde_json::to_string(&mcp_config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;

    // Build system prompt with canvas context
    let system_prompt = format!(
        "You are an AI design assistant embedded inside Easel, a collaborative design canvas app.\n\n\
         CRITICAL RULES:\n\
         - The active canvas file is: {0}\n\
         - You MUST use ONLY the easel MCP tools to manipulate the canvas. The available tools are:\n\
           mcp__easel__create_object, mcp__easel__update_object, mcp__easel__delete_objects,\n\
           mcp__easel__get_canvas_state, mcp__easel__get_object, mcp__easel__list_easel_files,\n\
           mcp__easel__group_objects, mcp__easel__ungroup_objects, mcp__easel__reorder_object,\n\
           mcp__easel__get_viewport_info.\n\
         - ALWAYS pass file_path=\"{0}\" when calling any easel MCP tool.\n\
         - NEVER create, write, or save files outside of the MCP tools. Do NOT use Bash, Write, Edit, or any file system tools.\n\
         - NEVER create HTML, SVG, or any other files. Everything must go through the easel MCP tools.\n\n\
         DESIGN WORKFLOW — ALWAYS follow this process:\n\
         1. FIRST call mcp__easel__get_viewport_info to know the available canvas area.\n\
         2. Create a root frame (the \"artboard\") sized to fit the design within the recommended area.\n\
         3. Create section frames INSIDE the root frame using parent_id.\n\
         4. Place content (text, rect, icons) INSIDE section frames using parent_id.\n\
         5. NEVER place raw text/shapes at the root level — always nest inside frames.\n\n\
         SIZING — The canvas viewport is approximately 1200x800 pixels:\n\
         - Root frame: 400-500px wide for cards, 800-1000px for full pages.\n\
         - Use get_canvas_state to check existing content before creating.\n\
         - Text sizes: headings 24-32px, subheadings 16-20px, body 14-16px, captions 11-13px.\n\
         - Buttons: height 36-44px, horizontal padding 16-24px.\n\
         - Input fields: height 36-40px, full width within parent.\n\
         - Icons: 16-24px for UI, 32-48px for decorative.\n\n\
         AUTO-LAYOUT — Use layout_direction on EVERY frame:\n\
         - Cards/sections: layout_direction=\"vertical\", layout_gap=12-16.\n\
         - Button rows: layout_direction=\"horizontal\", layout_gap=8-12.\n\
         - Always set layout_padding=16-24 on container frames.\n\
         - Use resize_mode_w=\"fill\" on children that should stretch to parent width.\n\
         - Use resize_mode_h=\"hug\" on frames that should shrink to content.\n\n\
         TYPOGRAPHY:\n\
         - font_weight=\"700\" for headings, \"600\" for subheadings, \"400\" for body.\n\
         - font_style=\"italic\" for emphasis.\n\
         - text_align=\"center\" for buttons and centered sections.\n\
         - line_height=1.4-1.6 for body text.\n\
         - Use split_by_grapheme=true on text inside frames so text wraps within frame bounds.\n\n\
         SPACING:\n\
         - Consistent padding: 16px for tight, 24px for normal, 32px for spacious.\n\
         - Gap between sections: 16-24px. Gap between elements in a section: 8-12px.\n\n\
         COLORS:\n\
         - Always use specific hex colors, not defaults.\n\
         - Backgrounds: light (#ffffff, #f8f9fa, #f1f3f5) or dark (#1a1a2e, #16213e, #0f0f23).\n\
         - Primary actions: bold colors (#4f46e5, #2563eb, #7c3aed).\n\
         - Text: #111827 on light, #f9fafb on dark.\n\
         - Borders: #e5e7eb on light, #374151 on dark.\n\
         - Use corner_radius=8-12 for cards, 6-8 for buttons, 4 for inputs.\n\n\
         COMMON PATTERNS:\n\
         - Card: frame(vertical, padding=24, corner_radius=12, fill=#ffffff, shadow) containing:\n\
           heading text (24px, bold), description text (14px, #6b7280),\n\
           button frame(horizontal, padding=12/24, corner_radius=8, fill=#4f46e5) with button text (14px, white, center).\n\
         - Form input: frame(vertical, gap=4) containing:\n\
           label text (13px, #374151, font_weight=500),\n\
           input rect (height=40, corner_radius=6, fill=#f9fafb, stroke=#d1d5db).\n\
         - Always use parent_id to nest children inside their parent frame.\n\n\
         OBJECT TYPES:\n\
         - rect: Rectangle. corner_radius for rounded corners.\n\
         - ellipse: Ellipse/circle.\n\
         - text: Textbox. font_size, font_weight, font_family, font_style, text_align, line_height, split_by_grapheme.\n\
         - frame: Container frame. layout_direction, layout_gap, layout_padding, resize_mode_w/h.\n\
         - icon: Icon from icon libraries (lucide, material-symbols, feather, phosphor). icon_name, icon_library, icon_color.\n\
         - line, triangle, polygon, path: Shapes.\n\n\
         COMMON PROPERTIES:\n\
         - fill, stroke: Hex colors. opacity: 0.0-1.0. angle: Rotation degrees.\n\
         - stroke_width, corner_radius, shadow_color/blur/offset_x/offset_y, stroke_dash_array.\n\n\
         Keep responses concise — focus on taking action with tools rather than lengthy explanations.",
        canvas_path_str
    );

    // Map model names to Claude CLI model identifiers
    let model_flag = match params.model.as_str() {
        "claude-sonnet" => "sonnet",
        "claude-opus" => "opus",
        "claude-haiku" => "haiku",
        other => other,
    };

    // Build command arguments
    // --tools "" disables all built-in tools (Bash, Write, Edit, etc.)
    // so Claude can ONLY use the easel MCP tools
    let mut args: Vec<String> = vec![
        "-p".to_string(),
        params.prompt.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--model".to_string(),
        model_flag.to_string(),
        "--mcp-config".to_string(),
        mcp_config_str,
        "--strict-mcp-config".to_string(),
        "--tools".to_string(),
        "".to_string(),
        "--allowedTools".to_string(),
        "mcp__easel__*".to_string(),
        "--system-prompt".to_string(),
        system_prompt,
    ];

    // If resuming an existing conversation
    if let Some(ref session_id) = params.session_id {
        args.push("--resume".to_string());
        args.push(session_id.clone());
    }

    // Log the full command for debugging
    println!("[claude] Spawning: claude {}", args.iter().enumerate().map(|(i, a)| {
        if i == 1 || args.get(i.wrapping_sub(1)).map(|s| s.as_str()) == Some("--system-prompt") {
            // Truncate long values (prompt, system-prompt)
            if a.len() > 80 { let b = safe_truncate(a, 80); format!("\"{}...\"", &a[..b]) } else { format!("\"{}\"", a) }
        } else if args.get(i.wrapping_sub(1)).map(|s| s.as_str()) == Some("--mcp-config") {
            "\"<mcp-config-json>\"".to_string()
        } else {
            a.clone()
        }
    }).collect::<Vec<_>>().join(" "));

    // Spawn the Claude CLI process
    let mut child = Command::new("claude")
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn claude CLI: {}. Is claude installed and in PATH?", e))?;

    println!("[claude] Process spawned with PID: {:?}", child.id());

    // Store PID for cancellation
    if let Some(pid) = child.id() {
        let mut pids = state.claude_pids.lock().unwrap();
        pids.insert(run_id.clone(), pid);
    }

    // Emit "started" event
    let _ = app.emit(
        "claude-stream",
        ClaudeStreamPayload {
            run_id: run_id.clone(),
            event_type: "started".to_string(),
            data: String::new(),
        },
    );

    // Spawn background task to read stdout and emit events
    let app_handle = app.clone();
    let run_id_clone = run_id.clone();
    let state_for_cleanup: AppHandle = app.clone();

    tokio::spawn(async move {
        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let stderr = child.stderr.take().expect("Failed to capture stderr");
        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        // Read stdout and stderr concurrently
        println!("[claude][{}] Reading stream...", run_id_clone);
        let mut stdout_done = false;
        let mut stderr_done = false;

        loop {
            if stdout_done && stderr_done {
                break;
            }
            tokio::select! {
                line = stdout_reader.next_line(), if !stdout_done => {
                    match line {
                        Ok(Some(line)) if !line.trim().is_empty() => {
                            // Log to terminal — truncate very long lines for readability
                            let display = if line.len() > 500 {
                                let boundary = safe_truncate(&line, 500);
                                format!("{}...(truncated {} chars)", &line[..boundary], line.len() - boundary)
                            } else {
                                line.clone()
                            };
                            println!("[claude][{}] stdout: {}", run_id_clone, display);

                            let _ = app_handle.emit(
                                "claude-stream",
                                ClaudeStreamPayload {
                                    run_id: run_id_clone.clone(),
                                    event_type: "stream_line".to_string(),
                                    data: line,
                                },
                            );
                        }
                        Ok(None) => {
                            println!("[claude][{}] stdout closed", run_id_clone);
                            stdout_done = true;
                        }
                        _ => {}
                    }
                }
                line = stderr_reader.next_line(), if !stderr_done => {
                    match line {
                        Ok(Some(line)) if !line.trim().is_empty() => {
                            eprintln!("[claude][{}] stderr: {}", run_id_clone, line);
                        }
                        Ok(None) => {
                            stderr_done = true;
                        }
                        _ => {}
                    }
                }
            }
        }

        // Wait for the process to finish
        let status = child.wait().await;
        let event_type = match &status {
            Ok(s) if s.success() => "finished",
            _ => "error",
        };
        let data = match &status {
            Ok(s) if s.success() => format!("Process exited with status: {}", s),
            Ok(s) => format!("error: process exited with status: {}", s),
            Err(e) => format!("Process error: {}", e),
        };
        println!("[claude][{}] {}: {}", run_id_clone, event_type, data);

        let _ = app_handle.emit(
            "claude-stream",
            ClaudeStreamPayload {
                run_id: run_id_clone.clone(),
                event_type: event_type.to_string(),
                data,
            },
        );

        // Clean up PID from state
        let state = state_for_cleanup.state::<AppState>();
        let mut pids = state.claude_pids.lock().unwrap();
        pids.remove(&run_id_clone);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_claude(state: State<'_, AppState>, run_id: String) -> Result<(), String> {
    let pid = {
        let mut pids = state.claude_pids.lock().unwrap();
        pids.remove(&run_id)
    };

    match pid {
        Some(pid) => {
            let _ = std::process::Command::new("kill")
                .arg(pid.to_string())
                .spawn();
            Ok(())
        }
        None => Err(format!("No running Claude process found for run_id: {}", run_id)),
    }
}

#[tauri::command]
pub async fn get_canvas_path(
    state: State<'_, AppState>,
    canvas_id: String,
) -> Result<String, String> {
    let path = easel::canvas_easel_path(&state.app_data_dir, &canvas_id);
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid canvas path".to_string())
}

fn resolve_mcp_binary() -> Result<String, String> {
    // In development: look for the binary relative to the Cargo manifest
    let dev_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../easel-mcp/target/debug/easel-mcp"
    );
    if std::path::Path::new(dev_path).exists() {
        return Ok(dev_path.to_string());
    }

    // Also try release build
    let release_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../easel-mcp/target/release/easel-mcp"
    );
    if std::path::Path::new(release_path).exists() {
        return Ok(release_path.to_string());
    }

    // Fallback: try to find it in PATH
    Err(
        "Could not find easel-mcp binary. Build it with: cd easel-mcp && cargo build".to_string(),
    )
}
