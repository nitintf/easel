use chrono::Utc;
use glob::glob;
use rmcp::{
    ErrorData as McpError, ServerHandler,
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::*,
    schemars, tool, tool_handler, tool_router,
};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use uuid::Uuid;

use crate::easel::{DesignToken, EaselFile, ThemeData, ThemeMode};

// ── Parameter structs ───────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct CreateEaselFileParams {
    #[schemars(description = "Path where the new .easel file should be created")]
    pub file_path: String,
    #[schemars(description = "Name for the canvas")]
    #[serde(default = "default_canvas_name")]
    pub name: String,
}

fn default_canvas_name() -> String {
    "Untitled".to_string()
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListEaselFilesParams {
    #[schemars(description = "Directory path to search for .easel files")]
    pub directory: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetCanvasStateParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetObjectParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Object ID to retrieve")]
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct CreateObjectParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Object type: rect, ellipse, text, frame, icon, line, triangle, polygon, or path")]
    #[serde(rename = "type")]
    pub object_type: String,
    #[schemars(description = "X position (left)")]
    #[serde(default = "default_position")]
    pub x: f64,
    #[schemars(description = "Y position (top)")]
    #[serde(default = "default_position")]
    pub y: f64,
    #[schemars(description = "Width of the object")]
    #[serde(default = "default_size")]
    pub width: f64,
    #[schemars(description = "Height of the object")]
    #[serde(default = "default_size")]
    pub height: f64,
    #[schemars(description = "Fill color (hex)")]
    pub fill: Option<String>,
    #[schemars(description = "Stroke color (hex)")]
    pub stroke: Option<String>,
    #[schemars(description = "Optional name for the object")]
    pub name: Option<String>,
    #[schemars(description = "Text content (only for type=text), or SVG path string (for type=path)")]
    pub text: Option<String>,
    #[schemars(description = "Font size (only for type=text)")]
    pub font_size: Option<f64>,
    #[schemars(description = "Shadow color (hex, e.g. '#000000')")]
    pub shadow_color: Option<String>,
    #[schemars(description = "Shadow blur radius in pixels")]
    pub shadow_blur: Option<f64>,
    #[schemars(description = "Shadow horizontal offset in pixels")]
    pub shadow_offset_x: Option<f64>,
    #[schemars(description = "Shadow vertical offset in pixels")]
    pub shadow_offset_y: Option<f64>,
    #[schemars(description = "Stroke dash array (e.g. [8,8] for dashed)")]
    pub stroke_dash_array: Option<Vec<f64>>,
    #[schemars(description = "Corner radius for rounded rectangles (rx/ry)")]
    pub corner_radius: Option<f64>,
    #[schemars(description = "Opacity from 0.0 (transparent) to 1.0 (opaque)")]
    pub opacity: Option<f64>,
    #[schemars(description = "Rotation angle in degrees")]
    pub angle: Option<f64>,
    #[schemars(description = "Stroke width (default: 1)")]
    pub stroke_width: Option<f64>,
    #[schemars(description = "Font weight: 'normal', 'bold', or numeric '100'-'900' (text only)")]
    pub font_weight: Option<String>,
    #[schemars(description = "Font style: 'normal' or 'italic' (text only)")]
    pub font_style: Option<String>,
    #[schemars(description = "Wrap text by character within textbox width (text only, default false). Set to true for text inside auto-layout frames so text wraps within frame bounds.")]
    pub split_by_grapheme: Option<bool>,
    #[schemars(description = "Font family override (text only, default: 'Inter, system-ui, sans-serif')")]
    pub font_family: Option<String>,
    #[schemars(description = "Text alignment: 'left', 'center', or 'right' (text only)")]
    pub text_align: Option<String>,
    #[schemars(description = "Line height multiplier (text only, e.g. 1.5)")]
    pub line_height: Option<f64>,
    #[schemars(description = "X2 position for line end point (line only)")]
    pub x2: Option<f64>,
    #[schemars(description = "Y2 position for line end point (line only)")]
    pub y2: Option<f64>,
    // Layout properties (frame objects)
    #[schemars(description = "Auto-layout direction: 'horizontal', 'vertical', or 'none' (frame only)")]
    pub layout_direction: Option<String>,
    #[schemars(description = "Cross-axis alignment: 'start', 'center', 'end', or 'stretch' (frame only)")]
    pub layout_align_items: Option<String>,
    #[schemars(description = "Main-axis distribution: 'start', 'center', 'end', 'space-between', or 'space-around' (frame only)")]
    pub layout_justify_content: Option<String>,
    #[schemars(description = "Gap between children in pixels (frame only)")]
    pub layout_gap: Option<f64>,
    #[schemars(description = "Uniform padding for all sides in pixels (frame only)")]
    pub layout_padding: Option<f64>,
    #[schemars(description = "Top padding in pixels (frame only, overrides layout_padding)")]
    pub layout_padding_top: Option<f64>,
    #[schemars(description = "Right padding in pixels (frame only, overrides layout_padding)")]
    pub layout_padding_right: Option<f64>,
    #[schemars(description = "Bottom padding in pixels (frame only, overrides layout_padding)")]
    pub layout_padding_bottom: Option<f64>,
    #[schemars(description = "Left padding in pixels (frame only, overrides layout_padding)")]
    pub layout_padding_left: Option<f64>,
    #[schemars(description = "Clip children that overflow the frame bounds (frame only)")]
    pub clip_content: Option<bool>,
    #[schemars(description = "Width resize mode: 'fixed', 'hug' (frame), or 'fill' (child in frame)")]
    pub resize_mode_w: Option<String>,
    #[schemars(description = "Height resize mode: 'fixed', 'hug' (frame), or 'fill' (child in frame)")]
    pub resize_mode_h: Option<String>,
    // Icon properties (icon objects)
    #[schemars(description = "Icon name (e.g. 'heart', 'arrow-right') — for type=icon only")]
    pub icon_name: Option<String>,
    #[schemars(description = "Icon library: 'lucide', 'material-symbols', 'feather', or 'phosphor' — for type=icon only")]
    pub icon_library: Option<String>,
    #[schemars(description = "Icon color (hex) — for type=icon only")]
    pub icon_color: Option<String>,
    // Additional text properties
    #[schemars(description = "Letter spacing in 1/1000 em units (text only)")]
    pub letter_spacing: Option<f64>,
    #[schemars(description = "Underline text (text only)")]
    pub underline: Option<bool>,
    #[schemars(description = "Strikethrough text (text only)")]
    pub linethrough: Option<bool>,
    #[schemars(description = "Vertical text alignment: 'top', 'middle', or 'bottom' (text only)")]
    pub vertical_align: Option<String>,
    // Parent frame assignment
    #[schemars(description = "ID of the parent frame to place this object inside")]
    pub parent_id: Option<String>,
    // Component slots
    #[schemars(description = "Mark this object as a component")]
    pub is_component: Option<bool>,
    #[schemars(description = "Array of accepted child component definitions (slots)")]
    pub slots: Option<Vec<SlotParam>>,
    // Theme mode
    #[schemars(description = "Active theme mode ID for this object")]
    pub theme_mode: Option<String>,
    // AI context
    #[schemars(description = "AI context description — helps Claude Code understand what this object/component is")]
    pub context: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SlotParam {
    #[schemars(description = "ID of the component allowed in this slot")]
    pub component_id: String,
    #[schemars(description = "Display name of the component")]
    pub component_name: String,
}

fn default_position() -> f64 {
    100.0
}
fn default_size() -> f64 {
    200.0
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateObjectParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Object ID to update")]
    pub id: String,
    #[schemars(description = "Properties to update (e.g. left, top, width, height, fill, stroke, name, text, fontSize, opacity, angle, rx, ry, fontWeight, fontFamily, fontStyle, textAlign, lineHeight, splitByGrapheme, layoutDirection, layoutAlignItems, layoutJustifyContent, layoutGap, layoutPaddingTop, layoutPaddingRight, layoutPaddingBottom, layoutPaddingLeft, clipContent, resizeModeW, resizeModeH, iconName, iconLibrary, iconColor, charSpacing, underline, linethrough, verticalAlign, parentId, isComponent, slots, themeMode)")]
    pub properties: Value,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct DeleteObjectsParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Array of object IDs to delete")]
    pub ids: Vec<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GroupObjectsParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Array of object IDs to group together")]
    pub ids: Vec<String>,
    #[schemars(description = "Optional name for the group")]
    pub name: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UngroupObjectsParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "ID of the group to dissolve")]
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct AlignObjectsParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Array of object IDs to align")]
    pub ids: Vec<String>,
    #[schemars(description = "Alignment direction: 'left', 'center-h', 'right', 'top', 'center-v', 'bottom', 'distribute-h', or 'distribute-v'")]
    pub alignment: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ReorderObjectParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Object ID to reorder")]
    pub id: String,
    #[schemars(description = "Direction: 'front', 'back', 'forward' (one step up), or 'backward' (one step down)")]
    pub direction: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetViewportInfoParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetDesignTokensParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SetDesignTokensParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
    #[schemars(description = "Array of theme modes, each with id and name")]
    pub modes: Vec<SetThemeModeParam>,
    #[schemars(description = "Array of design tokens with name, type, and per-mode values")]
    pub tokens: Vec<SetDesignTokenParam>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SetThemeModeParam {
    #[schemars(description = "Unique mode ID")]
    pub id: String,
    #[schemars(description = "Display name for the mode (e.g. 'Light', 'Dark')")]
    pub name: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SetDesignTokenParam {
    #[schemars(description = "Token name (e.g. 'primary-color')")]
    pub name: String,
    #[schemars(description = "Token type: 'color', 'number', or 'string'")]
    #[serde(rename = "type")]
    pub token_type: String,
    #[schemars(description = "Per-mode values as key-value pairs where key is mode ID")]
    pub values: std::collections::HashMap<String, String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetScreenshotParams {
    #[schemars(description = "Path to the .easel file")]
    pub file_path: String,
}

// ── Response structs ────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EaselFileInfo {
    path: String,
    name: String,
    object_count: usize,
}

// ── Helper: apply common optional properties to a JSON object ───────────────

fn apply_common_props(obj: &mut Value, params: &CreateObjectParams) {
    let map = obj.as_object_mut().unwrap();

    if let Some(opacity) = params.opacity {
        map.insert("opacity".to_string(), serde_json::json!(opacity));
    }
    if let Some(angle) = params.angle {
        map.insert("angle".to_string(), serde_json::json!(angle));
    }
    if let Some(stroke_width) = params.stroke_width {
        map.insert("strokeWidth".to_string(), serde_json::json!(stroke_width));
    }
    if let Some(ref shadow_color) = params.shadow_color {
        let shadow = serde_json::json!({
            "color": shadow_color,
            "blur": params.shadow_blur.unwrap_or(10.0),
            "offsetX": params.shadow_offset_x.unwrap_or(0.0),
            "offsetY": params.shadow_offset_y.unwrap_or(4.0),
        });
        map.insert("shadow".to_string(), shadow);
    }
    if let Some(ref dash) = params.stroke_dash_array {
        map.insert("strokeDashArray".to_string(), serde_json::json!(dash));
    }

    // Layout properties
    if let Some(ref v) = params.layout_direction {
        map.insert("layoutDirection".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = params.layout_align_items {
        map.insert("layoutAlignItems".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = params.layout_justify_content {
        map.insert("layoutJustifyContent".to_string(), serde_json::json!(v));
    }
    if let Some(v) = params.layout_gap {
        map.insert("layoutGap".to_string(), serde_json::json!(v));
    }

    // Padding: per-side overrides uniform
    let uniform_pad = params.layout_padding.unwrap_or(0.0);
    if params.layout_padding.is_some() || params.layout_padding_top.is_some() {
        map.insert("layoutPaddingTop".to_string(), serde_json::json!(params.layout_padding_top.unwrap_or(uniform_pad)));
    }
    if params.layout_padding.is_some() || params.layout_padding_right.is_some() {
        map.insert("layoutPaddingRight".to_string(), serde_json::json!(params.layout_padding_right.unwrap_or(uniform_pad)));
    }
    if params.layout_padding.is_some() || params.layout_padding_bottom.is_some() {
        map.insert("layoutPaddingBottom".to_string(), serde_json::json!(params.layout_padding_bottom.unwrap_or(uniform_pad)));
    }
    if params.layout_padding.is_some() || params.layout_padding_left.is_some() {
        map.insert("layoutPaddingLeft".to_string(), serde_json::json!(params.layout_padding_left.unwrap_or(uniform_pad)));
    }

    if let Some(v) = params.clip_content {
        map.insert("clipContent".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = params.resize_mode_w {
        map.insert("resizeModeW".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = params.resize_mode_h {
        map.insert("resizeModeH".to_string(), serde_json::json!(v));
    }

    // Text enhancements
    if let Some(v) = params.letter_spacing {
        map.insert("charSpacing".to_string(), serde_json::json!(v));
    }
    if let Some(v) = params.underline {
        map.insert("underline".to_string(), serde_json::json!(v));
    }
    if let Some(v) = params.linethrough {
        map.insert("linethrough".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = params.vertical_align {
        map.insert("verticalAlign".to_string(), serde_json::json!(v));
    }

    // Parent frame
    if let Some(ref v) = params.parent_id {
        map.insert("parentId".to_string(), serde_json::json!(v));
    }

    // Component
    if let Some(v) = params.is_component {
        map.insert("isComponent".to_string(), serde_json::json!(v));
    }

    // Slots
    if let Some(ref slots) = params.slots {
        let slot_arr: Vec<Value> = slots.iter().map(|s| {
            serde_json::json!({
                "componentId": s.component_id,
                "componentName": s.component_name
            })
        }).collect();
        map.insert("slots".to_string(), serde_json::json!(slot_arr));
    }

    // Theme mode
    if let Some(ref v) = params.theme_mode {
        map.insert("themeMode".to_string(), serde_json::json!(v));
    }

    // AI context
    if let Some(ref v) = params.context {
        map.insert("context".to_string(), serde_json::json!(v));
    }

    // Font style & text wrapping
    if let Some(ref v) = params.font_style {
        map.insert("fontStyle".to_string(), serde_json::json!(v));
    }
    if let Some(v) = params.split_by_grapheme {
        map.insert("splitByGrapheme".to_string(), serde_json::json!(v));
    }
}

// ── MCP Server ──────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct EaselMcpServer {
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl EaselMcpServer {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    /// Create a new empty .easel file at the given path.
    #[tool(name = "create_easel_file", description = "Create a new empty .easel canvas file at the given path")]
    fn create_easel_file(
        &self,
        Parameters(params): Parameters<CreateEaselFileParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);

        if path.exists() {
            return Err(McpError::invalid_params(
                format!("File already exists: {}", path.display()),
                None,
            ));
        }

        let easel = EaselFile::new(&params.name);
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "filePath": path.display().to_string(),
            "name": params.name,
            "message": "Created new .easel file"
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// List .easel files in a directory, showing paths, names, and object counts.
    #[tool(name = "list_easel_files", description = "List .easel files in a directory with their paths, names, and object counts")]
    fn list_easel_files(
        &self,
        Parameters(params): Parameters<ListEaselFilesParams>,
    ) -> Result<CallToolResult, McpError> {
        let pattern = format!("{}/**/*.easel", params.directory);
        let mut files = Vec::new();

        let entries = glob(&pattern).map_err(|e| {
            McpError::internal_error(format!("Invalid glob pattern: {}", e), None)
        })?;

        for entry in entries.flatten() {
            match EaselFile::load(&entry) {
                Ok(easel) => {
                    files.push(EaselFileInfo {
                        path: entry.display().to_string(),
                        name: easel.name.clone(),
                        object_count: easel.objects().len(),
                    });
                }
                Err(_) => continue,
            }
        }

        let json = serde_json::to_string_pretty(&files)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Read the full object tree from an .easel file.
    #[tool(name = "get_canvas_state", description = "Read the full canvas object tree from an .easel file")]
    fn get_canvas_state(
        &self,
        Parameters(params): Parameters<GetCanvasStateParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let json = serde_json::to_string_pretty(&easel.canvas)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get detailed properties of a single object by ID.
    #[tool(name = "get_object", description = "Get detailed properties of a single canvas object by its ID")]
    fn get_object(
        &self,
        Parameters(params): Parameters<GetObjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let obj = easel.find_object(&params.id).ok_or_else(|| {
            McpError::internal_error(format!("Object not found: {}", params.id), None)
        })?;

        let json = serde_json::to_string_pretty(obj)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Create a new object in an .easel file.
    #[tool(name = "create_object", description = "Create a new canvas object (rect, ellipse, text, frame, icon, line, triangle, polygon, or path) in an .easel file. Frames support auto-layout (layout_direction, layout_gap, layout_padding, etc). Icons render from icon libraries (lucide, material-symbols, feather, phosphor).")]
    fn create_object(
        &self,
        Parameters(params): Parameters<CreateObjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = if path.exists() {
            EaselFile::load(&path).map_err(|e| McpError::internal_error(e, None))?
        } else {
            EaselFile::new("Untitled")
        };

        let id = Uuid::new_v4().to_string();

        let mut obj = match params.object_type.as_str() {
            "rect" => {
                let fill = params.fill.clone().unwrap_or_else(|| "#d9d9d9".to_string());
                let stroke = params.stroke.clone().unwrap_or_else(|| "#b3b3b3".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Rectangle".to_string());
                let sw = params.stroke_width.unwrap_or(1.0);
                let mut r = serde_json::json!({
                    "type": "Rect",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "height": params.height,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                });
                if let Some(cr) = params.corner_radius {
                    r["rx"] = serde_json::json!(cr);
                    r["ry"] = serde_json::json!(cr);
                }
                r
            }
            "ellipse" => {
                let fill = params.fill.clone().unwrap_or_else(|| "#d9d9d9".to_string());
                let stroke = params.stroke.clone().unwrap_or_else(|| "#b3b3b3".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Ellipse".to_string());
                let sw = params.stroke_width.unwrap_or(1.0);
                serde_json::json!({
                    "type": "Ellipse",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "rx": params.width / 2.0,
                    "ry": params.height / 2.0,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            "text" => {
                let fill = params.fill.clone().unwrap_or_else(|| "#ffffff".to_string());
                let text_content = params.text.clone().unwrap_or_else(|| "Text".to_string());
                let font_size = params.font_size.unwrap_or(16.0);
                let name = params.name.clone().unwrap_or_else(|| "Text".to_string());
                let font_family = params.font_family.clone().unwrap_or_else(|| "Inter, system-ui, sans-serif".to_string());
                let font_weight = params.font_weight.clone().unwrap_or_else(|| "normal".to_string());
                let text_align = params.text_align.clone().unwrap_or_else(|| "left".to_string());
                let sw = params.stroke_width.unwrap_or(0.0);
                let mut t = serde_json::json!({
                    "type": "Textbox",
                    "id": id,
                    "name": name,
                    "text": text_content,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "fontSize": font_size,
                    "fontFamily": font_family,
                    "fontWeight": font_weight,
                    "textAlign": text_align,
                    "fill": fill,
                    "splitByGrapheme": false,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                });
                if sw > 0.0 {
                    if let Some(ref stroke) = params.stroke {
                        t["stroke"] = serde_json::json!(stroke);
                        t["strokeWidth"] = serde_json::json!(sw);
                    }
                }
                if let Some(lh) = params.line_height {
                    t["lineHeight"] = serde_json::json!(lh);
                }
                if let Some(ls) = params.letter_spacing {
                    t["charSpacing"] = serde_json::json!(ls);
                }
                if let Some(ul) = params.underline {
                    t["underline"] = serde_json::json!(ul);
                }
                if let Some(lt) = params.linethrough {
                    t["linethrough"] = serde_json::json!(lt);
                }
                if let Some(ref va) = params.vertical_align {
                    t["verticalAlign"] = serde_json::json!(va);
                }
                if let Some(ref fs) = params.font_style {
                    t["fontStyle"] = serde_json::json!(fs);
                }
                if let Some(sbg) = params.split_by_grapheme {
                    t["splitByGrapheme"] = serde_json::json!(sbg);
                }
                t
            }
            "frame" => {
                let name = params.name.clone().unwrap_or_else(|| "Frame".to_string());
                let fill = params.fill.clone().unwrap_or_else(|| "#ffffff".to_string());
                let mut f = serde_json::json!({
                    "type": "Rect",
                    "id": id,
                    "name": name,
                    "isFrame": true,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "height": params.height,
                    "fill": fill,
                    "stroke": "#e0e0e0",
                    "strokeWidth": 1,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                });
                // Layout props applied via apply_common_props, but also set defaults if direction specified
                if let Some(ref dir) = params.layout_direction {
                    f["layoutDirection"] = serde_json::json!(dir);
                }
                f
            }
            "line" => {
                let stroke = params.stroke.clone().unwrap_or_else(|| "#ffffff".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Line".to_string());
                let sw = params.stroke_width.unwrap_or(2.0);
                let x2 = params.x2.unwrap_or(params.x + params.width);
                let y2 = params.y2.unwrap_or(params.y);
                serde_json::json!({
                    "type": "Line",
                    "id": id,
                    "name": name,
                    "x1": params.x,
                    "y1": params.y,
                    "x2": x2,
                    "y2": y2,
                    "left": params.x.min(x2),
                    "top": params.y.min(y2),
                    "width": (x2 - params.x).abs(),
                    "height": (y2 - params.y).abs(),
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            "triangle" => {
                let fill = params.fill.clone().unwrap_or_else(|| "#d9d9d9".to_string());
                let stroke = params.stroke.clone().unwrap_or_else(|| "#b3b3b3".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Triangle".to_string());
                let sw = params.stroke_width.unwrap_or(1.0);
                serde_json::json!({
                    "type": "Triangle",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "height": params.height,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            "polygon" => {
                let fill = params.fill.clone().unwrap_or_else(|| "#d9d9d9".to_string());
                let stroke = params.stroke.clone().unwrap_or_else(|| "#b3b3b3".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Polygon".to_string());
                let sw = params.stroke_width.unwrap_or(1.0);
                // Default hexagon
                let cx = params.width / 2.0;
                let cy = params.height / 2.0;
                let rx = params.width / 2.0;
                let ry = params.height / 2.0;
                let sides = 6;
                let points: Vec<Value> = (0..sides)
                    .map(|i| {
                        let angle = std::f64::consts::PI * 2.0 * (i as f64) / (sides as f64) - std::f64::consts::FRAC_PI_2;
                        serde_json::json!({ "x": cx + rx * angle.cos(), "y": cy + ry * angle.sin() })
                    })
                    .collect();
                serde_json::json!({
                    "type": "Polygon",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "height": params.height,
                    "points": points,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            "path" => {
                let fill = params.fill.clone().unwrap_or_else(|| "transparent".to_string());
                let stroke = params.stroke.clone().unwrap_or_else(|| "#ffffff".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Path".to_string());
                let sw = params.stroke_width.unwrap_or(2.0);
                let path_data = params.text.clone().unwrap_or_else(|| "M 0 0 L 100 0 L 50 86.6 Z".to_string());
                serde_json::json!({
                    "type": "Path",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "width": params.width,
                    "height": params.height,
                    "path": path_data,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": sw,
                    "strokeUniform": true,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            "icon" => {
                let icon_name = params.icon_name.clone().unwrap_or_else(|| "circle".to_string());
                let icon_library = params.icon_library.clone().unwrap_or_else(|| "lucide".to_string());
                let icon_color = params.icon_color.clone().or_else(|| params.fill.clone()).unwrap_or_else(|| "#ffffff".to_string());
                let name = params.name.clone().unwrap_or_else(|| "Icon".to_string());
                let size = params.width.min(params.height);
                serde_json::json!({
                    "type": "FabricIcon",
                    "id": id,
                    "name": name,
                    "left": params.x,
                    "top": params.y,
                    "width": size,
                    "height": size,
                    "iconName": icon_name,
                    "iconLibrary": icon_library,
                    "iconSize": size,
                    "iconColor": icon_color,
                    "originX": "left",
                    "originY": "top",
                    "version": "7.0.0"
                })
            }
            other => {
                return Err(McpError::invalid_params(
                    format!("Unknown object type: {}. Use rect, ellipse, text, frame, icon, line, triangle, polygon, or path.", other),
                    None,
                ));
            }
        };

        // Apply common optional properties
        apply_common_props(&mut obj, &params);

        easel.objects_mut().push(obj.clone());
        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let json = serde_json::to_string_pretty(&obj)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Update properties of an existing object by ID.
    #[tool(name = "update_object", description = "Update properties of an existing canvas object by its ID")]
    fn update_object(
        &self,
        Parameters(params): Parameters<UpdateObjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let obj = easel.find_object_mut(&params.id).ok_or_else(|| {
            McpError::internal_error(format!("Object not found: {}", params.id), None)
        })?;

        // Merge properties into the existing object
        if let (Some(target), Some(source)) = (obj.as_object_mut(), params.properties.as_object()) {
            for (key, value) in source {
                if key == "id" || key == "type" {
                    continue;
                }
                target.insert(key.clone(), value.clone());
            }
        }

        let updated = obj.clone();
        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let json = serde_json::to_string_pretty(&updated)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Delete objects by ID array from an .easel file.
    #[tool(name = "delete_objects", description = "Delete one or more canvas objects by their IDs from an .easel file")]
    fn delete_objects(
        &self,
        Parameters(params): Parameters<DeleteObjectsParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let removed = easel.remove_objects(&params.ids);
        let not_found: Vec<&str> = params
            .ids
            .iter()
            .filter(|id| !removed.contains(id))
            .map(|s| s.as_str())
            .collect();

        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "deleted": removed,
            "notFound": not_found,
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Group multiple objects into a Fabric.js Group.
    #[tool(name = "group_objects", description = "Group multiple canvas objects together by their IDs")]
    fn group_objects(
        &self,
        Parameters(params): Parameters<GroupObjectsParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        if params.ids.len() < 2 {
            return Err(McpError::invalid_params(
                "Need at least 2 object IDs to create a group".to_string(),
                None,
            ));
        }

        // Collect objects to group (remove from top-level)
        let objects = easel.objects_mut();
        let mut group_children: Vec<Value> = Vec::new();
        let id_set: std::collections::HashSet<&str> = params.ids.iter().map(|s| s.as_str()).collect();

        // Extract matching objects
        let mut i = 0;
        while i < objects.len() {
            let obj_id = objects[i].get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id_set.contains(obj_id) {
                group_children.push(objects.remove(i));
            } else {
                i += 1;
            }
        }

        if group_children.is_empty() {
            return Err(McpError::internal_error(
                "None of the specified objects were found".to_string(),
                None,
            ));
        }

        let not_found: Vec<String> = params.ids.iter()
            .filter(|id| !group_children.iter().any(|c| c.get("id").and_then(|v| v.as_str()) == Some(id)))
            .cloned()
            .collect();

        // Compute bounding box for the group
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        for child in &group_children {
            let l = child.get("left").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let t = child.get("top").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if l < min_x { min_x = l; }
            if t < min_y { min_y = t; }
        }

        let group_id = Uuid::new_v4().to_string();
        let group_name = params.name.unwrap_or_else(|| "Group".to_string());

        let group = serde_json::json!({
            "type": "Group",
            "id": group_id,
            "name": group_name,
            "left": min_x,
            "top": min_y,
            "originX": "left",
            "originY": "top",
            "objects": group_children,
            "version": "7.0.0"
        });

        easel.objects_mut().push(group.clone());
        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "groupId": group_id,
            "grouped": params.ids.iter().filter(|id| !not_found.contains(id)).collect::<Vec<_>>(),
            "notFound": not_found,
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Ungroup a Group object, moving its children back to the top level.
    #[tool(name = "ungroup_objects", description = "Dissolve a group, moving its children back to the top level")]
    fn ungroup_objects(
        &self,
        Parameters(params): Parameters<UngroupObjectsParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let objects = easel.objects_mut();
        let group_idx = objects.iter().position(|obj| {
            obj.get("id").and_then(|v| v.as_str()) == Some(&params.id)
        }).ok_or_else(|| {
            McpError::internal_error(format!("Group not found: {}", params.id), None)
        })?;

        let group = objects.remove(group_idx);
        let children = group.get("objects")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let child_ids: Vec<String> = children.iter()
            .filter_map(|c| c.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect();

        // Insert children at the position where the group was
        for (i, child) in children.into_iter().enumerate() {
            objects.insert(group_idx + i, child);
        }

        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "ungrouped": child_ids,
            "removedGroupId": params.id,
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Align multiple objects relative to each other.
    #[tool(name = "align_objects", description = "Align or distribute multiple canvas objects: 'left', 'center-h', 'right', 'top', 'center-v', 'bottom', 'distribute-h', or 'distribute-v'")]
    fn align_objects(
        &self,
        Parameters(params): Parameters<AlignObjectsParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        if params.ids.len() < 2 {
            return Err(McpError::invalid_params(
                "Need at least 2 object IDs to align".to_string(),
                None,
            ));
        }

        // Collect positions and sizes of target objects
        struct ObjInfo { left: f64, top: f64, width: f64, height: f64, idx: usize }
        let mut infos: Vec<ObjInfo> = Vec::new();

        let objects = easel.objects_mut();
        for (idx, obj) in objects.iter().enumerate() {
            let obj_id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if params.ids.contains(&obj_id.to_string()) {
                let left = obj.get("left").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let top = obj.get("top").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let w = obj.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0)
                    * obj.get("scaleX").and_then(|v| v.as_f64()).unwrap_or(1.0);
                let h = obj.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0)
                    * obj.get("scaleY").and_then(|v| v.as_f64()).unwrap_or(1.0);
                infos.push(ObjInfo { left, top, width: w, height: h, idx });
            }
        }

        if infos.is_empty() {
            return Err(McpError::internal_error("None of the specified objects were found".to_string(), None));
        }

        match params.alignment.as_str() {
            "left" => {
                let min_left = infos.iter().map(|i| i.left).fold(f64::MAX, f64::min);
                for info in &infos {
                    objects[info.idx].as_object_mut().unwrap().insert("left".to_string(), serde_json::json!(min_left));
                }
            }
            "right" => {
                let max_right = infos.iter().map(|i| i.left + i.width).fold(f64::MIN, f64::max);
                for info in &infos {
                    let new_left = max_right - info.width;
                    objects[info.idx].as_object_mut().unwrap().insert("left".to_string(), serde_json::json!(new_left));
                }
            }
            "center-h" => {
                let min_left = infos.iter().map(|i| i.left).fold(f64::MAX, f64::min);
                let max_right = infos.iter().map(|i| i.left + i.width).fold(f64::MIN, f64::max);
                let center = (min_left + max_right) / 2.0;
                for info in &infos {
                    let new_left = center - info.width / 2.0;
                    objects[info.idx].as_object_mut().unwrap().insert("left".to_string(), serde_json::json!(new_left));
                }
            }
            "top" => {
                let min_top = infos.iter().map(|i| i.top).fold(f64::MAX, f64::min);
                for info in &infos {
                    objects[info.idx].as_object_mut().unwrap().insert("top".to_string(), serde_json::json!(min_top));
                }
            }
            "bottom" => {
                let max_bottom = infos.iter().map(|i| i.top + i.height).fold(f64::MIN, f64::max);
                for info in &infos {
                    let new_top = max_bottom - info.height;
                    objects[info.idx].as_object_mut().unwrap().insert("top".to_string(), serde_json::json!(new_top));
                }
            }
            "center-v" => {
                let min_top = infos.iter().map(|i| i.top).fold(f64::MAX, f64::min);
                let max_bottom = infos.iter().map(|i| i.top + i.height).fold(f64::MIN, f64::max);
                let center = (min_top + max_bottom) / 2.0;
                for info in &infos {
                    let new_top = center - info.height / 2.0;
                    objects[info.idx].as_object_mut().unwrap().insert("top".to_string(), serde_json::json!(new_top));
                }
            }
            "distribute-h" => {
                let mut sorted: Vec<&ObjInfo> = infos.iter().collect();
                sorted.sort_by(|a, b| a.left.partial_cmp(&b.left).unwrap());
                if sorted.len() >= 2 {
                    let first_left = sorted.first().unwrap().left;
                    let last_right = sorted.last().map(|i| i.left + i.width).unwrap();
                    let total_width: f64 = infos.iter().map(|i| i.width).sum();
                    let gap = (last_right - first_left - total_width) / (sorted.len() as f64 - 1.0);
                    let mut cursor = first_left;
                    for s in &sorted {
                        objects[s.idx].as_object_mut().unwrap().insert("left".to_string(), serde_json::json!(cursor));
                        cursor += s.width + gap;
                    }
                }
            }
            "distribute-v" => {
                let mut sorted: Vec<&ObjInfo> = infos.iter().collect();
                sorted.sort_by(|a, b| a.top.partial_cmp(&b.top).unwrap());
                if sorted.len() >= 2 {
                    let first_top = sorted.first().unwrap().top;
                    let last_bottom = sorted.last().map(|i| i.top + i.height).unwrap();
                    let total_height: f64 = infos.iter().map(|i| i.height).sum();
                    let gap = (last_bottom - first_top - total_height) / (sorted.len() as f64 - 1.0);
                    let mut cursor = first_top;
                    for s in &sorted {
                        objects[s.idx].as_object_mut().unwrap().insert("top".to_string(), serde_json::json!(cursor));
                        cursor += s.height + gap;
                    }
                }
            }
            other => {
                return Err(McpError::invalid_params(
                    format!("Unknown alignment: {}. Use left, center-h, right, top, center-v, bottom, distribute-h, or distribute-v.", other),
                    None,
                ));
            }
        }

        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "aligned": params.ids,
            "alignment": params.alignment,
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Reorder an object in the z-order stack.
    #[tool(name = "reorder_object", description = "Change z-order of a canvas object: 'front', 'back', 'forward' (one step up), or 'backward' (one step down)")]
    fn reorder_object(
        &self,
        Parameters(params): Parameters<ReorderObjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let objects = easel.objects_mut();
        let idx = objects.iter().position(|obj| {
            obj.get("id").and_then(|v| v.as_str()) == Some(&params.id)
        }).ok_or_else(|| {
            McpError::internal_error(format!("Object not found: {}", params.id), None)
        })?;

        let last = objects.len() - 1;

        match params.direction.as_str() {
            "front" => {
                if idx < last {
                    let obj = objects.remove(idx);
                    objects.push(obj);
                }
            }
            "back" => {
                if idx > 0 {
                    let obj = objects.remove(idx);
                    objects.insert(0, obj);
                }
            }
            "forward" => {
                if idx < last {
                    objects.swap(idx, idx + 1);
                }
            }
            "backward" => {
                if idx > 0 {
                    objects.swap(idx, idx - 1);
                }
            }
            other => {
                return Err(McpError::invalid_params(
                    format!("Unknown direction: {}. Use front, back, forward, or backward.", other),
                    None,
                ));
            }
        }

        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let result = serde_json::json!({
            "id": params.id,
            "direction": params.direction,
            "message": format!("Object moved to {}", params.direction),
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
    /// Get the current canvas viewport dimensions and zoom level.
    #[tool(name = "get_viewport_info", description = "Get the current canvas viewport dimensions, zoom level, and recommended design area. Call this FIRST before creating any design to know the available space.")]
    fn get_viewport_info(
        &self,
        Parameters(params): Parameters<GetViewportInfoParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let zoom = easel.viewport.zoom;
        // Standard Easel canvas is ~1200x800; account for sidebars/toolbars
        let canvas_width = 1200.0_f64;
        let canvas_height = 800.0_f64;
        let visible_width = canvas_width / zoom;
        let visible_height = canvas_height / zoom;

        let result = serde_json::json!({
            "zoom": zoom,
            "canvasWidth": canvas_width,
            "canvasHeight": canvas_height,
            "visibleWidth": visible_width,
            "visibleHeight": visible_height,
            "recommendedDesignWidth": (visible_width * 0.6).round(),
            "recommendedDesignHeight": (visible_height * 0.8).round(),
            "tip": "Place your root frame within the recommended design area. For cards, use 400-500px width. For full pages, use 800-1000px width."
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get the design tokens (variables and modes) from an .easel file.
    #[tool(name = "get_design_tokens", description = "Get design tokens (variables with per-mode values) and theme modes from an .easel file. Returns modes (e.g. Light/Dark) and tokens (e.g. primary-color with different values per mode).")]
    fn get_design_tokens(
        &self,
        Parameters(params): Parameters<GetDesignTokensParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let easel = EaselFile::load(&path)
            .map_err(|e| McpError::internal_error(e, None))?;

        let theme = easel.theme.unwrap_or_else(|| ThemeData {
            modes: vec![],
            tokens: vec![],
        });

        let json = serde_json::to_string_pretty(&theme)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Set the design tokens (variables and modes) in an .easel file.
    #[tool(name = "set_design_tokens", description = "Set design tokens and theme modes in an .easel file. Modes define value sets (e.g. Light, Dark). Tokens are variables with per-mode values (e.g. primary-color = #4f8ef7 in Light, #8ab4f8 in Dark).")]
    fn set_design_tokens(
        &self,
        Parameters(params): Parameters<SetDesignTokensParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = PathBuf::from(&params.file_path);
        let mut easel = if path.exists() {
            EaselFile::load(&path).map_err(|e| McpError::internal_error(e, None))?
        } else {
            EaselFile::new("Untitled")
        };

        let modes: Vec<ThemeMode> = params.modes.iter().map(|m| ThemeMode {
            id: m.id.clone(),
            name: m.name.clone(),
        }).collect();

        let tokens: Vec<DesignToken> = params.tokens.iter().map(|t| DesignToken {
            name: t.name.clone(),
            token_type: t.token_type.clone(),
            values: t.values.clone(),
        }).collect();

        let theme = ThemeData { modes, tokens };
        easel.theme = Some(theme.clone());
        easel.updated_at = Utc::now();
        easel.save(&path).map_err(|e| McpError::internal_error(e, None))?;

        let json = serde_json::to_string_pretty(&theme)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get a screenshot (PNG thumbnail) of the canvas. Returns a base64-encoded image. The canvas auto-saves a thumbnail during editing. Use this to visually inspect the canvas and verify your design changes.")]
    fn get_screenshot(
        &self,
        Parameters(params): Parameters<GetScreenshotParams>,
    ) -> Result<CallToolResult, McpError> {
        use base64::Engine as _;

        let easel_path = std::path::PathBuf::from(&params.file_path);

        // Replace .easel extension with .png
        let png_path = easel_path.with_extension("png");

        if !png_path.exists() {
            return Err(McpError::internal_error(
                "No screenshot available. The canvas may not have been saved recently. \
                 Try making a small change to trigger an auto-save, then try again.",
                None,
            ));
        }

        let bytes = std::fs::read(&png_path)
            .map_err(|e| McpError::internal_error(format!("Failed to read screenshot: {}", e), None))?;

        let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);

        Ok(CallToolResult::success(vec![Content::image(base64_data, "image/png")]))
    }
}

#[tool_handler]
impl ServerHandler for EaselMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Easel MCP server: read and write Fabric.js canvas objects in .easel files. \
                 Use list_easel_files to discover files, get_canvas_state to read the full object tree, \
                 get_object for individual object details, and create_object/update_object/delete_objects to modify. \
                 Additional tools: group_objects to group, ungroup_objects to dissolve groups, reorder_object for z-ordering, align_objects for alignment/distribution. \
                 Supported object types: rect, ellipse, text, frame, icon, line, triangle, polygon, path. \
                 Frames support auto-layout: layout_direction (horizontal/vertical), layout_gap, layout_padding, layout_align_items, layout_justify_content, clip_content, resize_mode_w/h (fixed/hug/fill). \
                 Icons: icon_name, icon_library (lucide/material-symbols/feather/phosphor), icon_color. \
                 Text: font_weight, font_family, font_style (normal/italic), text_align, line_height, split_by_grapheme, letter_spacing, underline, linethrough, vertical_align. \
                 Design system: is_component marks objects as reusable components, slots defines accepted child components. \
                 Theme system: get_design_tokens/set_design_tokens to manage design tokens (variables) with per-mode values (e.g. Light/Dark). \
                 Objects can reference a theme_mode to control which mode's values apply. \
                 Viewport: get_viewport_info returns canvas dimensions, zoom, and recommended design area. \
                 Screenshots: get_screenshot returns a PNG thumbnail of the canvas for visual inspection."
                    .to_string(),
            ),
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .build(),
            server_info: Implementation::from_build_env(),
            ..Default::default()
        }
    }
}
