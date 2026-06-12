# Pigment AI Integration — Implementation Plan

> This plan covers the complete AI integration: chat providers, canvas-aware AI via an **MCP server**, and real-time canvas manipulation by AI agents.

---

## Table of Contents

1. [Problem & Vision](#1-problem--vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Part A: Pigment MCP Server — AI Controls the Canvas](#3-part-a-pigment-mcp-server)
4. [Part B: Cloud API Providers (Anthropic + OpenAI)](#4-part-b-cloud-api-providers)
5. [Part C: Claude Code CLI with MCP](#5-part-c-claude-code-cli-with-mcp)
6. [Part D: Local Models via Ollama](#6-part-d-local-models-via-ollama)
7. [Part E: Frontend Chat Integration](#7-part-e-frontend-chat-integration)
8. [Part F: Real-Time Canvas Feedback](#8-part-f-real-time-canvas-feedback)
9. [File Summary](#9-file-summary)
10. [Verification](#10-verification)

---

## 1. Problem & Vision

### Current State

The chat panel UI is fully built (model selection, agent status, message history, file attachments) but `sendMessage()` is a **placeholder** returning fake responses. No AI provider is connected.

### The Missing Piece

Even after connecting providers, the AI can only **chat in text**. It can't actually touch the canvas. If a user says "create a card component with a title and description," the AI can only describe how — it can't create objects.

### The Vision

The AI should be able to:

1. **Read** the canvas — know what objects exist, their properties, hierarchy
2. **Create** objects — add frames, rectangles, text, images
3. **Modify** objects — change fill, position, size, layout properties
4. **Delete** objects — remove selected or specified objects
5. **Screenshot** — visually verify what it built
6. Do all of this **live** — the user watches objects appear on the canvas in real-time

### How Other Tools Solve This

| Tool             | Approach                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **Pencil.dev**   | MCP server with `batch_design` (insert/update/delete), `batch_get` (read), `get_screenshot` |
| **Paper.design** | MCP server with `write_html`, `update_styles`, `get_node_info`, `get_screenshot`            |
| **Figma**        | MCP server with `get_design_context`, `generate_figma_design`, `get_metadata`               |
| **Miro**         | MCP server with shape/diagram creation tools                                                |

**The common pattern: expose canvas operations as MCP server tools.** Claude Code (or any MCP-compatible client) discovers and calls these tools to manipulate the canvas.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Pigment Desktop App                          │
│                                                                     │
│  ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐  │
│  │  Chat Panel   │     │  Fabric.js     │     │  Pigment MCP     │  │
│  │  (React UI)   │◄───►│  Canvas        │◄───►│  Server          │  │
│  │               │     │                │     │  (localhost:PORT) │  │
│  └──────┬───────┘     └────────────────┘     └────────┬─────────┘  │
│         │                                              │            │
│  ┌──────▼───────┐                              ┌──────▼─────────┐  │
│  │  Rust Backend │                              │  Tool calls    │  │
│  │  (Tauri)      │                              │  via JSON-RPC  │  │
│  └──────┬───────┘                              └────────┬───────┘  │
└─────────┼──────────────────────────────────────────────┼───────────┘
          │                                              │
          ▼                                              ▼
   ┌──────────────┐                            ┌──────────────────┐
   │ Cloud APIs   │                            │ Claude Code CLI  │
   │ (Anthropic,  │                            │ (with --mcp-     │
   │  OpenAI)     │                            │  config pointing │
   │              │                            │  to Pigment MCP) │
   └──────────────┘                            └──────────────────┘
```

### Two Integration Modes

| Mode                             | How AI Accesses Canvas                                                                                          | Best For                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Chat Mode** (Cloud/Ollama)     | Canvas state passed as system prompt context; AI returns text + structured tool-call JSON that Pigment executes | Quick tasks, text-heavy interactions                 |
| **Agent Mode** (Claude Code CLI) | Claude Code connects to Pigment MCP server, discovers tools, calls them directly                                | Complex multi-step design tasks, autonomous building |

---

## 3. Part A: Pigment MCP Server

### Overview

The Pigment MCP server is a **local HTTP server** that runs inside the Tauri app. It exposes canvas operations as MCP tools that any MCP client (Claude Code, etc.) can call.

### Server Architecture

The MCP server runs as a lightweight HTTP endpoint on a random available port. It communicates with the Fabric.js canvas via Tauri's event system (Rust → Frontend bridge).

```
Claude Code CLI                    Pigment App
     │                                │
     │── POST /mcp (tools/list) ─────►│  Returns tool definitions
     │◄── 200 OK (tool list) ─────────│
     │                                │
     │── POST /mcp (tools/call) ─────►│  "create_rectangle"
     │         │                      │
     │         │    Rust ──emit──►    │  Frontend receives event
     │         │    Frontend creates  │  Fabric.js object on canvas
     │         │    Frontend ──emit──►│  Returns result to Rust
     │         │                      │
     │◄── 200 OK (result) ───────────│  { "id": "obj-42", "created": true }
     │                                │
```

### Rust Implementation (`src-tauri/src/mcp/server.rs`) — NEW

```rust
use axum::{Router, Json, routing::post};
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::oneshot;
use std::sync::Arc;

pub struct McpState {
    pub app: AppHandle,
}

pub async fn start_mcp_server(app: AppHandle) -> u16 {
    let state = Arc::new(McpState { app });
    let port = find_available_port().await;

    let router = Router::new()
        .route("/mcp", post(handle_mcp_request))
        .with_state(state);

    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(
            format!("127.0.0.1:{}", port)
        ).await.unwrap();
        axum::serve(listener, router).await.unwrap();
    });

    port
}

async fn handle_mcp_request(
    state: axum::extract::State<Arc<McpState>>,
    Json(request): Json<Value>,
) -> Json<Value> {
    let method = request["method"].as_str().unwrap_or("");

    match method {
        "initialize" => handle_initialize(),
        "tools/list" => handle_tools_list(),
        "tools/call" => handle_tools_call(&state, &request).await,
        _ => Json(json!({"error": "unknown method"})),
    }
}
```

### MCP Tool Definitions

The server exposes **13 tools** organized into Read and Write categories:

#### Read Tools

**1. `get_canvas_state`** — Get full canvas tree

```json
{
  "name": "get_canvas_state",
  "description": "Get the current canvas state including all objects, their properties, hierarchy, and layout. Returns a JSON tree of all canvas objects.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "depth": {
        "type": "number",
        "description": "Max depth of tree traversal. Default 2. Use higher for deep hierarchies."
      },
      "includeStyles": {
        "type": "boolean",
        "description": "Include full style properties (fill, stroke, shadow, etc.). Default true."
      }
    }
  }
}
```

**Returns:**

```json
{
  "canvas": { "width": 1200, "height": 800, "zoom": 1.0, "background": "#222222" },
  "objectCount": 5,
  "objects": [
    {
      "id": "obj-1-1709000000",
      "type": "pigmentFrame",
      "name": "Card Frame",
      "position": { "x": 100, "y": 100 },
      "size": { "width": 320, "height": 200 },
      "fill": "#ffffff",
      "stroke": "#e0e0e0",
      "layoutMode": "flex",
      "flexDirection": "column",
      "flexGap": 12,
      "padding": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
      "clipContent": true,
      "children": [
        {
          "id": "obj-2-1709000001",
          "type": "i-text",
          "name": "Title",
          "content": "Card Title",
          "fontSize": 18,
          "fontWeight": "bold",
          "fill": "#000000"
        },
        {
          "id": "obj-3-1709000002",
          "type": "i-text",
          "name": "Description",
          "content": "Card description text...",
          "fontSize": 14,
          "fill": "#666666"
        }
      ]
    }
  ]
}
```

**2. `get_selection`** — Get currently selected objects

```json
{
  "name": "get_selection",
  "description": "Get the currently selected objects on the canvas with their full properties.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

**3. `get_object`** — Get a specific object by ID

```json
{
  "name": "get_object",
  "description": "Get detailed properties of a specific canvas object by its ID.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "The object ID" }
    },
    "required": ["id"]
  }
}
```

**4. `get_screenshot`** — Take a screenshot of the canvas or a specific object

```json
{
  "name": "get_screenshot",
  "description": "Take a PNG screenshot of the entire canvas or a specific object. Returns base64-encoded image.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "objectId": {
        "type": "string",
        "description": "Optional: screenshot a specific object instead of the full canvas"
      },
      "width": { "type": "number", "description": "Screenshot width in pixels. Default 800." },
      "height": { "type": "number", "description": "Screenshot height in pixels. Default 600." }
    }
  }
}
```

**Returns:** `{ "content": [{ "type": "image", "data": "base64...", "mimeType": "image/png" }] }`

**5. `search_objects`** — Find objects by name, type, or properties

```json
{
  "name": "search_objects",
  "description": "Search for objects on the canvas by name pattern, type, or property values.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Regex pattern to match object names" },
      "type": {
        "type": "string",
        "description": "Object type: rect, ellipse, i-text, pigmentFrame, etc."
      },
      "parentId": { "type": "string", "description": "Only search within this parent frame" }
    }
  }
}
```

#### Write Tools

**6. `create_object`** — Create a new object on the canvas

```json
{
  "name": "create_object",
  "description": "Create a new object on the canvas. Supported types: rectangle, ellipse, triangle, text, frame, image, line, star, polygon.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["rectangle", "ellipse", "triangle", "text", "frame", "line", "star", "polygon"],
        "description": "The type of object to create"
      },
      "name": { "type": "string", "description": "Display name for the object" },
      "x": { "type": "number", "description": "X position" },
      "y": { "type": "number", "description": "Y position" },
      "width": { "type": "number", "description": "Width (not for text/line)" },
      "height": { "type": "number", "description": "Height (not for text/line)" },
      "fill": { "type": "string", "description": "Fill color (hex)" },
      "stroke": { "type": "string", "description": "Stroke color (hex)" },
      "strokeWidth": { "type": "number" },
      "opacity": { "type": "number", "description": "0-1" },
      "cornerRadius": { "type": "number" },
      "parentId": { "type": "string", "description": "Add inside this frame (auto-layout aware)" },
      "text": { "type": "string", "description": "Text content (for text type)" },
      "fontSize": { "type": "number" },
      "fontFamily": { "type": "string" },
      "fontWeight": { "type": "string" },
      "textAlign": { "type": "string", "enum": ["left", "center", "right"] }
    },
    "required": ["type"]
  }
}
```

**Returns:** `{ "id": "obj-42-1709000003", "created": true }`

**7. `update_object`** — Modify properties of an existing object

```json
{
  "name": "update_object",
  "description": "Update properties of an existing canvas object. Only pass the properties you want to change.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Object ID to update" },
      "name": { "type": "string" },
      "x": { "type": "number" },
      "y": { "type": "number" },
      "width": { "type": "number" },
      "height": { "type": "number" },
      "fill": { "type": "string" },
      "stroke": { "type": "string" },
      "strokeWidth": { "type": "number" },
      "opacity": { "type": "number" },
      "cornerRadius": { "type": "number" },
      "rotation": { "type": "number" },
      "text": { "type": "string" },
      "fontSize": { "type": "number" },
      "fontFamily": { "type": "string" },
      "fontWeight": { "type": "string" },
      "visible": { "type": "boolean" },
      "locked": { "type": "boolean" }
    },
    "required": ["id"]
  }
}
```

**8. `delete_objects`** — Remove objects from the canvas

```json
{
  "name": "delete_objects",
  "description": "Delete one or more objects from the canvas by their IDs.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ids": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of object IDs to delete"
      }
    },
    "required": ["ids"]
  }
}
```

**9. `move_object`** — Move an object to a new position or parent

```json
{
  "name": "move_object",
  "description": "Move an object to a new position or reparent it into/out of a frame.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "x": { "type": "number", "description": "New X position" },
      "y": { "type": "number", "description": "New Y position" },
      "parentId": {
        "type": "string",
        "description": "Move into this frame (null to move to canvas root)"
      },
      "index": {
        "type": "number",
        "description": "Position among siblings (for auto-layout ordering)"
      }
    },
    "required": ["id"]
  }
}
```

**10. `set_frame_layout`** — Configure auto-layout on a frame

```json
{
  "name": "set_frame_layout",
  "description": "Set auto-layout (flex) properties on a frame. Enables Figma-like auto-layout behavior.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "frameId": { "type": "string", "description": "The frame object ID" },
      "layoutMode": { "type": "string", "enum": ["free", "flex"], "description": "Layout mode" },
      "direction": { "type": "string", "enum": ["row", "column"] },
      "gap": { "type": "number", "description": "Gap between children (px)" },
      "padding": {
        "type": "object",
        "properties": {
          "top": { "type": "number" },
          "right": { "type": "number" },
          "bottom": { "type": "number" },
          "left": { "type": "number" }
        }
      },
      "alignItems": { "type": "string", "enum": ["start", "center", "end", "stretch"] },
      "justifyContent": {
        "type": "string",
        "enum": ["start", "center", "end", "space-between", "space-around"]
      },
      "clipContent": { "type": "boolean" }
    },
    "required": ["frameId"]
  }
}
```

**11. `duplicate_objects`** — Clone objects with offset

```json
{
  "name": "duplicate_objects",
  "description": "Duplicate one or more objects with a position offset.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ids": { "type": "array", "items": { "type": "string" } },
      "offsetX": { "type": "number", "description": "X offset from original. Default 20." },
      "offsetY": { "type": "number", "description": "Y offset from original. Default 20." }
    },
    "required": ["ids"]
  }
}
```

**12. `batch_operations`** — Execute multiple operations atomically

```json
{
  "name": "batch_operations",
  "description": "Execute multiple canvas operations in a single atomic batch. All operations succeed or all are rolled back. This is the most efficient way to build complex layouts.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "operations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "op": { "type": "string", "enum": ["create", "update", "delete", "move"] },
            "params": { "type": "object", "description": "Same params as the individual tool" },
            "bindingName": {
              "type": "string",
              "description": "Name to reference this object's ID in later operations"
            }
          }
        },
        "description": "Array of operations to execute in order. Use bindingName to reference created objects."
      }
    },
    "required": ["operations"]
  }
}
```

**Example batch call from AI:**

```json
{
  "operations": [
    {
      "op": "create",
      "bindingName": "card",
      "params": {
        "type": "frame",
        "name": "Card",
        "x": 100,
        "y": 100,
        "width": 320,
        "height": 200,
        "fill": "#ffffff"
      }
    },
    {
      "op": "create",
      "params": {
        "type": "text",
        "text": "Card Title",
        "fontSize": 18,
        "fontWeight": "bold",
        "fill": "#000000",
        "parentId": "$card"
      }
    },
    {
      "op": "create",
      "params": {
        "type": "text",
        "text": "Description goes here",
        "fontSize": 14,
        "fill": "#666666",
        "parentId": "$card"
      }
    },
    { "op": "update", "params": { "id": "$card" } },
    {
      "op": "create",
      "params": {
        "type": "rectangle",
        "width": 288,
        "height": 1,
        "fill": "#eeeeee",
        "parentId": "$card"
      }
    },
    {
      "op": "create",
      "params": {
        "type": "text",
        "text": "Read More →",
        "fontSize": 14,
        "fill": "#4f8ef7",
        "parentId": "$card"
      }
    }
  ]
}
```

The `$card` syntax references the ID of the object created by the operation with `bindingName: "card"`.

**13. `set_object_context`** — Set AI context on an object

```json
{
  "name": "set_object_context",
  "description": "Set descriptive AI context on an object. This text helps AI understand the purpose of this element in future interactions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "context": {
        "type": "string",
        "description": "Description of this element's purpose, e.g., 'Primary navigation sidebar with links to Dashboard, Settings, Profile'"
      }
    },
    "required": ["id", "context"]
  }
}
```

### Tool Execution Bridge (Rust ↔ Frontend)

Since the Fabric.js canvas lives in the frontend (WebView), the Rust MCP server needs to bridge tool calls to the frontend and wait for results:

```rust
// src-tauri/src/mcp/bridge.rs — NEW

use tauri::AppHandle;
use tokio::sync::oneshot;
use std::collections::HashMap;
use std::sync::Mutex;

// Pending requests waiting for frontend responses
lazy_static::lazy_static! {
    static ref PENDING: Mutex<HashMap<String, oneshot::Sender<Value>>> = Mutex::new(HashMap::new());
}

/// Send a canvas operation to the frontend and wait for the result
pub async fn execute_canvas_operation(
    app: &AppHandle,
    operation: &str,
    params: Value,
) -> Result<Value, String> {
    let request_id = uuid::Uuid::new_v4().to_string();

    let (tx, rx) = oneshot::channel();

    // Store the sender so the frontend response handler can find it
    PENDING.lock().unwrap().insert(request_id.clone(), tx);

    // Emit event to frontend
    app.emit("mcp:execute", json!({
        "requestId": request_id,
        "operation": operation,
        "params": params,
    })).map_err(|e| e.to_string())?;

    // Wait for frontend to respond (with timeout)
    match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        rx,
    ).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err("Frontend did not respond".to_string()),
        Err(_) => Err("Operation timed out".to_string()),
    }
}

/// Called by the frontend via Tauri command to return operation results
#[tauri::command]
pub fn mcp_operation_result(request_id: String, result: Value) {
    if let Some(tx) = PENDING.lock().unwrap().remove(&request_id) {
        let _ = tx.send(result);
    }
}
```

### Frontend MCP Handler (`src/lib/mcp-handler.ts`) — NEW

```typescript
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface McpRequest {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

/** Set up listener for MCP operation requests from Rust */
export function initMcpHandler(getCanvas: () => fabric.Canvas | null) {
  listen<McpRequest>("mcp:execute", async (event) => {
    const { requestId, operation, params } = event.payload;
    let result: unknown;

    try {
      const canvas = getCanvas();
      if (!canvas) throw new Error("No canvas available");

      switch (operation) {
        case "get_canvas_state":
          result = getCanvasState(canvas, params);
          break;
        case "get_selection":
          result = getSelection(canvas);
          break;
        case "get_object":
          result = getObjectById(canvas, params.id as string);
          break;
        case "get_screenshot":
          result = await getScreenshot(canvas, params);
          break;
        case "search_objects":
          result = searchObjects(canvas, params);
          break;
        case "create_object":
          result = createObject(canvas, params);
          break;
        case "update_object":
          result = updateObject(canvas, params);
          break;
        case "delete_objects":
          result = deleteObjects(canvas, params.ids as string[]);
          break;
        case "move_object":
          result = moveObject(canvas, params);
          break;
        case "set_frame_layout":
          result = setFrameLayout(canvas, params);
          break;
        case "duplicate_objects":
          result = duplicateObjects(canvas, params);
          break;
        case "batch_operations":
          result = executeBatch(canvas, params.operations as any[]);
          break;
        case "set_object_context":
          result = setObjectContext(canvas, params);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (err) {
      result = { error: String(err) };
    }

    // Send result back to Rust
    await invoke("mcp_operation_result", { requestId, result });
  });
}
```

### Canvas Operation Implementations

```typescript
// src/lib/mcp-operations.ts — NEW

/** Serialize the full canvas state as a JSON tree */
function getCanvasState(canvas: Canvas, params: { depth?: number }) {
  const maxDepth = params.depth ?? 2;

  function serializeObject(obj: FabricObject, depth: number): any {
    const base: any = {
      id: (obj as any).id,
      type: obj.type,
      name: (obj as any).name ?? obj.type,
      position: { x: Math.round(obj.left ?? 0), y: Math.round(obj.top ?? 0) },
      size: {
        width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
        height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
      },
      rotation: Math.round(obj.angle ?? 0),
      opacity: obj.opacity ?? 1,
      visible: obj.visible ?? true,
      locked: !(obj.selectable ?? true),
    };

    // Style properties
    if (typeof obj.fill === "string") base.fill = obj.fill;
    if (obj.stroke) base.stroke = obj.stroke;
    if (obj.strokeWidth) base.strokeWidth = obj.strokeWidth;

    // Text properties
    if (obj.type === "i-text" || obj.type === "textbox") {
      const textObj = obj as IText;
      base.text = textObj.text;
      base.fontSize = textObj.fontSize;
      base.fontFamily = textObj.fontFamily;
      base.fontWeight = textObj.fontWeight;
      base.textAlign = textObj.textAlign;
    }

    // Frame/layout properties
    if (obj instanceof PigmentFrame) {
      base.layoutMode = (obj as any).layoutMode ?? "free";
      base.flexDirection = (obj as any).flexDirection;
      base.flexGap = (obj as any).flexGap;
      base.padding = (obj as any).framePadding;
      base.clipContent = obj.clipContent;

      // Recurse into children
      if (depth < maxDepth) {
        const children = obj.getObjects().filter((c: any) => c !== obj.backgroundRect);
        base.children = children.map((c) => serializeObject(c, depth + 1));
      } else {
        base.childCount = obj.getObjects().length - 1; // minus backgroundRect
      }
    }

    // AI context
    if ((obj as any).aiContext) {
      base.aiContext = (obj as any).aiContext;
    }

    return base;
  }

  return {
    canvas: {
      width: canvas.width,
      height: canvas.height,
      zoom: canvas.getZoom(),
      background: canvas.backgroundColor,
    },
    objectCount: canvas.getObjects().length,
    objects: canvas.getObjects().map((obj) => serializeObject(obj, 0)),
  };
}

/** Create a new object on the canvas */
function createObject(canvas: Canvas, params: any): { id: string; created: boolean } {
  let obj: FabricObject;
  const id = generateObjectId();

  switch (params.type) {
    case "rectangle":
      obj = new Rect({
        left: params.x ?? 0,
        top: params.y ?? 0,
        width: params.width ?? 100,
        height: params.height ?? 100,
        fill: params.fill ?? "#d9d9d9",
        stroke: params.stroke ?? "#b3b3b3",
        strokeWidth: params.strokeWidth ?? 1,
        rx: params.cornerRadius ?? 0,
        ry: params.cornerRadius ?? 0,
      });
      break;

    case "text":
      obj = new IText(params.text ?? "Text", {
        left: params.x ?? 0,
        top: params.y ?? 0,
        fontSize: params.fontSize ?? 16,
        fontFamily: params.fontFamily ?? "Inter",
        fontWeight: params.fontWeight ?? "normal",
        fill: params.fill ?? "#ffffff",
        textAlign: params.textAlign ?? "left",
      });
      break;

    case "frame":
      obj = new PigmentFrame([], {
        left: params.x ?? 0,
        top: params.y ?? 0,
        frameWidth: params.width ?? 375,
        frameHeight: params.height ?? 667,
        frameFill: params.fill ?? "#ffffff",
      });
      break;

    case "ellipse":
      obj = new Ellipse({
        left: params.x ?? 0,
        top: params.y ?? 0,
        rx: (params.width ?? 100) / 2,
        ry: (params.height ?? 100) / 2,
        fill: params.fill ?? "#d9d9d9",
      });
      break;

    // ... triangle, line, star, polygon
    default:
      throw new Error(`Unknown object type: ${params.type}`);
  }

  (obj as any).id = id;
  (obj as any).name = params.name ?? `${params.type} (AI)`;

  // If parentId specified, add to frame
  if (params.parentId) {
    const parent = findObjectById(canvas, params.parentId);
    if (parent instanceof PigmentFrame) {
      parent.add(obj);
      parent.triggerLayout();
    } else {
      canvas.add(obj);
    }
  } else {
    canvas.add(obj);
  }

  canvas.requestRenderAll();
  return { id, created: true };
}

/** Execute a batch of operations with binding support */
function executeBatch(canvas: Canvas, operations: any[]): any {
  const bindings: Record<string, string> = {};
  const results: any[] = [];

  for (const op of operations) {
    // Resolve $binding references in params
    const resolvedParams = resolveBindings(op.params, bindings);

    let result: any;
    switch (op.op) {
      case "create":
        result = createObject(canvas, resolvedParams);
        if (op.bindingName && result.id) {
          bindings[op.bindingName] = result.id;
        }
        break;
      case "update":
        result = updateObject(canvas, resolvedParams);
        break;
      case "delete":
        result = deleteObjects(canvas, resolvedParams.ids);
        break;
      case "move":
        result = moveObject(canvas, resolvedParams);
        break;
    }
    results.push(result);
  }

  canvas.requestRenderAll();
  return { results, bindings };
}

/** Replace $bindingName references with actual IDs */
function resolveBindings(params: any, bindings: Record<string, string>): any {
  const resolved = { ...params };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const bindingName = value.slice(1);
      if (bindings[bindingName]) {
        resolved[key] = bindings[bindingName];
      }
    }
  }
  return resolved;
}
```

### MCP Config File Generation

When the Pigment app starts, generate a `.mcp.json` file that Claude Code can discover:

```rust
// In the MCP server startup:
fn write_mcp_config(port: u16, project_dir: &Path) {
    let config = json!({
        "mcpServers": {
            "pigment": {
                "type": "http",
                "url": format!("http://127.0.0.1:{}/mcp", port),
                "description": "Pigment design canvas — create, modify, and inspect design objects"
            }
        }
    });

    // Write to project directory so Claude Code auto-discovers it
    let config_path = project_dir.join(".mcp.json");
    std::fs::write(config_path, serde_json::to_string_pretty(&config).unwrap()).ok();
}
```

Users can also manually add the server:

```bash
claude mcp add --transport http pigment http://127.0.0.1:PORT/mcp
```

---

## 4. Part B: Cloud API Providers

### How Cloud APIs Use Canvas Tools

Cloud providers (Anthropic, OpenAI) don't connect to MCP servers directly. Instead, we implement a **tool-use loop** in Rust:

1. Send the user's message with canvas context as system prompt
2. Include tool definitions in the API request (Anthropic's `tools` parameter / OpenAI's `functions`)
3. When the model returns a `tool_use` block, execute it against the canvas via the bridge
4. Send the tool result back to the model
5. Continue until the model returns a final text response

```
User: "Create a card with title and description"
    │
    ▼
Rust → Anthropic API (with tools defined)
    │
    ◄── tool_use: create_object({type:"frame", name:"Card", ...})
    │
    ▼ Execute on canvas via bridge
    │
    ──► Anthropic API (tool_result: {id: "obj-42", created: true})
    │
    ◄── tool_use: create_object({type:"text", text:"Title", parentId:"obj-42"})
    │
    ▼ Execute on canvas
    │
    ──► Anthropic API (tool_result: ...)
    │
    ◄── text: "I've created a card with a title and description."
    │
    ▼ Display in chat
```

### Anthropic Tool-Use Implementation

```rust
// src-tauri/src/ai/anthropic.rs

pub async fn stream_with_tools(
    app: AppHandle,
    session_id: String,
    api_key: String,
    model: String,
    messages: Vec<Message>,
    system_prompt: String,
    tools: Vec<ToolDefinition>,  // Canvas tool definitions
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let mut conversation = messages.clone();

    loop {
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": model,
                "max_tokens": 4096,
                "stream": true,
                "system": system_prompt,
                "messages": conversation,
                "tools": tools,
            }))
            .send().await.map_err(|e| e.to_string())?;

        let mut has_tool_use = false;
        let mut tool_uses: Vec<ToolUse> = vec![];
        let mut text_content = String::new();

        // Parse SSE stream
        // ... accumulate text chunks (emit to frontend) and tool_use blocks

        if !has_tool_use {
            // Final response — done
            app.emit("ai:done", &session_id)?;
            break;
        }

        // Execute tool calls against canvas
        let mut tool_results = vec![];
        for tool_use in &tool_uses {
            // Emit progress to frontend
            app.emit("ai:tool_call", json!({
                "sessionId": session_id,
                "tool": tool_use.name,
                "input": tool_use.input,
            }))?;

            // Execute via bridge
            let result = execute_canvas_operation(
                &app,
                &tool_use.name,
                tool_use.input.clone(),
            ).await?;

            tool_results.push(json!({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result.to_string(),
            }));
        }

        // Add assistant message + tool results to conversation
        conversation.push(Message {
            role: "assistant".to_string(),
            content: /* accumulated content blocks */,
        });
        conversation.push(Message {
            role: "user".to_string(),
            content: /* tool results */,
        });

        // Loop continues — model sees tool results and may call more tools or respond
    }

    Ok(())
}
```

### Tool Definitions for Cloud APIs

```typescript
// src/features/chat/utils/tool-definitions.ts — NEW

export const CANVAS_TOOLS: ToolDefinition[] = [
  {
    name: "create_object",
    description: "Create a new object on the Pigment canvas...",
    input_schema: {
      /* same as MCP tool inputSchema */
    },
  },
  {
    name: "update_object",
    description: "Update properties of an existing canvas object...",
    input_schema: {
      /* ... */
    },
  },
  // ... all 13 tools
];
```

### Rust Dependencies

```toml
# src-tauri/Cargo.toml additions
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"
futures-util = "0.3"
axum = "0.8"
uuid = { version = "1", features = ["v4"] }
lazy_static = "1.5"
```

### API Key Security

- Keys stored in LazyStore (`preferences.json`) in Tauri's app data directory
- Keys read by Rust, sent directly to APIs — never exposed to JavaScript
- Frontend sends only `provider` identifier
- Validate via lightweight API call (`GET /v1/models`)

### Supported Models

| Provider  | Model ID                     | Display Name      |
| --------- | ---------------------------- | ----------------- |
| Anthropic | `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 |
| Anthropic | `claude-opus-4-6`            | Claude Opus 4.6   |
| Anthropic | `claude-haiku-4-5-20251001`  | Claude Haiku 4.5  |
| OpenAI    | `gpt-4o`                     | GPT-4o            |
| OpenAI    | `gpt-4o-mini`                | GPT-4o Mini       |
| OpenAI    | `o1`                         | o1                |

---

## 5. Part C: Claude Code CLI with MCP

### The Key Insight

Claude Code is the most powerful integration path because it **natively supports MCP**. We don't need to implement tool-use loops or parse tool calls — Claude Code handles all of that. We just need to:

1. Start the Pigment MCP server (Part A)
2. Tell Claude Code about it via `--mcp-config`
3. Claude Code discovers our tools and calls them autonomously

### How It Works

```
User clicks "Run with Claude Code" in chat panel
    │
    ▼
Pigment spawns: claude --mcp-config /tmp/pigment-mcp.json \
                       --print --output-format stream-json \
                       "Create a dashboard with sidebar and 3 stat cards"
    │
    ▼
Claude Code:
  1. Connects to Pigment MCP server at localhost:PORT
  2. Discovers 13 canvas tools
  3. Calls get_canvas_state → reads current canvas
  4. Calls batch_operations → creates sidebar frame, stat cards
  5. Calls get_screenshot → verifies layout visually
  6. Calls update_object → fixes spacing issues
  7. Returns final text summary
    │
    ▼
User watches objects appear on canvas in real-time
```

### MCP Config for Claude Code

```json
{
  "mcpServers": {
    "pigment": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp"
    }
  }
}
```

Written to a temp file, passed via `--mcp-config`.

### Rust Implementation

```rust
// src-tauri/src/ai/cli.rs

pub async fn stream_claude_code_with_mcp(
    app: AppHandle,
    session_id: String,
    cli_path: String,
    prompt: String,
    mcp_port: u16,
) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::io::AsyncBufReadExt;

    // Write temp MCP config
    let config_path = std::env::temp_dir().join("pigment-mcp.json");
    std::fs::write(&config_path, serde_json::to_string(&json!({
        "mcpServers": {
            "pigment": {
                "type": "http",
                "url": format!("http://127.0.0.1:{}/mcp", mcp_port),
            }
        }
    })).unwrap()).map_err(|e| e.to_string())?;

    let mut child = Command::new(&cli_path)
        .args([
            "--print",
            "--output-format", "stream-json",
            "--mcp-config", config_path.to_str().unwrap(),
            &prompt,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude Code: {}", e))?;

    // Stream stdout (JSONL) to frontend
    if let Some(stdout) = child.stdout.take() {
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(chunk) = serde_json::from_str::<Value>(&line) {
                match chunk["type"].as_str() {
                    Some("assistant") => {
                        // Text output from Claude Code
                        if let Some(text) = chunk["content"].as_str() {
                            app.emit("ai:chunk", json!({
                                "sessionId": session_id,
                                "content": text,
                            })).ok();
                        }
                    }
                    Some("tool_use") => {
                        // Claude Code is calling a tool (via MCP)
                        // The MCP server handles this — we just show progress
                        app.emit("ai:tool_call", json!({
                            "sessionId": session_id,
                            "tool": chunk["name"],
                            "status": "executing",
                        })).ok();
                    }
                    Some("result") => {
                        // Final result
                        app.emit("ai:done", &session_id).ok();
                    }
                    _ => {}
                }
            }
        }
    }

    // Clean up
    std::fs::remove_file(&config_path).ok();

    Ok(())
}
```

### CLI Detection

```rust
#[tauri::command]
async fn detect_cli_tools() -> Result<Vec<CliTool>, String> {
    let mut tools = vec![];

    // Claude Code
    for path in ["/usr/local/bin/claude", "/opt/homebrew/bin/claude",
                  dirs::home_dir().map(|h| h.join(".local/bin/claude")).unwrap_or_default()] {
        if path.exists() {
            if let Ok(output) = tokio::process::Command::new(&path)
                .arg("--version").output().await {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                tools.push(CliTool {
                    name: "claude-code".into(),
                    path: path.to_string_lossy().into(),
                    version,
                });
            }
        }
    }

    // Codex
    for path in ["/usr/local/bin/codex", "/opt/homebrew/bin/codex"] {
        let p = std::path::PathBuf::from(path);
        if p.exists() {
            tools.push(CliTool { name: "codex".into(), path: path.into(), version: "".into() });
        }
    }

    Ok(tools)
}
```

---

## 6. Part D: Local Models via Ollama

### Ollama with Tool Use

Modern Ollama supports tool/function calling for compatible models. We use the same tool-use loop as cloud providers:

```rust
// src-tauri/src/ai/local.rs

pub async fn stream_ollama_with_tools(
    app: AppHandle,
    session_id: String,
    model: String,
    messages: Vec<Message>,
    system_prompt: String,
    tools: Vec<ToolDefinition>,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": messages,
            "system": system_prompt,
            "tools": tools,         // Ollama supports OpenAI-compatible tool format
            "stream": true,
        }))
        .send().await.map_err(|e| e.to_string())?;

    // Parse JSONL stream, handle tool calls same as cloud providers
    // ...
}
```

### Fallback for Models Without Tool Support

Some local models don't support tool calling. For these, use a **structured prompt** approach:

```
You are a design assistant for Pigment canvas. To manipulate the canvas, output JSON commands wrapped in <canvas_command> tags:

<canvas_command>
{"op": "create", "type": "frame", "name": "Card", "x": 100, "y": 100, "width": 320, "height": 200, "fill": "#ffffff"}
</canvas_command>

Current canvas state:
{...}

User request: Create a card component
```

The frontend parses `<canvas_command>` blocks and executes them.

### Detection, Model Management, Recommended Models

(Same as original plan — check `localhost:11434/api/tags`, show installed models in settings, support pull/delete.)

| Model                 | Size    | Tool Support | Best For                           |
| --------------------- | ------- | ------------ | ---------------------------------- |
| DeepSeek Coder V2 16B | ~9 GB   | Yes          | Code gen, design-to-code           |
| Llama 3.1 8B          | ~4.7 GB | Yes          | Fast chat, layout suggestions      |
| Qwen 2.5 Coder 7B     | ~4.4 GB | Yes          | Lightweight coding                 |
| CodeLlama 13B         | ~7 GB   | Limited      | Code tasks (use structured prompt) |

---

## 7. Part E: Frontend Chat Integration

### Chat Store Rewrite

```typescript
// src/features/chat/store/chat-store.ts — key changes

sendMessage: async (content: string) => {
  const tabId = useTabStore.getState().activeTabId;
  if (!tabId) return;

  const session = get().sessions[tabId];
  await chatApi.saveChatMessage(session.sessionId, "user", content);

  // Add user message to UI
  set(state => { /* add user message */ });

  // Set up event listeners
  const listeners = [
    await listen<AiChunk>("ai:chunk", (event) => {
      if (event.payload.sessionId !== session.sessionId) return;
      set(state => { /* append text to assistant message */ });
    }),
    await listen<AiToolCall>("ai:tool_call", (event) => {
      if (event.payload.sessionId !== session.sessionId) return;
      set(state => { /* show tool call indicator in chat */ });
    }),
    await listen<string>("ai:done", (event) => {
      if (event.payload !== session.sessionId) return;
      set(state => { /* mark message complete */ });
    }),
    await listen<AiError>("ai:error", (event) => {
      set(state => { /* show error */ });
    }),
  ];

  // Determine provider mode
  const model = get().selectedModel;
  const provider = getProviderForModel(model);

  try {
    if (provider === "claude-code") {
      // Agent mode — Claude Code with MCP
      const mcpPort = await invoke<number>("get_mcp_port");
      await invoke("send_claude_code_message", {
        sessionId: session.sessionId,
        prompt: content,
        mcpPort,
      });
    } else {
      // Chat mode — Cloud/Ollama with tool-use loop
      const canvas = getCanvasRef();
      const canvasState = canvas ? serializeCanvasForAi(canvas) : undefined;

      await invoke("send_ai_message", {
        provider,
        model: getModelId(model),
        sessionId: session.sessionId,
        messages: session.messages.map(m => ({ role: m.role, content: m.content })),
        canvasState,  // Rust includes this in system prompt + passes tools
      });
    }
  } catch (error) {
    set(state => { /* show error */ });
  } finally {
    listeners.forEach(fn => fn());
  }
},
```

### Tool Call Display in Chat

When the AI calls a canvas tool, show it inline in the chat:

```
User: Create a card with title and description

AI: I'll create a card layout for you.

  ┌─ Canvas Operation ──────────────────┐
  │ ✓ Created frame "Card" (320×200)    │
  │ ✓ Created text "Card Title"          │
  │ ✓ Created text "Description..."      │
  │ ✓ Set flex layout (column, gap: 12)  │
  └─────────────────────────────────────┘

I've created a card component with a white background,
title text, and description text arranged in a vertical
flex layout with 12px spacing.
```

### Model-to-Provider Mapping

```typescript
export type AiProvider = "anthropic" | "openai" | "claude-code" | "codex" | "ollama";

export const AI_MODELS: AiModelConfig[] = [
  // Cloud - Anthropic
  {
    id: "claude-sonnet",
    apiModelId: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    name: "Claude Sonnet 4.5",
    description: "Fast, canvas-aware",
    supportsTools: true,
  },
  {
    id: "claude-opus",
    apiModelId: "claude-opus-4-6",
    provider: "anthropic",
    name: "Claude Opus 4.6",
    description: "Most intelligent",
    supportsTools: true,
  },
  {
    id: "claude-haiku",
    apiModelId: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    name: "Claude Haiku 4.5",
    description: "Fastest",
    supportsTools: true,
  },
  // Cloud - OpenAI
  {
    id: "gpt-4o",
    apiModelId: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    description: "OpenAI flagship",
    supportsTools: true,
  },
  // CLI - most powerful
  {
    id: "claude-code",
    apiModelId: "claude-code",
    provider: "claude-code",
    name: "Claude Code (Agent)",
    description: "Full MCP agent, autonomous design",
    supportsTools: true,
  },
  // Local
  {
    id: "deepseek-coder",
    apiModelId: "deepseek-coder-v2:16b",
    provider: "ollama",
    name: "DeepSeek Coder V2",
    description: "Local, 9GB",
    supportsTools: true,
  },
  {
    id: "llama3",
    apiModelId: "llama3.1:8b",
    provider: "ollama",
    name: "Llama 3.1 8B",
    description: "Local, 4.7GB",
    supportsTools: true,
  },
];
```

---

## 8. Part F: Real-Time Canvas Feedback

### Visual Indicators During AI Operations

When the AI is manipulating the canvas, show visual feedback:

**1. Object Creation Animation**

```typescript
// When MCP handler creates an object, briefly flash it
function createObjectWithFeedback(canvas: Canvas, params: any) {
  const result = createObject(canvas, params);

  // Find the created object and add a brief highlight
  const obj = findObjectById(canvas, result.id);
  if (obj) {
    // Save original stroke
    const origStroke = obj.stroke;
    const origStrokeWidth = obj.strokeWidth;

    // Flash blue border
    obj.set({ stroke: "#4f8ef7", strokeWidth: 2 });
    canvas.requestRenderAll();

    setTimeout(() => {
      obj.set({ stroke: origStroke, strokeWidth: origStrokeWidth });
      canvas.requestRenderAll();
    }, 500);
  }

  return result;
}
```

**2. AI Activity Indicator on Canvas**
Show a small "AI is working..." pill on the canvas when the AI is actively making changes:

```typescript
// Overlay element shown during AI operations
<div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
  {aiIsWorking && (
    <div className="flex items-center gap-2 rounded-full bg-[#4f8ef7]/90 px-3 py-1 text-xs text-white">
      <Spinner className="size-3 animate-spin" />
      AI is designing...
    </div>
  )}
</div>
```

**3. Tool Call Timeline**
In the chat panel, show a collapsible timeline of operations:

```
▸ AI created 4 objects (0.8s)
  ├─ Frame "Card" at (100, 100) — 320×200
  ├─ Text "Title" inside Card
  ├─ Text "Description" inside Card
  └─ Set Card layout: column, gap 12px
```

### Undo Support

All AI operations should be undoable:

```typescript
// Before executing batch operations, save a history snapshot
function executeBatchWithHistory(canvas: Canvas, operations: any[]) {
  saveHistory(); // Save pre-AI state

  const result = executeBatch(canvas, operations);

  saveHistory(); // Save post-AI state

  return result;
}
```

User can press Cmd+Z to undo the entire AI operation as one step.

---

## 9. File Summary

### New Rust Files

| File                            | Purpose                                          |
| ------------------------------- | ------------------------------------------------ |
| `src-tauri/src/mcp/mod.rs`      | MCP module declaration                           |
| `src-tauri/src/mcp/server.rs`   | HTTP MCP server (axum), tool routing             |
| `src-tauri/src/mcp/tools.rs`    | Tool definitions (JSON schemas)                  |
| `src-tauri/src/mcp/bridge.rs`   | Rust↔Frontend bridge (events + oneshot channels) |
| `src-tauri/src/ai/mod.rs`       | AI module, shared types (`Message`, `AiChunk`)   |
| `src-tauri/src/ai/anthropic.rs` | Anthropic API with tool-use loop                 |
| `src-tauri/src/ai/openai.rs`    | OpenAI API with tool-use loop                    |
| `src-tauri/src/ai/cli.rs`       | Claude Code CLI with MCP config                  |
| `src-tauri/src/ai/local.rs`     | Ollama HTTP client with tool support             |
| `src-tauri/src/commands/ai.rs`  | Tauri commands for AI operations                 |

### New Frontend Files

| File                                                 | Purpose                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/mcp-handler.ts`                             | Listen for MCP operation events, execute on canvas           |
| `src/lib/mcp-operations.ts`                          | Canvas operation implementations (create/update/delete/etc.) |
| `src/lib/api/ai.ts`                                  | Tauri invoke wrappers + event listeners                      |
| `src/features/chat/utils/canvas-context.ts`          | Canvas serializer for AI system prompt                       |
| `src/features/chat/utils/tool-definitions.ts`        | Tool schemas shared between providers                        |
| `src/features/chat/components/tool-call-display.tsx` | UI for showing tool calls in chat                            |

### Modified Files

| File                                                        | Changes                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `src-tauri/Cargo.toml`                                      | Add reqwest, tokio, axum, uuid, lazy_static, futures-util |
| `src-tauri/src/lib.rs`                                      | Register AI/MCP commands, start MCP server on app init    |
| `src-tauri/capabilities/default.json`                       | Add `http:default`, port binding permission               |
| `src/features/chat/store/chat-store.ts`                     | Replace mock with real provider + tool calls              |
| `src/features/chat/components/chat-panel.tsx`               | Streaming display, tool call UI, provider badges          |
| `src/features/chat/types/index.ts`                          | Expand types, add tool types                              |
| `src/features/studio/components/studio-canvas.tsx`          | Init MCP handler, AI activity overlay                     |
| `src/features/studio/components/studio-settings-dialog.tsx` | AI settings, Ollama management                            |

---

## 10. Verification

### MCP Server

1. Start app → MCP server running on localhost
2. `curl http://localhost:PORT/mcp` with `tools/list` → returns 13 tools
3. Call `create_object` via curl → object appears on canvas
4. Call `get_screenshot` → returns base64 PNG of canvas

### Claude Code Integration

5. Run `claude --mcp-config /tmp/pigment-mcp.json "Create a card component"` → objects appear on canvas
6. Claude Code calls `get_canvas_state` → correctly reads existing objects
7. Claude Code calls `batch_operations` → multiple objects created atomically
8. Claude Code calls `get_screenshot` → verifies its work visually

### Cloud Providers

9. Enter Anthropic key → send "Create a blue rectangle" → rectangle appears on canvas
10. AI calls `create_object` → tool call shown in chat with details
11. Multi-turn: "Now make it larger" → AI calls `update_object` on the same rectangle
12. Ask "What's on my canvas?" → AI describes all objects correctly

### Local Models

13. Start Ollama with DeepSeek → select in model dropdown → send message
14. For models without tool support → `<canvas_command>` fallback works

### Real-Time Feedback

15. During AI operation → "AI is designing..." indicator shown
16. Objects flash blue briefly when AI creates them
17. Tool call timeline appears in chat (collapsible)
18. Cmd+Z undoes entire AI batch as one step

### Error Handling

19. Disconnect internet → send to Anthropic → graceful error in chat
20. Stop Ollama → send to local model → "Ollama not running" error
21. Invalid API key → "Authentication failed" error
22. AI tries to update nonexistent object → error returned, AI retries

## For Example

Tools and capabilities
The paper MCP server exposes the following tools, but for the most part you won’t need to use them directly.

get_basic_info — File name, page name, node count, and list of artboards with dimensions.
get_selection — Details about the currently selected nodes (IDs, names, types, size, artboard).
get_node_info — Details for a node by ID (size, visibility, lock, parent, children, text content).
get_children — Direct children of a node (IDs, names, types, child counts).
get_tree_summary — Compact text summary of a node’s subtree hierarchy (optional depth limit).
get_screenshot — Screenshot of a node by ID (base64 image; optional scale 1x or 2x).
get_jsx — JSX for a node and its descendants (Tailwind or inline-styles format).
get_computed_styles — Computed CSS styles for one or more nodes (batch).
get_fill_image — Image data from a node that has an image fill (base64 JPEG).
get_font_family_info — Look up whether a font family is available (user’s machine or Google Fonts); inspect weights and styles.
get_guide — Retrieve guided workflows for topics (e.g. figma-import for Figma import steps).
find_placement — Suggested x/y on the canvas to place a new artboard without overlap.
create_artboard — Create a new artboard; optional name and styles (e.g. width, height).
write_html — Parse HTML and add or replace nodes (insert-children or replace mode).
set_text_content — Set text content of one or more Text nodes (batch).
rename_nodes — Rename one or more layers (batch).
duplicate_nodes — Deep-clone nodes; returns new IDs and a descendant ID map.
update_styles — Update CSS styles on one or more nodes.
delete_nodes — Delete one or more nodes and all their descendants.
start_working_on_nodes — Mark artboards as being worked on (show indicator).
finish_working_on_nodes — Clear the working indicator from artboards.
