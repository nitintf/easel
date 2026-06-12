# Pigment Canvas — Comprehensive Implementation Plan

> This plan supersedes `plan-canvas-extensions.md` and covers the full transformation from "shape manipulator" to a **Figma-grade design editor** with auto-layout, hover inspection, drag reordering, a component system, and a rich properties panel.

---

## Table of Contents

1. [Current State & Architecture Gap](#1-current-state--architecture-gap)
2. [Phase 1: Frame System Overhaul — Groups with LayoutManager](#2-phase-1-frame-system-overhaul)
3. [Phase 2: Auto-Layout (Flex Layout Engine)](#3-phase-2-auto-layout)
4. [Phase 3: Hover Inspection & Selection Overlays](#4-phase-3-hover-inspection)
5. [Phase 4: Drag Reordering Within Auto-Layout Frames](#5-phase-4-drag-reordering)
6. [Phase 5: Rich Properties Panel](#6-phase-5-rich-properties-panel)
7. [Phase 6: Component System](#7-phase-6-component-system)
8. [Phase 7: New Shape Tools](#8-phase-7-new-shape-tools)
9. [Phase 8: Connectors & Arrows](#9-phase-8-connectors--arrows)
10. [Phase 9: Canvas Shortcuts & Interactions](#10-phase-9-canvas-shortcuts--interactions)
11. [Phase 10: Point Editing](#11-phase-10-point-editing)
12. [File Map](#12-file-map)
13. [Verification](#13-verification)

---

## 1. Current State & Architecture Gap

### What Exists Today

| Feature | Current State |
|---------|--------------|
| Shapes | Rectangle, Ellipse only |
| Frames | `Rect` with `isFrame: true` — flat objects, NOT Groups |
| Parent-child | `parentId` field on objects + manual `moveFrameChildren()` |
| Layout | None — children are free-positioned, no auto-layout |
| Properties | Position, Size, Rotation, Corner Radius, Opacity, Fill, Stroke, Typography |
| Hover | No hover inspection overlay |
| Drag reorder | Not supported |
| Components | Boolean `isComponent` flag — no instances, no overrides |
| Connectors | None |
| Shortcuts | Copy/Paste/Undo/Redo/Delete only |

### The Core Problem

Frames are currently just `Rect` objects with a `parentId` system bolted on top. Children don't actually *live inside* their parent — they're free-floating canvas objects whose movement is manually synchronized. This prevents:

- Auto-layout (flex direction, gap, padding)
- Clip content (overflow hidden)
- Hover inspection of nested elements
- Drag reordering within a frame
- Proper HTML-like tree behavior

**The solution**: Replace the `Rect + parentId` frame system with **Fabric.js v7 `Group` objects** using the built-in `LayoutManager` architecture.

---

## 2. Phase 1: Frame System Overhaul

### Goal

Replace flat `Rect` frames with proper `Group`-based frames that use Fabric.js v7's `LayoutManager`. Children physically live inside the Group, enabling clipping, layout, and nested selection.

### New Frame Class (`src/features/studio/fabric/PigmentFrame.ts`) — NEW

```typescript
import { Group, Rect, LayoutManager, ClipPathLayout, classRegistry } from "fabric";
import type { FabricObject, GroupProps } from "fabric";

interface PigmentFrameOptions extends Partial<GroupProps> {
  frameWidth?: number;
  frameHeight?: number;
  frameFill?: string;
  frameStroke?: string;
  frameStrokeWidth?: number;
  clipContent?: boolean;
}

export class PigmentFrame extends Group {
  static type = "pigmentFrame";

  // Frame-specific properties
  declare frameWidth: number;
  declare frameHeight: number;
  declare frameFill: string;
  declare frameStroke: string;
  declare frameStrokeWidth: number;
  declare clipContent: boolean;

  // Background rect (visual representation of the frame boundary)
  declare backgroundRect: Rect;

  constructor(objects: FabricObject[] = [], options: PigmentFrameOptions = {}) {
    const fw = options.frameWidth ?? 375;
    const fh = options.frameHeight ?? 667;

    // Background rect acts as the visible frame boundary
    const bg = new Rect({
      width: fw,
      height: fh,
      fill: options.frameFill ?? "#ffffff",
      stroke: options.frameStroke ?? "#e0e0e0",
      strokeWidth: options.frameStrokeWidth ?? 1,
      selectable: false,
      evented: false,
      originX: "center",
      originY: "center",
    });

    // ClipPath for overflow clipping
    const clip = new Rect({
      width: fw,
      height: fh,
      originX: "center",
      originY: "center",
    });

    super([bg, ...objects], {
      ...options,
      interactive: true,
      subTargetCheck: true,
      clipPath: options.clipContent !== false ? clip : undefined,
      layoutManager: new LayoutManager(new ClipPathLayout()),
    });

    this.backgroundRect = bg;
    this.frameWidth = fw;
    this.frameHeight = fh;
    this.frameFill = options.frameFill ?? "#ffffff";
    this.frameStroke = options.frameStroke ?? "#e0e0e0";
    this.frameStrokeWidth = options.frameStrokeWidth ?? 1;
    this.clipContent = options.clipContent !== false;
  }

  /** Resize the frame (updates bg rect + clipPath) */
  setFrameSize(width: number, height: number) {
    this.frameWidth = width;
    this.frameHeight = height;
    this.backgroundRect.set({ width, height });

    if (this.clipPath) {
      (this.clipPath as Rect).set({ width, height });
    }

    this.triggerLayout();
    this.setCoords();
  }

  /** Toggle clip content */
  setClipContent(clip: boolean) {
    this.clipContent = clip;
    if (clip) {
      this.clipPath = new Rect({
        width: this.frameWidth,
        height: this.frameHeight,
        originX: "center",
        originY: "center",
      });
    } else {
      this.clipPath = undefined;
    }
    this.dirty = true;
  }

  /** Serialization — include frame properties */
  toObject(propertiesToInclude?: string[]) {
    return {
      ...super.toObject(propertiesToInclude),
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      frameFill: this.frameFill,
      frameStroke: this.frameStroke,
      frameStrokeWidth: this.frameStrokeWidth,
      clipContent: this.clipContent,
    };
  }
}

// Register for JSON serialization/deserialization
classRegistry.setClass(PigmentFrame);
```

### Migration Strategy

Since the app is pre-release, we can do a **hard migration**:

1. On canvas load, detect old-style frames (`Rect` with `isFrame: true`)
2. For each old frame:
   - Create a `PigmentFrame` with the same position/size
   - Find all objects with `parentId === frame.id`
   - Add them as children of the PigmentFrame Group
   - Remove the old Rect and children from the canvas root
3. Save the migrated canvas state

```typescript
// src/features/studio/utils/frame-migration.ts — NEW
export function migrateOldFrames(canvas: Canvas): boolean {
  const objects = canvas.getObjects();
  const oldFrames = objects.filter((o: any) => o.isFrame && o.type === "rect");
  if (oldFrames.length === 0) return false;

  for (const frame of oldFrames) {
    const children = objects.filter((o: any) => o.parentId === (frame as any).id);
    const pigmentFrame = new PigmentFrame(children, {
      left: frame.left,
      top: frame.top,
      frameWidth: frame.width! * frame.scaleX!,
      frameHeight: frame.height! * frame.scaleY!,
      frameFill: frame.fill as string,
    });
    (pigmentFrame as any).id = (frame as any).id;
    (pigmentFrame as any).name = (frame as any).name;

    // Remove old objects from canvas
    canvas.remove(frame);
    children.forEach(c => canvas.remove(c));

    // Add new PigmentFrame
    canvas.add(pigmentFrame);
  }

  canvas.requestRenderAll();
  return true;
}
```

### Frame-Helpers Rewrite

Replace `frame-helpers.ts` entirely:

```typescript
// src/features/studio/utils/frame-helpers.ts — REWRITE
import { PigmentFrame } from "../fabric/PigmentFrame";
import type { Canvas, FabricObject } from "fabric";

/** Find the PigmentFrame at a given point (for auto-parenting on drop) */
export function findFrameAtPoint(canvas: Canvas, x: number, y: number): PigmentFrame | null {
  const objects = canvas.getObjects();
  // Reverse order = topmost first
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!(obj instanceof PigmentFrame)) continue;
    const bounds = obj.getBoundingRect();
    if (x >= bounds.left && x <= bounds.left + bounds.width &&
        y >= bounds.top && y <= bounds.top + bounds.height) {
      return obj;
    }
  }
  return null;
}

/** Move an object into a PigmentFrame */
export function addToFrame(frame: PigmentFrame, obj: FabricObject, canvas: Canvas) {
  canvas.remove(obj);
  // Convert absolute position to frame-relative
  const frameCenter = frame.getCenterPoint();
  obj.set({
    left: (obj.left ?? 0) - frameCenter.x,
    top: (obj.top ?? 0) - frameCenter.y,
  });
  frame.add(obj);
  frame.triggerLayout();
}

/** Remove an object from its parent PigmentFrame back to canvas root */
export function removeFromFrame(obj: FabricObject, canvas: Canvas) {
  const parent = obj.group;
  if (!(parent instanceof PigmentFrame)) return;

  // Convert frame-relative position to absolute
  const frameCenter = parent.getCenterPoint();
  const absLeft = (obj.left ?? 0) + frameCenter.x;
  const absTop = (obj.top ?? 0) + frameCenter.y;

  parent.remove(obj);
  obj.set({ left: absLeft, top: absTop });
  canvas.add(obj);
  parent.triggerLayout();
}
```

### Store Changes

Update `StudioObject` to reflect the new Group-based frames:

```typescript
// In types/index.ts — add:
interface StudioObject {
  id: string;
  type: string;
  name: string;
  visible: boolean;
  locked: boolean;
  parentId?: string;   // DEPRECATED — kept for migration only
  isFrame?: boolean;   // Now derived: obj instanceof PigmentFrame
  isComponent?: boolean;
  // New frame-specific properties:
  layoutMode?: "free" | "flex" | "grid";  // NEW
  flexDirection?: "row" | "column";        // NEW
  flexGap?: number;                        // NEW
  flexAlign?: "start" | "center" | "end" | "stretch";  // NEW
  flexJustify?: "start" | "center" | "end" | "space-between" | "space-around";  // NEW
  padding?: { top: number; right: number; bottom: number; left: number };  // NEW
  clipContent?: boolean;                   // NEW
  fillWidth?: boolean;                     // NEW — child fills parent width
  fillHeight?: boolean;                    // NEW — child fills parent height
  hugWidth?: boolean;                      // NEW — frame shrinks to content width
  hugHeight?: boolean;                     // NEW — frame shrinks to content height
}
```

### `syncObjectsFromCanvas()` Update

Extract children from Groups recursively:

```typescript
function extractObjectsFromCanvas(canvas: Canvas): StudioObject[] {
  const result: StudioObject[] = [];

  function walk(objects: FabricObject[], parentId?: string) {
    for (const obj of objects) {
      const id = (obj as any).id;
      if (!id) continue;

      const isPigmentFrame = obj instanceof PigmentFrame;

      result.push({
        id,
        type: obj.type ?? "unknown",
        name: (obj as any).name ?? obj.type ?? "Object",
        visible: obj.visible ?? true,
        locked: !(obj.selectable ?? true),
        isFrame: isPigmentFrame,
        isComponent: (obj as any).isComponent ?? false,
        parentId, // For tree rendering in layers panel
        // Extract layout props if frame:
        ...(isPigmentFrame ? {
          layoutMode: (obj as any).layoutMode ?? "free",
          flexDirection: (obj as any).flexDirection,
          flexGap: (obj as any).flexGap,
          clipContent: (obj as PigmentFrame).clipContent,
        } : {}),
      });

      // Recurse into Group children
      if (isPigmentFrame) {
        const children = (obj as PigmentFrame).getObjects()
          .filter((c: any) => c !== (obj as PigmentFrame).backgroundRect);
        walk(children, id);
      }
    }
  }

  walk(canvas.getObjects());
  return result;
}
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/fabric/PigmentFrame.ts` |
| **New** | `src/features/studio/utils/frame-migration.ts` |
| **Rewrite** | `src/features/studio/utils/frame-helpers.ts` |
| **Modify** | `src/features/studio/store/studio-store.ts` (new extraction logic) |
| **Modify** | `src/features/studio/types/index.ts` (extend StudioObject) |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (frame creation, migration on load) |

---

## 3. Phase 2: Auto-Layout

### Goal

Implement Figma-like auto-layout using a custom `FlexLayoutStrategy` for Fabric.js v7's `LayoutManager`. Frames can be switched between "Free" (absolute positioning) and "Flex" (auto-layout) modes.

### Custom LayoutStrategy (`src/features/studio/fabric/FlexLayoutStrategy.ts`) — NEW

```typescript
import { LayoutStrategy, Point, classRegistry } from "fabric";
import type { StrictLayoutContext, LayoutStrategyResult, FabricObject } from "fabric";

export type FlexDirection = "row" | "column";
export type FlexAlign = "start" | "center" | "end" | "stretch";
export type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around";

export interface FlexLayoutOptions {
  direction: FlexDirection;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  alignItems: FlexAlign;
  justifyContent: FlexJustify;
  hugWidth: boolean;   // Frame shrinks to fit content width
  hugHeight: boolean;  // Frame shrinks to fit content height
}

export class FlexLayoutStrategy extends LayoutStrategy {
  static readonly type = "flex";

  direction: FlexDirection;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  alignItems: FlexAlign;
  justifyContent: FlexJustify;
  hugWidth: boolean;
  hugHeight: boolean;

  constructor(options: Partial<FlexLayoutOptions> = {}) {
    super();
    this.direction = options.direction ?? "column";
    this.gap = options.gap ?? 0;
    this.padding = options.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    this.alignItems = options.alignItems ?? "start";
    this.justifyContent = options.justifyContent ?? "start";
    this.hugWidth = options.hugWidth ?? false;
    this.hugHeight = options.hugHeight ?? false;
  }

  shouldPerformLayout(): boolean {
    return true;
  }

  calcLayoutResult(
    context: StrictLayoutContext,
    objects: FabricObject[],
  ): LayoutStrategyResult | undefined {
    // Filter out the backgroundRect (first child of PigmentFrame)
    const layoutChildren = objects.filter(
      (obj: any) => obj.selectable !== false || obj.evented !== false
    );

    if (layoutChildren.length === 0) return undefined;

    const { padding, gap, direction, alignItems, justifyContent } = this;
    const isRow = direction === "row";
    const target = context.target;

    // Get fixed frame dimensions (for non-hug modes)
    const frameW = (target as any).frameWidth ?? target.width ?? 200;
    const frameH = (target as any).frameHeight ?? target.height ?? 200;

    // Measure children
    const childSizes = layoutChildren.map(obj => ({
      obj,
      w: obj.getScaledWidth(),
      h: obj.getScaledHeight(),
      fillW: (obj as any).fillWidth === true,
      fillH: (obj as any).fillHeight === true,
    }));

    // Calculate total content along main axis
    let mainTotal = 0;
    for (const c of childSizes) {
      mainTotal += isRow ? c.w : c.h;
    }
    mainTotal += gap * Math.max(0, childSizes.length - 1);

    // Determine group size
    const contentW = padding.left + padding.right + (isRow
      ? mainTotal
      : Math.max(...childSizes.map(c => c.w), 0));
    const contentH = padding.top + padding.bottom + (isRow
      ? Math.max(...childSizes.map(c => c.h), 0)
      : mainTotal);

    const groupW = this.hugWidth ? contentW : frameW;
    const groupH = this.hugHeight ? contentH : frameH;

    // Available space for flex children
    const availableMain = isRow
      ? groupW - padding.left - padding.right
      : groupH - padding.top - padding.bottom;
    const availableCross = isRow
      ? groupH - padding.top - padding.bottom
      : groupW - padding.left - padding.right;

    // Calculate main-axis starting offset based on justifyContent
    let mainOffset: number;
    let extraGap = 0;

    switch (justifyContent) {
      case "center":
        mainOffset = (availableMain - mainTotal) / 2;
        break;
      case "end":
        mainOffset = availableMain - mainTotal;
        break;
      case "space-between":
        mainOffset = 0;
        if (childSizes.length > 1) {
          extraGap = (availableMain - mainTotal + gap * (childSizes.length - 1))
            / (childSizes.length - 1) - gap;
        }
        break;
      case "space-around":
        if (childSizes.length > 0) {
          const totalSpace = availableMain - mainTotal + gap * (childSizes.length - 1);
          extraGap = totalSpace / childSizes.length - gap;
          mainOffset = (gap + extraGap) / 2;
        } else {
          mainOffset = 0;
        }
        break;
      default: // "start"
        mainOffset = 0;
    }

    // Position each child (relative to group center)
    let cursor = (isRow ? padding.left : padding.top) + mainOffset;

    for (const child of childSizes) {
      const mainSize = isRow ? child.w : child.h;
      const crossSize = isRow ? child.h : child.w;

      // Handle "fill" sizing
      if (isRow && child.fillH) {
        child.obj.set({ scaleY: availableCross / (child.obj.height ?? 1) });
      }
      if (!isRow && child.fillW) {
        child.obj.set({ scaleX: availableCross / (child.obj.width ?? 1) });
      }
      if (alignItems === "stretch") {
        if (isRow) {
          child.obj.set({ scaleY: availableCross / (child.obj.height ?? 1) });
        } else {
          child.obj.set({ scaleX: availableCross / (child.obj.width ?? 1) });
        }
      }

      const actualCrossSize = isRow
        ? child.obj.getScaledHeight()
        : child.obj.getScaledWidth();

      // Main axis position (relative to group center)
      const mainPos = cursor + mainSize / 2 - (isRow ? groupW : groupH) / 2;

      // Cross axis position
      let crossPos: number;
      const crossStart = isRow ? padding.top : padding.left;

      switch (alignItems) {
        case "center":
          crossPos = crossStart + (availableCross - actualCrossSize) / 2
            + actualCrossSize / 2 - (isRow ? groupH : groupW) / 2;
          break;
        case "end":
          crossPos = crossStart + availableCross - actualCrossSize
            + actualCrossSize / 2 - (isRow ? groupH : groupW) / 2;
          break;
        case "stretch":
        case "start":
        default:
          crossPos = crossStart + actualCrossSize / 2
            - (isRow ? groupH : groupW) / 2;
          break;
      }

      // Apply position
      if (isRow) {
        child.obj.set({ left: mainPos, top: crossPos });
      } else {
        child.obj.set({ left: crossPos, top: mainPos });
      }
      child.obj.setCoords();

      cursor += mainSize + gap + extraGap;
    }

    const size = new Point(groupW, groupH);
    const center = context.target.getRelativeCenterPoint();

    return { center, size };
  }

  toObject() {
    return {
      ...super.toObject(),
      direction: this.direction,
      gap: this.gap,
      padding: this.padding,
      alignItems: this.alignItems,
      justifyContent: this.justifyContent,
      hugWidth: this.hugWidth,
      hugHeight: this.hugHeight,
    };
  }
}

classRegistry.setClass(FlexLayoutStrategy);
```

### Switching Layout Modes on PigmentFrame

```typescript
// Add to PigmentFrame class:

setLayoutMode(mode: "free" | "flex") {
  if (mode === "flex") {
    this.layoutManager = new LayoutManager(new FlexLayoutStrategy({
      direction: this.flexDirection ?? "column",
      gap: this.flexGap ?? 0,
      padding: this.framePadding ?? { top: 0, right: 0, bottom: 0, left: 0 },
      alignItems: this.flexAlign ?? "start",
      justifyContent: this.flexJustify ?? "start",
      hugWidth: this.hugWidth ?? false,
      hugHeight: this.hugHeight ?? false,
    }));
  } else {
    this.layoutManager = new LayoutManager(new ClipPathLayout());
  }
  this.triggerLayout();
}

updateFlexOptions(options: Partial<FlexLayoutOptions>) {
  const strategy = this.layoutManager.strategy;
  if (strategy instanceof FlexLayoutStrategy) {
    Object.assign(strategy, options);
    this.triggerLayout();
  }
}
```

### Properties Panel — Layout Section

When a PigmentFrame is selected, the properties panel shows:

```
Flex Layout                          [Toggle icon]
┌──────────────────────────────────────────────┐
│  [Grid] [Vertical ↓] [Horizontal →]         │  ← layout mode selector
│                                              │
│  Alignment          Gap                      │
│  ┌─────────┐       ○ ◇ [12]                 │  ← 3x3 alignment grid
│  │ ● · · │       ○ Space Between             │
│  │ · · · │       ○ Space Around              │
│  │ · · · │                                   │
│  └─────────┘                                  │
│                                              │
│  Padding         ⚙                           │
│  ┌──────────────────┐                        │
│  │ [16]             │                        │  ← uniform or per-side
│  └──────────────────┘                        │
│                                              │
│  Dimensions                                  │
│  W [640]     H [108]                         │
│  ☑ Fill Width    ☐ Fill Height               │
│  ☐ Hug Width     ☑ Hug Height                │
│  ☐ Clip Content                              │
└──────────────────────────────────────────────┘
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/fabric/FlexLayoutStrategy.ts` |
| **Modify** | `src/features/studio/fabric/PigmentFrame.ts` (layout mode switching) |
| **Modify** | `src/features/studio/components/studio-properties-panel.tsx` (layout section) |
| **Modify** | `src/features/studio/hooks/use-selection.ts` (expose layout properties) |

---

## 4. Phase 3: Hover Inspection

### Goal

When hovering over objects on the canvas, show:
1. **Dotted blue border** around the hovered element (not the selected one)
2. **Inner element outlines** when hovering a frame — child boundaries shown
3. **Spacing indicators** between elements (pink/red dimension lines like Figma's measurement overlays)
4. **Tooltip** showing element name and dimensions

### Implementation: Canvas Overlay Layer

Add a transparent overlay `<canvas>` element on top of the Fabric.js canvas. This overlay renders hover outlines without interfering with Fabric's rendering or hit testing.

```typescript
// src/features/studio/utils/hover-overlay.ts — NEW

export interface HoverInfo {
  bounds: { left: number; top: number; width: number; height: number };
  name: string;
  type: string;
  children?: HoverInfo[];
}

export function renderHoverOverlay(
  ctx: CanvasRenderingContext2D,
  hovered: HoverInfo | null,
  selected: HoverInfo | null,
  viewportTransform: number[],
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!hovered) return;

  ctx.save();
  // Apply same viewport transform as the main canvas
  ctx.setTransform(
    viewportTransform[0], viewportTransform[1],
    viewportTransform[2], viewportTransform[3],
    viewportTransform[4], viewportTransform[5],
  );

  // Draw hovered element outline (dotted blue)
  const b = hovered.bounds;
  ctx.strokeStyle = "#4f8ef7";
  ctx.lineWidth = 1 / viewportTransform[0]; // 1px regardless of zoom
  ctx.setLineDash([4 / viewportTransform[0], 4 / viewportTransform[0]]);
  ctx.strokeRect(b.left, b.top, b.width, b.height);

  // Draw child outlines (lighter blue, dotted)
  if (hovered.children) {
    ctx.strokeStyle = "#4f8ef7";
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 0.5 / viewportTransform[0];
    for (const child of hovered.children) {
      const cb = child.bounds;
      ctx.strokeRect(cb.left, cb.top, cb.width, cb.height);
    }
    ctx.globalAlpha = 1;
  }

  ctx.setLineDash([]);

  // Name tooltip (in screen space)
  ctx.restore();

  // Draw label in screen space
  const screenX = b.left * viewportTransform[0] + viewportTransform[4];
  const screenY = b.top * viewportTransform[3] + viewportTransform[5];
  const label = `${hovered.name} — ${Math.round(b.width)}×${Math.round(b.height)}`;

  ctx.font = "10px Inter, system-ui, sans-serif";
  const metrics = ctx.measureText(label);
  const labelW = metrics.width + 8;
  const labelH = 16;

  ctx.fillStyle = "#4f8ef7";
  ctx.fillRect(screenX, screenY - labelH - 4, labelW, labelH);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, screenX + 4, screenY - 4 - 3);
}
```

### Canvas Integration

```typescript
// In studio-canvas.tsx, add a second <canvas> element:

<div className="relative h-full w-full">
  <canvas ref={canvasRef} />
  <canvas
    ref={overlayRef}
    className="pointer-events-none absolute inset-0"
    style={{ zIndex: 10 }}
  />
</div>
```

Hook into `mouse:move` to find the object under cursor:

```typescript
canvas.on("mouse:over", (e) => {
  if (tool !== "select") return;
  if (!e.target) { setHovered(null); return; }

  const obj = e.target;
  const bounds = obj.getBoundingRect();

  const hoverInfo: HoverInfo = {
    bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
    name: (obj as any).name ?? obj.type ?? "Object",
    type: obj.type ?? "unknown",
  };

  // If hovering a PigmentFrame, include child bounds
  if (obj instanceof PigmentFrame) {
    hoverInfo.children = obj.getObjects()
      .filter((c: any) => c !== obj.backgroundRect)
      .map(c => {
        const cb = c.getBoundingRect();
        return {
          bounds: { left: cb.left, top: cb.top, width: cb.width, height: cb.height },
          name: (c as any).name ?? c.type ?? "Child",
          type: c.type ?? "unknown",
        };
      });
  }

  setHovered(hoverInfo);
});

canvas.on("mouse:out", () => setHovered(null));
```

### Spacing Measurement Overlay

When an object is selected and user hovers another object, show the distance between them:

```typescript
// In hover-overlay.ts:
export function renderSpacingGuides(
  ctx: CanvasRenderingContext2D,
  selected: HoverInfo,
  hovered: HoverInfo,
  viewportTransform: number[],
) {
  // Calculate distances between edges
  const sRight = selected.bounds.left + selected.bounds.width;
  const hLeft = hovered.bounds.left;

  // Horizontal distance
  if (sRight < hLeft) {
    const dist = Math.round(hLeft - sRight);
    const midY = Math.max(selected.bounds.top, hovered.bounds.top);

    ctx.save();
    ctx.setTransform(...viewportTransform);
    ctx.strokeStyle = "#ff5c5c";
    ctx.lineWidth = 1 / viewportTransform[0];

    // Draw line
    ctx.beginPath();
    ctx.moveTo(sRight, midY + 10);
    ctx.lineTo(hLeft, midY + 10);
    ctx.stroke();

    // Draw label
    ctx.restore();
    // ... screen-space label with distance in px
  }
  // Repeat for vertical, left, etc.
}
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/utils/hover-overlay.ts` |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (overlay canvas, mouse:over/out) |

---

## 5. Phase 4: Drag Reordering

### Goal

When an auto-layout frame contains children, dragging a child should:
1. Show a **drop indicator line** at the insertion point
2. On release, **reorder** the child within the flex layout
3. Animate the other children shifting into new positions

This is the behavior shown in the "Item Item Item" screenshot — dragging one item above another swaps their position.

### Implementation

Fabric.js v7's `Group` with `interactive: true` allows selecting and moving children. We intercept the drag to implement reordering:

```typescript
// src/features/studio/utils/flex-reorder.ts — NEW

import { PigmentFrame } from "../fabric/PigmentFrame";
import { FlexLayoutStrategy } from "../fabric/FlexLayoutStrategy";
import type { Canvas, FabricObject } from "fabric";

interface DragState {
  frame: PigmentFrame;
  draggedObj: FabricObject;
  originalIndex: number;
  dropIndex: number;
}

let dragState: DragState | null = null;

/** Start tracking a drag within an auto-layout frame */
export function startFlexDrag(frame: PigmentFrame, obj: FabricObject) {
  const strategy = frame.layoutManager.strategy;
  if (!(strategy instanceof FlexLayoutStrategy)) return;

  const children = frame.getObjects().filter(
    (c: any) => c !== frame.backgroundRect
  );
  const originalIndex = children.indexOf(obj);
  if (originalIndex === -1) return;

  dragState = { frame, draggedObj: obj, originalIndex, dropIndex: originalIndex };
}

/** During drag, calculate which index the dragged item should drop into */
export function updateFlexDrag(pointer: { x: number; y: number }): number | null {
  if (!dragState) return null;

  const { frame, draggedObj } = dragState;
  const strategy = frame.layoutManager.strategy as FlexLayoutStrategy;
  const isRow = strategy.direction === "row";

  const children = frame.getObjects().filter(
    (c: any) => c !== frame.backgroundRect && c !== draggedObj
  );

  // Convert pointer to frame-local coordinates
  const frameCenter = frame.getCenterPoint();
  const localX = pointer.x - frameCenter.x;
  const localY = pointer.y - frameCenter.y;
  const localMain = isRow ? localX : localY;

  // Find insertion index
  let insertIndex = children.length;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childMain = isRow ? (child.left ?? 0) : (child.top ?? 0);
    if (localMain < childMain) {
      insertIndex = i;
      break;
    }
  }

  dragState.dropIndex = insertIndex;
  return insertIndex;
}

/** Complete the drag — reorder children and trigger layout */
export function endFlexDrag() {
  if (!dragState) return;

  const { frame, draggedObj, originalIndex, dropIndex } = dragState;

  if (originalIndex !== dropIndex) {
    // Remove and re-insert at new index
    frame.remove(draggedObj);

    // Get current children (after removal)
    const children = frame.getObjects();
    const bgIndex = children.indexOf(frame.backgroundRect);

    // Insert at new position (accounting for backgroundRect at index 0)
    const actualInsertIndex = bgIndex + 1 + dropIndex;
    frame.insertAt(actualInsertIndex, draggedObj);
    frame.triggerLayout();
  }

  dragState = null;
}

/** Render the drop indicator line on the overlay canvas */
export function renderDropIndicator(
  ctx: CanvasRenderingContext2D,
  viewportTransform: number[],
) {
  if (!dragState) return;

  const { frame, dropIndex } = dragState;
  const strategy = frame.layoutManager.strategy as FlexLayoutStrategy;
  const isRow = strategy.direction === "row";

  const children = frame.getObjects().filter(
    (c: any) => c !== frame.backgroundRect && c !== dragState!.draggedObj
  );

  if (children.length === 0) return;

  // Calculate indicator position
  const frameCenter = frame.getCenterPoint();
  let indicatorMain: number;

  if (dropIndex >= children.length) {
    const last = children[children.length - 1];
    const lastBounds = last.getBoundingRect();
    indicatorMain = isRow
      ? lastBounds.left + lastBounds.width + strategy.gap / 2
      : lastBounds.top + lastBounds.height + strategy.gap / 2;
  } else {
    const target = children[dropIndex];
    const targetBounds = target.getBoundingRect();
    indicatorMain = isRow
      ? targetBounds.left - strategy.gap / 2
      : targetBounds.top - strategy.gap / 2;
  }

  ctx.save();
  ctx.setTransform(...viewportTransform as [number, number, number, number, number, number]);

  ctx.strokeStyle = "#4f8ef7";
  ctx.lineWidth = 2 / viewportTransform[0];
  ctx.beginPath();

  const frameBounds = frame.getBoundingRect();
  if (isRow) {
    ctx.moveTo(indicatorMain, frameBounds.top);
    ctx.lineTo(indicatorMain, frameBounds.top + frameBounds.height);
  } else {
    ctx.moveTo(frameBounds.left, indicatorMain);
    ctx.lineTo(frameBounds.left + frameBounds.width, indicatorMain);
  }
  ctx.stroke();
  ctx.restore();
}
```

### Canvas Integration

```typescript
// In studio-canvas.tsx:
canvas.on("object:moving", (e) => {
  const obj = e.target;
  if (!obj?.group || !(obj.group instanceof PigmentFrame)) return;

  const frame = obj.group as PigmentFrame;
  const strategy = frame.layoutManager.strategy;
  if (!(strategy instanceof FlexLayoutStrategy)) return;

  if (!dragState) {
    startFlexDrag(frame, obj);
  }

  const pointer = canvas.getScenePoint(e.e);
  updateFlexDrag(pointer);

  // Render drop indicator on overlay
  renderDropIndicator(overlayCtx, canvas.viewportTransform);
});

canvas.on("object:modified", (e) => {
  if (dragState) {
    endFlexDrag();
    // Clear overlay
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
});
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/utils/flex-reorder.ts` |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (drag handlers) |
| **Modify** | `src/features/studio/utils/hover-overlay.ts` (drop indicator rendering) |

---

## 6. Phase 5: Rich Properties Panel

### Goal

Redesign the properties panel to match the Figma-grade UI shown in the screenshots. The panel should be context-aware — showing different sections based on what's selected.

### Panel Sections

#### A. Header

```
[Component Icon] Alert/Info              [Copy icon]
◇ Detach Component                       (only for instances)
```

Shows component name if the object is a component instance. "Detach Component" breaks the link.

#### B. Context (AI)

```
Context                                  [Collapse ▾]
┌─────────────────────────────────────────────────┐
│ [Text area for AI context description]          │
│ e.g., "This is an info alert box used for..."   │
└─────────────────────────────────────────────────┘
```

Free-text field stored as custom property `(obj as any).aiContext`. Used by the AI to understand what the element represents.

#### C. Alignment

```
Alignment
[⊢] [⊤] [≡] [⊥] [⊣] [⊤]
 L    C    R   T    M    B
```

6 buttons: Align Left, Center H, Right, Top, Center V, Bottom. Works on single objects (relative to parent/canvas) and multi-selection (relative to selection bounds).

#### D. Position & Rotation

```
Position
X [200]     Y [508]
R [0°]
```

#### E. Flex Layout (Frames only)

```
Flex Layout                              [Detach ✕]
┌──────────────────────────────────────────────────┐
│ [Grid🔲] [Vertical↓] [Horizontal→]              │
│                                                  │
│ Alignment          Gap                           │
│ ┌─────────┐       ● ◇ [12]                      │
│ │[●] · ·  │       ○ Space Between               │
│ │ ·  · ·  │       ○ Space Around                 │
│ │ ·  · ·  │                                      │
│ └─────────┘                                      │
│                                                  │
│ Padding           ⚙ (toggle per-side)            │
│ [16]                                             │
│                                                  │
│ (per-side expanded:)                             │
│ T [16]  R [16]                                   │
│ B [16]  L [16]                                   │
└──────────────────────────────────────────────────┘
```

**3x3 Alignment Grid**: A clickable 3x3 dot matrix. The active dot shows current `alignItems` + `justifyContent` combination:

| Position | alignItems | justifyContent |
|----------|-----------|----------------|
| Top-Left | start | start |
| Top-Center | start | center |
| Top-Right | start | end |
| Center-Left | center | start |
| Center | center | center |
| Center-Right | center | end |
| Bottom-Left | end | start |
| Bottom-Center | end | center |
| Bottom-Right | end | end |

#### F. Dimensions

```
Dimensions
W [640]       H [108]
☑ Fill Width    ☐ Fill Height
☐ Hug Width     ☑ Hug Height
☐ Clip Content
```

- **Fill Width/Height**: Child expands to fill parent's cross axis
- **Hug Width/Height**: Frame shrinks to fit content (auto-size)
- **Clip Content**: Toggle `clipPath` on frame

#### G. Appearance

```
Appearance
% [100]    ⊡ [0]    ◇ [Normal ▾]    ⊡ (Blend mode)
```

- Opacity slider (0-100%)
- Corner radius
- Blend mode dropdown (Normal, Multiply, Screen, Overlay, ...)

Maps to: `opacity`, `rx`/`ry`, `globalCompositeOperation`

#### H. Fill

```
Fill                                     [+]
[■ color] --color-info  ◇  👁  [−]
```

- Color picker
- CSS variable reference (for design tokens)
- Gradient option: Solid / Linear / Radial
- Visibility toggle per fill
- Multiple fills supported (layered)
- Add/remove buttons

#### I. Stroke

```
Stroke                                   [+]
[■ color] [width]px  ◇  👁  [−]
─────────────────────────
Align    [Center ▾]  (Inside / Center / Outside)
Dash     [Solid ▾]   (Solid / Dashed / Dotted)
Cap      [Butt ▾]    (Butt / Round / Square)
Join     [Miter ▾]   (Miter / Round / Bevel)
```

#### J. Effects

```
Effects                                  [+]
─────────────────────────
Drop Shadow  👁  [−]
  Color [#000]  Opacity [25%]
  X [4]px  Y [4]px  Blur [8]px
─────────────────────────
Inner Shadow  👁  [−]
  ...
─────────────────────────
Blur  👁  [−]
  Amount [4]px
```

Multiple effects supported. Each toggleable and removable.

Maps to:
- Drop Shadow: `obj.shadow = new Shadow({ ... })`
- Inner Shadow: Custom `after:render` handler
- Blur: `obj.shadow` with `offsetX=0, offsetY=0` or CSS filter via custom render

#### K. Typography (text objects)

```
Typography
Font     [Inter           ▾]
Weight   [Regular (400)   ▾]
Size     [16]     Line Height [1.5]
Spacing  [0]      Align [Left|Center|Right]
─────────────────────────
Style    [B] [I] [U] [S]
Transform [None ▾] (None / Uppercase / Lowercase / Capitalize)
```

#### L. Export

```
Export
Format   [PNG ▾]  Scale [2x ▾]
[Export Selected]
```

### New UI Components Needed

| Component | Source |
|-----------|--------|
| `Slider` | shadcn `npx shadcn@latest add slider` |
| `Select` | shadcn `npx shadcn@latest add select` |
| `Switch` | shadcn `npx shadcn@latest add switch` |
| `Popover` | shadcn (already have?) |
| `ColorPicker` | Custom — color input + hex field + opacity |
| `AlignmentGrid` | Custom — 3x3 clickable dot matrix |
| `LayoutModeSelector` | Custom — 3-button segmented control |

### Files

| Action | File |
|--------|------|
| **Rewrite** | `src/features/studio/components/studio-properties-panel.tsx` |
| **New** | `src/features/studio/components/properties/layout-section.tsx` |
| **New** | `src/features/studio/components/properties/alignment-section.tsx` |
| **New** | `src/features/studio/components/properties/dimensions-section.tsx` |
| **New** | `src/features/studio/components/properties/appearance-section.tsx` |
| **New** | `src/features/studio/components/properties/fill-section.tsx` |
| **New** | `src/features/studio/components/properties/stroke-section.tsx` |
| **New** | `src/features/studio/components/properties/effects-section.tsx` |
| **New** | `src/features/studio/components/properties/typography-section.tsx` |
| **New** | `src/features/studio/components/properties/context-section.tsx` |
| **New** | `src/features/studio/components/properties/alignment-grid.tsx` |
| **New** | `src/components/ui/slider.tsx` (shadcn) |
| **New** | `src/components/ui/select.tsx` (shadcn) |
| **New** | `src/components/ui/switch.tsx` (shadcn) |
| **Modify** | `src/features/studio/hooks/use-selection.ts` (expose all new properties) |

---

## 7. Phase 6: Component System

### Goal

Implement a real component system where:
1. **Create Component**: Mark any object/frame as a reusable component
2. **Component Instances**: Duplicating a component creates linked instances
3. **Instance Overrides**: Instances can override specific properties (text, fill, etc.)
4. **Detach Instance**: Break the link, making the instance independent
5. **Edit Master**: Changes to the master propagate to all instances (unless overridden)

### Architecture

```typescript
// src/features/studio/fabric/component-system.ts — NEW

interface ComponentDefinition {
  id: string;             // Unique component ID (separate from object ID)
  name: string;
  sourceJson: string;     // Serialized master object
  overridableKeys: string[]; // Properties that instances can override
}

interface InstanceOverrides {
  [propertyPath: string]: unknown;
  // e.g., "children.0.text" → "New Title"
  // e.g., "fill" → "#ff0000"
}

// Store component definitions in a Map (serialized with canvas)
const componentRegistry = new Map<string, ComponentDefinition>();
```

### Custom Properties on Objects

```typescript
// On a master component:
(obj as any).isComponentMaster = true;
(obj as any).componentId = "comp-123";

// On an instance:
(obj as any).isComponentInstance = true;
(obj as any).componentId = "comp-123";  // Links to master
(obj as any).instanceOverrides = { fill: "#ff0000" };
```

### Component Operations

**Create Component:**
```typescript
function createComponent(canvas: Canvas, obj: FabricObject) {
  const compId = `comp-${Date.now()}`;
  const definition: ComponentDefinition = {
    id: compId,
    name: (obj as any).name ?? "Component",
    sourceJson: JSON.stringify(obj.toObject()),
    overridableKeys: ["fill", "stroke", "text", "content", "opacity"],
  };
  componentRegistry.set(compId, definition);

  (obj as any).isComponentMaster = true;
  (obj as any).componentId = compId;
  (obj as any).isComponent = true;
}
```

**Create Instance:**
```typescript
function createInstance(canvas: Canvas, componentId: string, position: { x: number; y: number }) {
  const def = componentRegistry.get(componentId);
  if (!def) return;

  // Deserialize from master JSON
  fabric.util.enlivenObjects([JSON.parse(def.sourceJson)]).then(([obj]) => {
    (obj as any).isComponentInstance = true;
    (obj as any).componentId = componentId;
    (obj as any).instanceOverrides = {};
    obj.set({ left: position.x, top: position.y });
    canvas.add(obj);
  });
}
```

**Detach Instance:**
```typescript
function detachInstance(obj: FabricObject) {
  delete (obj as any).isComponentInstance;
  delete (obj as any).componentId;
  delete (obj as any).instanceOverrides;
  (obj as any).isComponent = false;
}
```

**Propagate Master Changes:**
```typescript
function updateMasterComponent(canvas: Canvas, master: FabricObject) {
  const compId = (master as any).componentId;
  const def = componentRegistry.get(compId);
  if (!def) return;

  // Update definition
  def.sourceJson = JSON.stringify(master.toObject());

  // Find all instances and update non-overridden properties
  for (const obj of canvas.getObjects()) {
    if ((obj as any).componentId !== compId) continue;
    if (!(obj as any).isComponentInstance) continue;

    const overrides = (obj as any).instanceOverrides ?? {};
    const masterProps = JSON.parse(def.sourceJson);

    // Apply master properties that aren't overridden
    for (const [key, value] of Object.entries(masterProps)) {
      if (key in overrides) continue;
      if (key === "left" || key === "top") continue; // Don't move instances
      obj.set(key as string, value);
    }
    obj.setCoords();
  }
  canvas.requestRenderAll();
}
```

### Visual Differentiation

- **Master components**: Purple diamond icon, purple name in layers panel (already exists)
- **Instances**: Blue diamond icon, italic name
- **Override indicator**: Small orange dot next to overridden properties in the properties panel

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/fabric/component-system.ts` |
| **Modify** | `src/features/studio/components/studio-properties-panel.tsx` (component header) |
| **Modify** | `src/features/studio/components/studio-layer-item.tsx` (instance visual) |
| **Modify** | `src/features/studio/store/studio-store.ts` (component registry) |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (propagation handlers) |

---

## 8. Phase 7: New Shape Tools

> Carried forward from `plan-canvas-extensions.md` Phase A.

### New Shapes

| Shape | Fabric Class | Drawing Method | Shortcut |
|-------|-------------|----------------|----------|
| Triangle | `Triangle` | Drag to size | (menu) |
| Line | `Line` or `Path` | Click + drag endpoint | L |
| Arrow | `Path` (custom arrowhead) | Click + drag | A |
| Star (5-pointed) | `Polygon` (generated points) | Click to place | (menu) |
| Hexagon | `Polygon` (generated points) | Click to place | (menu) |
| Rounded Rect | `Rect` with `rx`/`ry` | Drag to size | (menu) |
| Image | `FabricImage` | File picker or drag-drop | (menu) |

### Updated ToolType

```typescript
export type ToolType =
  | "select" | "rectangle" | "ellipse" | "triangle"
  | "line" | "arrow" | "star" | "polygon"
  | "text" | "frame" | "hand" | "image" | "connector";
```

### Shape Menu Redesign

```
[Shapes ▾]
  ── Basic ──
  Rectangle    R
  Ellipse      O
  Triangle
  Rounded Rect
  ── Lines ──
  Line         L
  Arrow        A
  Connector    C
  ── Polygons ──
  Star
  Hexagon
  ── Media ──
  Image
```

### Helper Utilities (`src/features/studio/utils/shape-helpers.ts`) — NEW

```typescript
/** Generate SVG path for a line with arrowhead */
export function buildArrowPath(
  x1: number, y1: number,
  x2: number, y2: number,
  headLength?: number,
): string;

/** Generate star polygon points */
export function generateStarPoints(
  cx: number, cy: number,
  spikes: number, outerR: number, innerR: number,
): { x: number; y: number }[];

/** Generate regular polygon points */
export function generatePolygonPoints(
  cx: number, cy: number,
  sides: number, radius: number,
): { x: number; y: number }[];
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/utils/shape-helpers.ts` |
| **Modify** | `src/features/studio/types/index.ts` (extend ToolType, TOOL_CONFIGS) |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (drawing handlers) |
| **Modify** | `src/features/studio/components/studio-shape-menu.tsx` (expand menu) |
| **Modify** | `src/features/studio/hooks/use-tools.ts` (new tool shortcuts) |

---

## 9. Phase 8: Connectors & Arrows

> Carried forward from `plan-canvas-extensions.md` Phase B, with enhancements.

### Connector Types

| Type | Path | Use Case |
|------|------|----------|
| Straight | `M x1 y1 L x2 y2` + arrowhead | Simple connections |
| Curved | `M x1 y1 C cx1 cy1 cx2 cy2 x2 y2` | Flowing diagrams |
| Elbow | `M x1 y1 L mx y1 L mx y2 L x2 y2` | Flowcharts, ER diagrams |

### Connection Port System

Instead of center-to-center connections, support 4 anchor ports per object:

```typescript
interface ConnectionPort {
  side: "top" | "right" | "bottom" | "left";
  x: number; // Relative to object center
  y: number;
}

function getConnectionPorts(obj: FabricObject): ConnectionPort[] {
  const bounds = obj.getBoundingRect();
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  return [
    { side: "top",    x: cx, y: bounds.top },
    { side: "right",  x: bounds.left + bounds.width, y: cy },
    { side: "bottom", x: cx, y: bounds.top + bounds.height },
    { side: "left",   x: bounds.left, y: cy },
  ];
}
```

When dragging a connector, snap to the nearest port of the target object. Show port indicators (small circles) when hovering near a connectable object.

### Connector Tool UX

1. Select Connector tool (C)
2. Hover over an object — port indicators appear
3. Click a port on source object
4. Drag — rubber-band preview follows cursor, snapping to target ports
5. Release on target port — creates connector with `sourceId`, `targetId`, `sourcePort`, `targetPort`
6. Release on empty space — creates static arrow

### Auto-Update

```typescript
canvas.on("object:moving", (e) => {
  const movedId = (e.target as any).id;
  // Find all connectors referencing this object
  // Recalculate path using port positions
  // Update connector Path data
});
```

### Files

| Action | File |
|--------|------|
| **New** | `src/features/studio/utils/connector-helpers.ts` |
| **New** | `src/features/studio/utils/connection-ports.ts` |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (connector tool) |
| **Modify** | `src/features/studio/types/index.ts` (ConnectorProps) |

---

## 10. Phase 9: Canvas Shortcuts & Interactions

> Carried forward from `plan-canvas-extensions.md` Phase D.

### New Keyboard Shortcuts

| Shortcut | Action | Implementation |
|----------|--------|----------------|
| `Cmd+A` | Select all | `ActiveSelection` from all root objects |
| `Cmd+D` | Duplicate | Clone with +10px offset |
| `Cmd+G` | Group | Wrap in `Group` (reassign gallery to `Cmd+Shift+E`) |
| `Cmd+Shift+G` | Ungroup | Extract from Group |
| `Cmd+]` | Bring forward | `canvas.bringObjectForward(obj)` |
| `Cmd+[` | Send backward | `canvas.sendObjectBackwards(obj)` |
| `Cmd+Shift+]` | Bring to front | `canvas.bringObjectToFront(obj)` |
| `Cmd+Shift+[` | Send to back | `canvas.sendObjectToBack(obj)` |
| Arrow keys | Nudge 1px | `obj.set({ left: obj.left + dx })` |
| Shift+Arrow | Nudge 10px | 10px step |
| `Cmd+0` | Zoom to fit | Calculate viewport to fit all objects |
| `Cmd+1` | Zoom to 100% | Reset viewport transform |
| `Cmd+=` | Zoom in | 1.25x multiplier |
| `Cmd+-` | Zoom out | 0.8x multiplier |
| `Cmd+Shift+K` | Toggle AI chat | (currently Cmd+J) |
| `Cmd+Enter` | Create component | From selected object |

### Image Drag-and-Drop

```typescript
// On canvas container <div>:
onDragOver: prevent default, set dropEffect "copy"
onDrop: read image files, create FabricImage at drop point
```

Supported formats: PNG, JPG, SVG, WebP, GIF

### Double-Click Behavior

| Target | Action |
|--------|--------|
| Text object | Enter text editing mode (existing) |
| PigmentFrame | Enter frame (select children directly) |
| Component instance | Enter component (edit override context) |
| Polygon/Path | Enter point editing mode (Phase 10) |

### Right-Click Context Menu Expansion

```
Duplicate           Cmd+D
Copy                Cmd+C
Paste               Cmd+V
─────────────────────────
Create Component    Cmd+Shift+K
Detach Instance     (only on instances)
─────────────────────────
Bring to Front      Cmd+Shift+]
Bring Forward       Cmd+]
Send Backward       Cmd+[
Send to Back        Cmd+Shift+[
─────────────────────────
Group               Cmd+G
Ungroup             Cmd+Shift+G
─────────────────────────
Lock / Unlock
Hide / Show
─────────────────────────
Delete              ⌫
```

### Files

| Action | File |
|--------|------|
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (shortcuts, drag-drop, context menu) |
| **Modify** | `src/hooks/use-hotkeys.ts` (reassign conflicting shortcuts) |
| **Modify** | `src/app.tsx` (gallery hotkey change) |

---

## 11. Phase 10: Point Editing

> Carried forward from `plan-canvas-extensions.md` Phase E.

### Concept

Double-click a Polygon, Polyline, or Path to enter **point editing mode**:
- Blue circle control points at each vertex
- Drag to reposition vertices
- Double-click on a segment to add a new point
- Right-click a point to delete it
- Click away or press Escape to exit

### Implementation

Uses Fabric v7's `Control` class for dynamic per-vertex controls:

```typescript
// src/features/studio/utils/point-editing.ts — NEW

export function enterPointEditingMode(canvas: Canvas, target: Polygon | Polyline) {
  const points = target.points;
  points.forEach((point, index) => {
    target.controls[`p${index}`] = new Control({
      positionHandler: () => new Point(
        point.x - target.pathOffset.x,
        point.y - target.pathOffset.y,
      ),
      actionHandler: (_eventData, _transform, x, y) => {
        points[index] = {
          x: x + target.pathOffset.x,
          y: y + target.pathOffset.y,
        };
        target.dirty = true;
        canvas.requestRenderAll();
        return true;
      },
      render: (ctx, left, top) => {
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

## 12. File Map

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `src/features/studio/fabric/PigmentFrame.ts` | 1 | Frame as Group with LayoutManager |
| `src/features/studio/fabric/FlexLayoutStrategy.ts` | 2 | Custom flex layout for Fabric.js v7 |
| `src/features/studio/fabric/component-system.ts` | 6 | Component definitions, instances, overrides |
| `src/features/studio/utils/frame-migration.ts` | 1 | Migrate old Rect frames to PigmentFrame |
| `src/features/studio/utils/hover-overlay.ts` | 3 | Hover inspection rendering |
| `src/features/studio/utils/flex-reorder.ts` | 4 | Drag reordering within auto-layout |
| `src/features/studio/utils/shape-helpers.ts` | 7 | Star/polygon/arrow point generators |
| `src/features/studio/utils/connector-helpers.ts` | 8 | Connector path builders |
| `src/features/studio/utils/connection-ports.ts` | 8 | Port system for connectors |
| `src/features/studio/utils/point-editing.ts` | 10 | Polygon vertex editing |
| `src/features/studio/components/properties/layout-section.tsx` | 5 | Flex layout controls |
| `src/features/studio/components/properties/alignment-section.tsx` | 5 | Alignment buttons |
| `src/features/studio/components/properties/dimensions-section.tsx` | 5 | W/H/Fill/Hug controls |
| `src/features/studio/components/properties/appearance-section.tsx` | 5 | Opacity/blend/radius |
| `src/features/studio/components/properties/fill-section.tsx` | 5 | Fill with gradients |
| `src/features/studio/components/properties/stroke-section.tsx` | 5 | Advanced stroke |
| `src/features/studio/components/properties/effects-section.tsx` | 5 | Shadows, blur |
| `src/features/studio/components/properties/typography-section.tsx` | 5 | Font, decoration |
| `src/features/studio/components/properties/context-section.tsx` | 5 | AI context text |
| `src/features/studio/components/properties/alignment-grid.tsx` | 5 | 3x3 alignment matrix |
| `src/components/ui/slider.tsx` | 5 | shadcn slider |
| `src/components/ui/select.tsx` | 5 | shadcn select |
| `src/components/ui/switch.tsx` | 5 | shadcn switch |

### Modified Files

| File | Phases | Changes |
|------|--------|---------|
| `studio-canvas.tsx` | 1,2,3,4,7,8,9,10 | Frame creation, overlay, drag reorder, shapes, connectors, shortcuts |
| `studio-properties-panel.tsx` | 5,6 | Complete rewrite with sections |
| `studio-store.ts` | 1,6 | New extraction logic, component registry |
| `types/index.ts` | 1,7,8 | Extend ToolType, StudioObject, ConnectorProps |
| `use-selection.ts` | 2,5 | Expose layout + all new properties |
| `frame-helpers.ts` | 1 | Rewrite for PigmentFrame |
| `studio-shape-menu.tsx` | 7 | Expanded categorized menu |
| `studio-layer-item.tsx` | 6 | Component instance visuals |
| `use-hotkeys.ts` | 9 | New shortcuts |
| `use-tools.ts` | 7 | New tool handlers |
| `app.tsx` | 9 | Gallery hotkey reassignment |
| `use-layers.ts` | 1 | Group-based tree building |

---

## 13. Verification

### Phase 1: Frame System
- [ ] Create a frame on canvas → renders as PigmentFrame Group
- [ ] Drag a rectangle into frame → auto-parents as child
- [ ] Move frame → children move with it
- [ ] Resize frame → clip path updates
- [ ] Old canvas JSON loads correctly (migration runs)
- [ ] Layer tree shows frame > child hierarchy

### Phase 2: Auto-Layout
- [ ] Select frame → switch to Flex layout in properties
- [ ] Set direction to "row" → children arrange horizontally
- [ ] Change gap to 12 → spacing updates live
- [ ] Change alignment via 3x3 grid → children reposition
- [ ] Toggle "Hug Height" → frame shrinks to content
- [ ] Add new child → layout recalculates

### Phase 3: Hover Inspection
- [ ] Hover over object → blue dotted outline appears
- [ ] Hover over frame → child outlines shown
- [ ] Select object A, hover object B → spacing measurement shown
- [ ] Name + dimensions tooltip appears above hovered element

### Phase 4: Drag Reordering
- [ ] In a vertical flex frame, drag second item above first → items swap
- [ ] Drop indicator line shown during drag
- [ ] Layout recalculates smoothly after drop

### Phase 5: Properties Panel
- [ ] Select rectangle → shows Position, Dimensions, Appearance, Fill, Stroke
- [ ] Select frame → shows Layout section with flex controls
- [ ] Select text → shows Typography section
- [ ] Add shadow in Effects → visual shadow appears on canvas
- [ ] Change blend mode → compositing updates
- [ ] Gradient fill → gradient renders correctly

### Phase 6: Components
- [ ] Right-click → Create Component → purple diamond in layers
- [ ] Duplicate component → creates linked instance
- [ ] Change master fill → instance fill updates
- [ ] Override instance text → stays independent from master
- [ ] Detach Instance → becomes standalone object

### Phase 7: Shapes
- [ ] Each new shape tool draws correctly
- [ ] Arrow renders with arrowhead
- [ ] Star/Hexagon place at default size on click

### Phase 8: Connectors
- [ ] Connector tool shows port indicators on hover
- [ ] Draw connector between two objects → path renders
- [ ] Move source object → connector follows
- [ ] Delete connected object → connector removed

### Phase 9: Shortcuts
- [ ] Cmd+A selects all
- [ ] Cmd+D duplicates
- [ ] Cmd+G groups, Cmd+Shift+G ungroups
- [ ] Arrow keys nudge 1px, Shift+Arrow 10px
- [ ] Drag image from Finder → appears on canvas

### Phase 10: Point Editing
- [ ] Double-click polygon → vertex controls appear
- [ ] Drag vertex → polygon reshapes
- [ ] Press Escape → exits editing mode

### Build
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm lint` — no new errors
- [ ] `pnpm build` — succeeds
