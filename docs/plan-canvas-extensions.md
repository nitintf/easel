# Pigment Canvas Extensions — Implementation Plan

## Problem

The app feels like a basic shape manipulator, not a design tool. Only Rectangle and Ellipse are available. The properties panel lacks shadows, gradients, blend modes, and advanced stroke options. There are no connectors, no grouping, no arrow key nudging, no image drag-and-drop. The `@yassidev/fabric-extensions` package is **incompatible** with Fabric.js v7 (targets v4, abandoned 2020) — all functionality must be built from scratch.

---

## Phase A: New Shape Tools

### New Shapes

| Shape | Fabric Class | Drawing Method | Default Size |
|-------|-------------|----------------|-------------|
| Triangle | `Triangle` | Drag to size | 100x100 |
| Line | `Path` | Click + drag endpoint | 100px |
| Arrow | `Path` (custom arrowhead) | Click + drag | 100px |
| Star (5-pointed) | `Polygon` (generated) | Click to place | 80px outer radius |
| Hexagon | `Polygon` (generated) | Click to place | 60px radius |

### Type Changes (`src/features/studio/types/index.ts`)

```typescript
export type ToolType =
  | "select" | "rectangle" | "ellipse" | "triangle"
  | "line" | "arrow" | "star" | "polygon"
  | "text" | "frame" | "hand";
```

Add to `TOOL_CONFIGS`:
```typescript
{ type: "triangle", label: "Triangle", shortcut: "", icon: "Triangle" },
{ type: "line",     label: "Line",     shortcut: "L", icon: "Minus" },
{ type: "arrow",    label: "Arrow",    shortcut: "A", icon: "ArrowUpRight" },
{ type: "star",     label: "Star",     shortcut: "",  icon: "Star" },
{ type: "polygon",  label: "Polygon",  shortcut: "",  icon: "Hexagon" },
```

### Shape Menu Redesign (`studio-shape-menu.tsx`)

Replace 2-item dropdown with categorized menu:

```
[Shapes v]
  ── Basic ──
  Rectangle    R
  Ellipse      O
  Triangle
  ── Lines ──
  Line         L
  Arrow        A
  ── Polygons ──
  Star
  Hexagon
```

The shape menu tracks the **last selected shape** as the primary icon.

### Helper Utilities (`src/features/studio/utils/shape-helpers.ts`) — NEW

```typescript
/** Generate SVG path for a line with optional arrowhead */
export function buildArrowPath(
  x1: number, y1: number,
  x2: number, y2: number,
  headLength?: number,
): string;

/** Generate points for a regular star polygon */
export function generateStarPoints(
  cx: number, cy: number,
  spikes: number, outerR: number, innerR: number,
): { x: number; y: number }[];

/** Generate points for a regular polygon (pentagon, hexagon, etc.) */
export function generatePolygonPoints(
  cx: number, cy: number,
  sides: number, radius: number,
): { x: number; y: number }[];
```

### Drawing Handlers (`studio-canvas.tsx`)

**Triangle** — same drag-to-resize pattern as Rectangle:
```typescript
if (tool === "triangle") {
  const tri = new Triangle({ left, top, width: 0, height: 0, fill: "#d9d9d9", ... });
  canvas.add(tri);
  activeShapeRef.current = tri;
}
// mouse:move → tri.set({ width, height })
```

**Line** — two-point drawing:
```typescript
if (tool === "line") {
  const path = new Path(`M ${x} ${y} L ${x} ${y}`, { stroke: "#b3b3b3", strokeWidth: 2, fill: "" });
  canvas.add(path);
  activeShapeRef.current = path;
}
// mouse:move → update path string to "M x1 y1 L x2 y2"
```

**Arrow** — same as line but with arrowhead:
```typescript
if (tool === "arrow") {
  const pathStr = buildArrowPath(x, y, x, y, 10);
  const path = new Path(pathStr, { stroke: "#b3b3b3", strokeWidth: 2, fill: "" });
  // Store custom isArrow property for identification
  canvas.add(path);
  activeShapeRef.current = path;
}
// mouse:move → recalculate full arrow path including arrowhead
```

**Star/Polygon** — click to place at default size:
```typescript
if (tool === "star") {
  const points = generateStarPoints(pointer.x, pointer.y, 5, 40, 16);
  const star = new Polygon(points, { fill: "#d9d9d9", stroke: "#b3b3b3", ... });
  canvas.add(star);
  canvas.setActiveObject(star);
  actions.setTool("select");
}
```

---

## Phase B: Arrow Connectors Between Objects

### Concept

Connectors are special `Path` objects that link two objects and auto-update when either object moves. They have custom properties:

```typescript
interface ConnectorMeta {
  isConnector: true;
  sourceId: string;
  targetId: string;
  connectorStyle: "straight" | "curved" | "elbow";
}
```

### Connection Point Calculation

Get the center of each object's bounding rect:
```typescript
function getObjectCenter(obj: FabricObject): { x: number; y: number } {
  const bound = obj.getBoundingRect();
  return { x: bound.left + bound.width / 2, y: bound.top + bound.height / 2 };
}
```

### Path Generation (`src/features/studio/utils/connector-helpers.ts`) — NEW

```typescript
/** Straight connector: line + arrowhead */
export function buildStraightConnector(src: Point, tgt: Point): string;

/** Curved connector: cubic bezier with auto control points */
export function buildCurvedConnector(src: Point, tgt: Point): string;
// Control points offset perpendicular to the line between src and tgt

/** Elbow connector: right-angle path */
export function buildElbowConnector(src: Point, tgt: Point): string;
```

### Auto-Update on Move

In the existing `canvas.on("object:moving")` handler:
```typescript
canvas.on("object:moving", (e) => {
  const movedId = (e.target as any).id;
  if (!movedId) return;

  // Find connectors referencing this object
  for (const obj of canvas.getObjects()) {
    const meta = obj as unknown as Partial<ConnectorMeta>;
    if (!meta.isConnector) continue;
    if (meta.sourceId !== movedId && meta.targetId !== movedId) continue;

    const source = getObjectById(meta.sourceId);
    const target = getObjectById(meta.targetId);
    if (!source || !target) continue;

    const newPath = buildConnectorPath(meta.connectorStyle, getObjectCenter(source), getObjectCenter(target));
    (obj as Path).set({ path: parsePath(newPath) }); // Fabric v7 path update
  }
  canvas.requestRenderAll();
});
```

### Connector Tool UX

1. User selects Arrow tool (A) and holds Shift, OR a dedicated Connector tool
2. Clicks on source object — object gets highlighted with blue border
3. Drags to target object — rubber-band preview line shown
4. Releases on target — connector created with `sourceId`/`targetId`
5. Releases on empty space — creates a static arrow (no tracking)

### Handle Deletion

When an object is deleted, remove all its connectors:
```typescript
canvas.on("object:removed", (e) => {
  const removedId = (e.target as any).id;
  const connectorsToRemove = canvas.getObjects().filter(obj => {
    const meta = obj as any;
    return meta.isConnector && (meta.sourceId === removedId || meta.targetId === removedId);
  });
  connectorsToRemove.forEach(c => canvas.remove(c));
});
```

---

## Phase C: Enhanced Properties Panel

### Current State

The properties panel has: Position (X/Y), Size (W/H), Rotation, Corner Radius, Opacity, Fill (color), Stroke (color + width), and Typography (for text).

### New Sections to Add

#### 1. Opacity & Blend Mode

```
Opacity    [====|========] 100%
Blend      [Normal       v]
```

Blend mode options: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity

Maps to: `obj.globalCompositeOperation`

#### 2. Shadows

```
Drop Shadow  [+]
  Color    [#000000] [==] 25%
  X        [4] px
  Y        [4] px
  Blur     [8] px
```

Maps to: `obj.shadow = new Shadow({ color, offsetX, offsetY, blur })`

Multiple shadows: store as array, render with custom after:render handler.

#### 3. Advanced Stroke

```
Stroke     [#b3b3b3] [==] 1px
  Align    [Center   v]   (Inside / Center / Outside)
  Dash     [Solid    v]   (Solid / Dashed / Dotted / Custom)
  Cap      [Butt     v]   (Butt / Round / Square)
  Join     [Miter    v]   (Miter / Round / Bevel)
```

Maps to:
- `strokeDashArray`: `[]` / `[8,4]` / `[2,2]`
- `strokeLineCap`: `"butt"` / `"round"` / `"square"`
- `strokeLineJoin`: `"miter"` / `"round"` / `"bevel"`
- Stroke alignment: emulated by adjusting strokeWidth and position

#### 4. Gradients

```
Fill       [Solid     v]  (Solid / Linear Gradient / Radial Gradient)
  Stop 1   [#ff0000] at 0%
  Stop 2   [#0000ff] at 100%
  [+ Add Stop]
  Angle    [90] deg
```

Maps to: `new Gradient({ type: 'linear', coords: {...}, colorStops: [...] })`

#### 5. Advanced Typography

```
Decoration  [U] [S]       (Underline / Strikethrough)
Transform   [None    v]   (None / Uppercase / Lowercase / Capitalize)
V-Align     [Top     v]   (Top / Middle / Bottom)
```

Maps to:
- `underline: true`, `linethrough: true`
- Text transform: modify text content + store original
- Vertical align: custom offset calculation

#### 6. Layer Controls (currently only in Layer tab)

Move to main Design tab:
```
Order   [Front] [Forward] [Backward] [Back]
Lock    [Toggle]
Visible [Toggle]
```

### New UI Component: Slider

Install shadcn slider: `npx shadcn@latest add slider`

Used for: Opacity, shadow blur, gradient stops.

### Files

| Action | File |
|--------|------|
| **Major expansion** | `src/features/studio/components/studio-properties-panel.tsx` |
| **Expand** | `src/features/studio/components/studio-property-field.tsx` (add slider, dropdown types) |
| **New** | `src/components/ui/slider.tsx` (shadcn) |
| **New** | `src/components/ui/select.tsx` (shadcn, for dropdowns) |
| **Modify** | `src/features/studio/hooks/use-selection.ts` (expose new properties) |

---

## Phase D: Canvas Shortcuts & Interactions

### Keyboard Shortcuts to Add

| Shortcut | Action | Implementation |
|----------|--------|---------------|
| `Cmd+A` | Select all | `canvas.discardActiveObject(); canvas.setActiveObject(new ActiveSelection(canvas.getObjects(), { canvas }))` |
| `Cmd+D` | Duplicate | Clone active object with +10px offset |
| `Cmd+G` | Group | `new Group(activeSelection.getObjects())` — **reassign gallery to Cmd+Shift+G** |
| `Cmd+Shift+G` | Ungroup | Extract objects from group |
| `Cmd+]` | Bring forward | `canvas.bringObjectForward(obj)` |
| `Cmd+[` | Send backward | `canvas.sendObjectBackwards(obj)` |
| `Cmd+Shift+]` | Bring to front | `canvas.bringObjectToFront(obj)` |
| `Cmd+Shift+[` | Send to back | `canvas.sendObjectToBack(obj)` |
| Arrow keys | Nudge 1px | `obj.set({ left: obj.left + dx })` |
| Shift+Arrow | Nudge 10px | Same with 10px step |
| `Cmd+0` | Zoom to fit | Calculate viewport to fit all objects |
| `Cmd+1` | Zoom to 100% | `canvas.setZoom(1); canvas.setViewportTransform([1,0,0,1,0,0])` |
| `Cmd+=` | Zoom in | Multiply zoom by 1.25 |
| `Cmd+-` | Zoom out | Multiply zoom by 0.8 |

### Image Drag-and-Drop

On the canvas container `<div>`:
```typescript
onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
onDrop={(e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => {
      FabricImage.fromURL(reader.result as string).then(img => {
        const pointer = canvas.getScenePoint(e);
        img.set({ left: pointer.x, top: pointer.y });
        canvas.add(img);
        canvas.setActiveObject(img);
      });
    };
    reader.readAsDataURL(file);
  }
}}
```

### Grouping / Ungrouping

**Group (Cmd+G):**
```typescript
const activeSelection = canvas.getActiveObject();
if (activeSelection?.type === "activeSelection") {
  const objects = (activeSelection as ActiveSelection).getObjects();
  canvas.discardActiveObject();
  const group = new Group(objects);
  objects.forEach(o => canvas.remove(o));
  canvas.add(group);
  canvas.setActiveObject(group);
}
```

**Ungroup (Cmd+Shift+G):**
```typescript
const obj = canvas.getActiveObject();
if (obj?.type === "group") {
  const items = (obj as Group).getObjects();
  canvas.remove(obj);
  items.forEach(item => canvas.add(item));
}
```

### Files

| Action | File |
|--------|------|
| **Major expansion** | `src/features/studio/components/studio-canvas.tsx` |
| **Modify** | `src/hooks/use-hotkeys.ts` (reassign Cmd+G) |
| **Modify** | `src/app.tsx` (gallery hotkey change) |

---

## Phase E: Polyline/Polygon Point Editing

### Concept

Double-click a Polygon, Polyline, or Path to enter **point editing mode**:
- Each vertex shows a draggable control point
- Double-click on a segment to add a new point
- Right-click a point to delete it
- Click away or press Escape to exit editing mode

### Implementation (`src/features/studio/utils/point-editing.ts`) — NEW

Uses Fabric v7's `Control` class to create dynamic per-vertex controls:

```typescript
export function enterPointEditingMode(canvas: Canvas, target: Polygon | Polyline) {
  const points = target.points;

  points.forEach((point, index) => {
    target.controls[`p${index}`] = new Control({
      positionHandler: () => new Point(point.x - target.pathOffset.x, point.y - target.pathOffset.y),
      actionHandler: (eventData, transform, x, y) => {
        // Update the point position
        points[index] = { x: x + target.pathOffset.x, y: y + target.pathOffset.y };
        target.dirty = true;
        canvas.requestRenderAll();
        return true;
      },
      render: (ctx, left, top) => {
        // Draw a blue circle at the control point
        ctx.beginPath();
        ctx.arc(left, top, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#4f8ef7";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      },
    });
  });

  canvas.requestRenderAll();
}

export function exitPointEditingMode(canvas: Canvas, target: Polygon | Polyline) {
  // Remove all custom controls starting with "p"
  Object.keys(target.controls)
    .filter(k => k.startsWith("p"))
    .forEach(k => delete target.controls[k]);
  canvas.requestRenderAll();
}
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/utils/point-editing.ts` |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (double-click handler) |

---

## Verification

1. **Shapes:** Select each new shape tool, draw on canvas, verify correct rendering
2. **Arrow:** Draw an arrow, verify arrowhead renders correctly
3. **Connector:** Create two frames, draw connector between them, move a frame — connector follows
4. **Properties:** Select object, verify shadow/gradient/blend mode controls work
5. **Shortcuts:** Test Cmd+A, Cmd+D, Cmd+G, arrow nudge, zoom shortcuts
6. **Image drop:** Drag a PNG from Finder onto canvas — image appears
7. **Point editing:** Double-click a polygon, drag a vertex, add/remove points
8. **Typecheck:** `pnpm typecheck` passes
9. **Lint:** `pnpm lint` — no new errors
