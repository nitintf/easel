import {
  SceneGraph,
  computeLayout,
  computeAllLayouts,
  applyConstraints,
  UndoManager,
  TextEditor,
  exportFigFile,
  renderNodesToImage,
  readFigFile,
  parseFigmaClipboard,
  importClipboardNodes,
  figmaNodesBounds,
  parseOpenPencilClipboard,
  buildFigmaClipboardHTML,
  buildOpenPencilClipboardHTML,
  prefetchFigmaSchema,
  computeVectorBounds,
} from "@easel/editor-core";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import {
  DEFAULT_FILLS,
  DEFAULT_SHAPE_FILL,
  SECTION_DEFAULT_STROKE,
  PAGE_BG_COLOR,
  IS_TAURI,
  ZOOM_SENSITIVITY,
} from "../constants";

import type { Tool, PageViewport, PenState, LayoutInsertIndicator } from "../types";
import type {
  SceneNode,
  NodeType,
  LayoutMode,
  VectorNetwork,
  VectorRegion,
  SnapGuide,
  SkiaRenderer,
  ExportFormat,
  Rect,
  Color,
  CanvasKit,
  Variable,
  VariableCollection,
  VariableCollectionMode,
  VariableType,
  VariableValue,
} from "@easel/editor-core";

// ─── Module-level singletons (not in Zustand state) ────────────

let graph = new SceneGraph();
const undo = new UndoManager();
const pageViewports = new Map<string, PageViewport>();
let fileHandle: FileSystemFileHandle | null = null;
let filePath: string | null = null;
let downloadName: string | null = null;
let savedVersion = 0;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let lastWriteTime = 0;
let unwatchFile: (() => void) | null = null;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- CanvasKit re-exported from canvaskit-wasm via @easel/editor-core
let _ck: CanvasKit | null = null;
let _renderer: SkiaRenderer | null = null;
let _textEditor: TextEditor | null = null;

void prefetchFigmaSchema();

// ─── Accessors (available outside React components) ────────────

export function getGraph(): SceneGraph {
  return graph;
}
export function getRenderer(): SkiaRenderer | null {
  return _renderer;
}
export function getTextEditor(): TextEditor | null {
  return _textEditor;
}
export function getUndoManager(): UndoManager {
  return undo;
}
export function getFilePath(): string | null {
  return filePath;
}
export function getDocumentId(): string {
  return filePath ?? "default";
}
export function getVariables(): Map<string, Variable> {
  return graph.variables;
}
export function getCollections(): Map<string, VariableCollection> {
  return graph.variableCollections;
}

// ─── Zustand state interface ───────────────────────────────────

interface EditorState {
  activeTool: Tool;
  currentPageId: string;
  selectedIds: Set<string>;
  marquee: Rect | null;
  snapGuides: SnapGuide[];
  rotationPreview: { nodeId: string; angle: number } | null;
  dropTargetId: string | null;
  layoutInsertIndicator: LayoutInsertIndicator | null;
  hoveredNodeId: string | null;
  editingTextId: string | null;
  penState: PenState | null;
  penCursorX: number | null;
  penCursorY: number | null;
  vectorEditId: string | null;
  vectorEditSelectedVertex: number | null;
  showUI: boolean;
  showRightPanel: boolean;
  showAiChat: boolean;
  documentName: string;
  panX: number;
  panY: number;
  zoom: number;
  pageColor: Color;
  renderVersion: number;
  sceneVersion: number;
  variableVersion: number;

  actions: EditorActions;
}

interface EditorActions {
  // Render
  requestRender: () => void;
  requestRepaint: () => void;

  // Tools
  setTool: (tool: Tool) => void;

  // Selection
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Overlays
  setMarquee: (rect: Rect | null) => void;
  setSnapGuides: (guides: SnapGuide[]) => void;
  setRotationPreview: (preview: { nodeId: string; angle: number } | null) => void;
  setHoveredNode: (id: string | null) => void;
  setDropTarget: (id: string | null) => void;
  setLayoutInsertIndicator: (indicator: LayoutInsertIndicator | null) => void;

  // Pages
  switchPage: (pageId: string) => void;
  addPage: (name?: string) => string;
  deletePage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;

  // Node CRUD
  createShape: (
    type: NodeType,
    x: number,
    y: number,
    w: number,
    h: number,
    parentId?: string,
  ) => string;
  updateNode: (id: string, changes: Partial<SceneNode>) => void;
  updateNodeWithUndo: (id: string, changes: Partial<SceneNode>, label?: string) => void;
  deleteSelected: () => void;
  renameNode: (id: string, name: string) => void;

  // Layout
  setLayoutMode: (id: string, mode: LayoutMode) => void;
  wrapInAutoLayout: () => void;
  reorderInAutoLayout: (nodeId: string, parentId: string, insertIndex: number) => void;
  reparentNodes: (nodeIds: string[], newParentId: string) => void;

  // Group / Component
  groupSelected: () => void;
  ungroupSelected: () => void;
  createComponentFromSelection: () => void;
  createComponentSetFromComponents: () => void;
  createInstanceFromComponent: (componentId: string, x?: number, y?: number) => string | null;
  detachInstance: () => void;
  goToMainComponent: () => void;

  // Z-order
  bringToFront: () => void;
  bringForward: () => void;
  sendToBack: () => void;
  sendBackward: () => void;
  toggleVisibility: () => void;
  toggleLock: () => void;
  moveToPage: (pageId: string) => void;

  // Duplicate / Clipboard
  duplicateSelected: () => void;
  writeCopyData: (clipboardData: DataTransfer) => void;
  pasteFromHTML: (html: string) => void;

  // Vector editing
  enterVectorEdit: (nodeId: string) => void;
  exitVectorEdit: () => void;
  selectVectorVertex: (index: number | null) => void;
  deleteVectorVertex: (nodeId: string, vertexIndex: number) => void;

  // Pen tool
  penAddVertex: (x: number, y: number) => void;
  penSetDragTangent: (tx: number, ty: number) => void;
  penSetClosingToFirst: (closing: boolean) => void;
  penCommit: (closed: boolean) => void;
  penCancel: () => void;

  // Text editing
  startTextEditing: (nodeId: string) => void;
  commitTextEdit: () => void;

  // Sections
  adoptNodesIntoSection: (sectionId: string) => void;

  // Undo / Redo
  commitMove: (originals: Map<string, { x: number; y: number }>) => void;
  commitResize: (nodeId: string, origRect: Rect) => void;
  commitRotation: (nodeId: string, origRotation: number) => void;
  commitNodeUpdate: (nodeId: string, previous: Partial<SceneNode>, label?: string) => void;
  undoAction: () => void;
  redoAction: () => void;

  // Viewport
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
  applyZoom: (delta: number, centerX: number, centerY: number) => void;
  pan: (dx: number, dy: number) => void;
  zoomToFit: () => void;
  zoomToSelection: () => void;

  // File I/O
  setCanvasKit: (ck: CanvasKit, renderer: SkiaRenderer) => void;
  openFigFile: (file: File, handle?: FileSystemFileHandle, path?: string) => Promise<void>;
  saveFigFile: () => Promise<void>;
  saveFigFileAs: () => Promise<void>;
  renderExportImage: (nodeIds: string[], scale: number, format: ExportFormat) => Uint8Array | null;
  exportSelection: (scale: number, format: ExportFormat) => Promise<void>;

  // AI Chat
  toggleAiChat: () => void;

  // Variables / Design Tokens
  createCollection: (name: string) => VariableCollection;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  addCollectionMode: (collectionId: string, name: string) => VariableCollectionMode;
  removeCollectionMode: (collectionId: string, modeId: string) => void;
  renameCollectionMode: (collectionId: string, modeId: string, name: string) => void;
  createVariable: (
    name: string,
    type: VariableType,
    collectionId: string,
    value?: VariableValue,
  ) => Variable;
  deleteVariable: (id: string) => void;
  renameVariable: (id: string, name: string) => void;
  setVariableValue: (id: string, modeId: string, value: VariableValue) => void;
  setActiveMode: (collectionId: string, modeId: string) => void;
  bindVariable: (nodeId: string, field: string, variableId: string) => void;
  unbindVariable: (nodeId: string, field: string) => void;

  // Utility
  isTopLevel: (parentId: string | null) => boolean;
}

// ─── Helpers ───────────────────────────────────────────────────

function downloadBlob(data: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─── Store creation ────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => {
    // ── Internal helpers (captured in closure) ──────────────────

    function runLayoutForNode(id: string) {
      const node = graph.getNode(id);
      if (!node) return;
      if (node.layoutMode !== "NONE") {
        computeLayout(graph, id);
      }
      let parent = node.parentId ? graph.getNode(node.parentId) : undefined;
      while (parent) {
        if (parent.layoutMode !== "NONE") {
          computeLayout(graph, parent.id);
        }
        parent = parent.parentId ? graph.getNode(parent.parentId) : undefined;
      }
    }

    function syncIfInsideComponent(nodeId: string) {
      let current = graph.getNode(nodeId);
      while (current) {
        if (current.type === "COMPONENT") {
          graph.syncInstances(current.id);
          return;
        }
        current = current.parentId ? graph.getNode(current.parentId) : undefined;
      }
    }

    function isTopLevel(parentId: string | null): boolean {
      return !parentId || parentId === graph.rootId || parentId === get().currentPageId;
    }

    function requestRender() {
      set((s) => ({
        renderVersion: s.renderVersion + 1,
        sceneVersion: s.sceneVersion + 1,
      }));
    }

    function requestRepaint() {
      set((s) => ({ renderVersion: s.renderVersion + 1 }));
    }

    async function buildFigFile() {
      return exportFigFile(graph, _ck ?? undefined, _renderer ?? undefined, get().currentPageId);
    }

    async function writeFile(data: Uint8Array) {
      lastWriteTime = Date.now();
      if (filePath && IS_TAURI) {
        const { writeFile: tauriWrite } = await import("@tauri-apps/plugin-fs");
        await tauriWrite(filePath, data);
        savedVersion = get().sceneVersion;
        return;
      }
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(new Uint8Array(data));
        await writable.close();
        savedVersion = get().sceneVersion;
      }
    }

    const WATCH_DEBOUNCE_MS = 1000;

    async function reloadFromDisk() {
      const s = get();
      const viewport = { panX: s.panX, panY: s.panY, zoom: s.zoom };
      const pageId = s.currentPageId;

      if (filePath && IS_TAURI) {
        const { readFile: tauriRead } = await import("@tauri-apps/plugin-fs");
        const bytes = await tauriRead(filePath);
        const blob = new Blob([bytes]);
        const file = new File([blob], `${s.documentName}.fig`);
        const imported = await readFigFile(file);
        graph = imported;
        computeAllLayouts(graph);
      } else if (fileHandle) {
        const file = await fileHandle.getFile();
        const imported = await readFigFile(file);
        graph = imported;
        computeAllLayouts(graph);
      } else {
        return;
      }

      undo.clear();
      savedVersion = get().sceneVersion;
      set({
        selectedIds: new Set(),
        currentPageId: graph.getNode(pageId) ? pageId : (graph.getPages()[0]?.id ?? graph.rootId),
        panX: viewport.panX,
        panY: viewport.panY,
        zoom: viewport.zoom,
      });
      requestRender();
    }

    function stopWatchingFile() {
      if (unwatchFile) {
        unwatchFile();
        unwatchFile = null;
      }
    }

    async function startWatchingFile() {
      stopWatchingFile();

      if (filePath && IS_TAURI) {
        const { watch: tauriWatch } = await import("@tauri-apps/plugin-fs");
        const path = filePath;
        const unwatch = await tauriWatch(
          path,
          (event: { type: unknown }) => {
            if (
              typeof event.type !== "object" ||
              !(event.type && "modify" in (event.type as Record<string, unknown>))
            )
              return;
            if (Date.now() - lastWriteTime < WATCH_DEBOUNCE_MS) return;
            void reloadFromDisk();
          },
          { delayMs: 500 },
        );
        unwatchFile = () => unwatch();
      } else if (fileHandle) {
        let lastModified = (await fileHandle.getFile()).lastModified;
        const handle = fileHandle;
        const interval = setInterval(() => {
          void (async () => {
            try {
              const file = await handle.getFile();
              if (file.lastModified > lastModified) {
                lastModified = file.lastModified;
                if (Date.now() - lastWriteTime < WATCH_DEBOUNCE_MS) return;
                void reloadFromDisk();
              }
            } catch {
              clearInterval(interval);
            }
          })();
        }, 2000);
        unwatchFile = () => clearInterval(interval);
      }
    }

    function exportImageExtension(format: ExportFormat): string {
      switch (format) {
        case "PNG":
          return ".png";
        case "JPG":
          return ".jpg";
        case "WEBP":
          return ".webp";
      }
    }

    function exportImageMime(format: ExportFormat): string {
      switch (format) {
        case "PNG":
          return "image/png";
        case "JPG":
          return "image/jpeg";
        case "WEBP":
          return "image/webp";
      }
    }

    function collectSubtrees(g: SceneGraph, rootIds: string[]): SceneNode[] {
      const result: SceneNode[] = [];
      function walk(id: string) {
        const node = g.getNode(id);
        if (!node) return;
        result.push({ ...node });
        for (const childId of node.childIds) walk(childId);
      }
      for (const id of rootIds) walk(id);
      return result;
    }

    // ── Initial state ──────────────────────────────────────────

    const firstPage = graph.getPages()[0];

    return {
      activeTool: "SELECT" as Tool,
      currentPageId: firstPage.id,
      selectedIds: new Set<string>(),
      marquee: null,
      snapGuides: [],
      rotationPreview: null,
      dropTargetId: null,
      layoutInsertIndicator: null,
      hoveredNodeId: null,
      editingTextId: null,
      penState: null,
      penCursorX: null,
      penCursorY: null,
      vectorEditId: null,
      vectorEditSelectedVertex: null,
      showUI: typeof matchMedia !== "undefined" ? matchMedia("(min-width: 768px)").matches : true,
      showRightPanel: true,
      showAiChat: false,
      documentName: "Untitled",
      panX: 0,
      panY: 0,
      zoom: 1,
      pageColor: { ...PAGE_BG_COLOR },
      renderVersion: 0,
      sceneVersion: 0,
      variableVersion: 0,

      actions: {
        requestRender,
        requestRepaint,

        setTool(tool: Tool) {
          set({ activeTool: tool });
        },

        select(ids: string[], additive = false) {
          if (additive) {
            const next = new Set(get().selectedIds);
            for (const id of ids) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            }
            set({ selectedIds: next });
          } else {
            set({ selectedIds: new Set(ids) });
          }
        },

        clearSelection() {
          set({ selectedIds: new Set() });
        },

        selectAll() {
          const children = graph.getChildren(get().currentPageId);
          set({ selectedIds: new Set(children.map((n) => n.id)) });
        },

        setMarquee(rect: Rect | null) {
          set({ marquee: rect });
          requestRepaint();
        },

        setSnapGuides(guides: SnapGuide[]) {
          set({ snapGuides: guides });
          requestRepaint();
        },

        setRotationPreview(preview: { nodeId: string; angle: number } | null) {
          set({ rotationPreview: preview });
          requestRepaint();
        },

        setHoveredNode(id: string | null) {
          if (get().hoveredNodeId === id) return;
          set({ hoveredNodeId: id });
          requestRepaint();
        },

        setDropTarget(id: string | null) {
          set({ dropTargetId: id });
          requestRepaint();
        },

        setLayoutInsertIndicator(indicator: LayoutInsertIndicator | null) {
          set({ layoutInsertIndicator: indicator });
          requestRepaint();
        },

        switchPage(pageId: string) {
          const page = graph.getNode(pageId);
          if (page?.type !== "CANVAS") return;
          const s = get();
          pageViewports.set(s.currentPageId, {
            panX: s.panX,
            panY: s.panY,
            zoom: s.zoom,
            pageColor: { ...s.pageColor },
          });
          const vp = pageViewports.get(pageId);
          set({
            currentPageId: pageId,
            selectedIds: new Set(),
            panX: vp?.panX ?? 0,
            panY: vp?.panY ?? 0,
            zoom: vp?.zoom ?? 1,
            pageColor: vp ? { ...vp.pageColor } : { ...PAGE_BG_COLOR },
          });
          requestRender();
        },

        addPage(name?: string) {
          const pages = graph.getPages();
          const pageName = name ?? `Page ${pages.length + 1}`;
          const page = graph.addPage(pageName);
          get().actions.switchPage(page.id);
          return page.id;
        },

        deletePage(pageId: string) {
          const pages = graph.getPages();
          if (pages.length <= 1) return;
          const idx = pages.findIndex((p) => p.id === pageId);
          graph.deleteNode(pageId);
          pageViewports.delete(pageId);
          if (get().currentPageId === pageId) {
            const newIdx = Math.min(idx, pages.length - 2);
            const remaining = graph.getPages();
            get().actions.switchPage(remaining[newIdx].id);
          }
          requestRender();
        },

        renamePage(pageId: string, name: string) {
          graph.updateNode(pageId, { name });
          requestRender();
        },

        createShape(type: NodeType, x: number, y: number, w: number, h: number, parentId?: string) {
          const fill = DEFAULT_FILLS[type] ?? DEFAULT_FILLS.RECTANGLE;
          const pid = parentId ?? get().currentPageId;
          const overrides: Partial<SceneNode> = {
            x,
            y,
            width: w,
            height: h,
            fills: [{ ...fill }],
          };
          if (type === "SECTION") {
            overrides.strokes = [{ ...SECTION_DEFAULT_STROKE }];
            overrides.cornerRadius = 5;
          }
          if (type === "POLYGON") overrides.pointCount = 3;
          if (type === "STAR") {
            overrides.pointCount = 5;
            overrides.starInnerRadius = 0.38;
          }
          const node = graph.createNode(type, pid, overrides);
          const id = node.id;
          const snapshot = { ...node };
          undo.push({
            label: `Create ${type.toLowerCase()}`,
            forward: () => {
              graph.createNode(snapshot.type, pid, snapshot);
              requestRender();
            },
            inverse: () => {
              graph.deleteNode(id);
              const next = new Set(get().selectedIds);
              next.delete(id);
              set({ selectedIds: next });
              requestRender();
            },
          });
          requestRender();
          return id;
        },

        updateNode(id: string, changes: Partial<SceneNode>) {
          graph.updateNode(id, changes);
          if ("vectorNetwork" in changes) {
            _renderer?.invalidateVectorPath(id);
          }
          runLayoutForNode(id);
          syncIfInsideComponent(id);
          requestRender();
        },

        updateNodeWithUndo(id: string, changes: Partial<SceneNode>, label = "Update") {
          const node = graph.getNode(id);
          if (!node) return;
          const previous: Partial<SceneNode> = {};
          for (const key of Object.keys(changes) as (keyof SceneNode)[]) {
            (previous as Record<string, unknown>)[key] = node[key];
          }
          graph.updateNode(id, changes);
          runLayoutForNode(id);
          syncIfInsideComponent(id);
          undo.push({
            label,
            forward: () => {
              graph.updateNode(id, changes);
              runLayoutForNode(id);
              syncIfInsideComponent(id);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(id, previous);
              runLayoutForNode(id);
              syncIfInsideComponent(id);
              requestRender();
            },
          });
          requestRender();
        },

        deleteSelected() {
          const s = get();
          const entries: { id: string; parentId: string; snapshot: SceneNode; index: number }[] =
            [];
          for (const id of s.selectedIds) {
            const node = graph.getNode(id);
            if (!node) continue;
            const parentId = node.parentId ?? s.currentPageId;
            const parent = graph.getNode(parentId);
            const index = parent?.childIds.indexOf(id) ?? -1;
            entries.push({ id, parentId, snapshot: { ...node }, index });
          }
          if (entries.length === 0) return;

          const prevSelection = new Set(s.selectedIds);
          for (const { id } of entries) graph.deleteNode(id);

          undo.push({
            label: "Delete",
            forward: () => {
              for (const { id } of entries) graph.deleteNode(id);
              set({ selectedIds: new Set() });
              requestRender();
            },
            inverse: () => {
              for (const { snapshot, parentId, index } of [...entries].reverse()) {
                graph.createNode(snapshot.type, parentId, snapshot);
                if (index >= 0) graph.reorderChild(snapshot.id, parentId, index);
              }
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          set({ selectedIds: new Set() });
          requestRender();
        },

        renameNode(id: string, name: string) {
          graph.updateNode(id, { name });
          requestRender();
        },

        setLayoutMode(id: string, mode: LayoutMode) {
          const node = graph.getNode(id);
          if (!node) return;

          const previous: Partial<SceneNode> = {
            layoutMode: node.layoutMode,
            itemSpacing: node.itemSpacing,
            paddingTop: node.paddingTop,
            paddingRight: node.paddingRight,
            paddingBottom: node.paddingBottom,
            paddingLeft: node.paddingLeft,
            primaryAxisSizing: node.primaryAxisSizing,
            counterAxisSizing: node.counterAxisSizing,
            primaryAxisAlign: node.primaryAxisAlign,
            counterAxisAlign: node.counterAxisAlign,
            width: node.width,
            height: node.height,
          };

          const updates: Partial<SceneNode> = { layoutMode: mode };
          if (mode !== "NONE" && node.layoutMode === "NONE") {
            updates.itemSpacing = 0;
            updates.paddingTop = 0;
            updates.paddingRight = 0;
            updates.paddingBottom = 0;
            updates.paddingLeft = 0;
            updates.primaryAxisSizing = "HUG";
            updates.counterAxisSizing = "HUG";
            updates.primaryAxisAlign = "MIN";
            updates.counterAxisAlign = "MIN";
          }

          graph.updateNode(id, updates);
          if (mode !== "NONE") computeLayout(graph, id);
          runLayoutForNode(id);

          const updated = graph.getNode(id);
          if (!updated) return;
          const finalState: Partial<SceneNode> = {};
          for (const key of Object.keys(previous) as (keyof SceneNode)[]) {
            (finalState as Record<string, unknown>)[key] = updated[key];
          }

          undo.push({
            label: mode === "NONE" ? "Remove auto layout" : "Add auto layout",
            forward: () => {
              graph.updateNode(id, finalState);
              if (mode !== "NONE") computeLayout(graph, id);
              runLayoutForNode(id);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(id, previous);
              runLayoutForNode(id);
              requestRender();
            },
          });
          requestRender();
        },

        wrapInAutoLayout() {
          const s = get();
          const nodes: SceneNode[] = [];
          for (const id of s.selectedIds) {
            const n = graph.getNode(id);
            if (n) nodes.push({ ...n });
          }
          if (nodes.length === 0) return;

          const parentId = nodes[0].parentId ?? s.currentPageId;
          const sameParent = nodes.every((n) => (n.parentId ?? s.currentPageId) === parentId);
          if (!sameParent) return;

          const prevSelection = new Set(s.selectedIds);
          const origPositions = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, parentId }));

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            const abs = graph.getAbsolutePosition(n.id);
            minX = Math.min(minX, abs.x);
            minY = Math.min(minY, abs.y);
            maxX = Math.max(maxX, abs.x + n.width);
            maxY = Math.max(maxY, abs.y + n.height);
          }

          const parentAbs = isTopLevel(parentId)
            ? { x: 0, y: 0 }
            : graph.getAbsolutePosition(parentId);

          const frame = graph.createNode("FRAME", parentId, {
            name: "Frame",
            x: minX - parentAbs.x,
            y: minY - parentAbs.y,
            width: maxX - minX,
            height: maxY - minY,
            layoutMode: "VERTICAL",
            primaryAxisSizing: "HUG",
            counterAxisSizing: "HUG",
            primaryAxisAlign: "MIN",
            counterAxisAlign: "MIN",
            fills: [
              { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true },
            ],
          });
          const frameId = frame.id;

          const sortedIds = nodes
            .map((n) => ({ id: n.id, pos: graph.getAbsolutePosition(n.id) }))
            .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
            .map((n) => n.id);

          for (const id of sortedIds) graph.reparentNode(id, frameId);
          computeLayout(graph, frameId);
          runLayoutForNode(frameId);
          set({ selectedIds: new Set([frameId]) });

          undo.push({
            label: "Wrap in auto layout",
            forward: () => {
              const f = graph.createNode("FRAME", parentId, { ...frame });
              for (const n of origPositions) graph.reparentNode(n.id, f.id);
              computeLayout(graph, f.id);
              runLayoutForNode(f.id);
              set({ selectedIds: new Set([f.id]) });
              requestRender();
            },
            inverse: () => {
              for (const orig of origPositions) {
                graph.reparentNode(orig.id, orig.parentId);
                graph.updateNode(orig.id, { x: orig.x, y: orig.y });
              }
              graph.deleteNode(frameId);
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          requestRender();
        },

        reorderInAutoLayout(nodeId: string, parentId: string, insertIndex: number) {
          const parent = graph.getNode(parentId);
          if (!parent || parent.layoutMode === "NONE") return;
          const node = graph.getNode(nodeId);
          if (!node) return;
          if (node.parentId !== parentId) {
            const absPos = graph.getAbsolutePosition(nodeId);
            const parentAbs = graph.getAbsolutePosition(parentId);
            graph.updateNode(nodeId, { x: absPos.x - parentAbs.x, y: absPos.y - parentAbs.y });
          }
          graph.reorderChild(nodeId, parentId, insertIndex);
          computeLayout(graph, parentId);
          runLayoutForNode(parentId);
          requestRender();
        },

        reparentNodes(nodeIds: string[], newParentId: string) {
          const parent = graph.getNode(newParentId);
          for (const id of nodeIds) {
            const node = graph.getNode(id);
            if (
              node?.type === "SECTION" &&
              parent &&
              parent.type !== "CANVAS" &&
              parent.type !== "SECTION"
            )
              continue;
            graph.reparentNode(id, newParentId);
          }
          requestRender();
        },

        groupSelected() {
          const s = get();
          const nodes: SceneNode[] = [];
          for (const id of s.selectedIds) {
            const n = graph.getNode(id);
            if (n) nodes.push({ ...n });
          }
          if (nodes.length === 0) return;

          const parentId = nodes[0].parentId ?? s.currentPageId;
          const sameParent = nodes.every((n) => (n.parentId ?? s.currentPageId) === parentId);
          if (!sameParent) return;

          const parent = graph.getNode(parentId);
          if (!parent) return;

          const prevSelection = new Set(s.selectedIds);
          const nodeIds = nodes.map((n) => n.id);
          const origPositions = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            const abs = graph.getAbsolutePosition(n.id);
            minX = Math.min(minX, abs.x);
            minY = Math.min(minY, abs.y);
            maxX = Math.max(maxX, abs.x + n.width);
            maxY = Math.max(maxY, abs.y + n.height);
          }

          const parentAbs = isTopLevel(parentId)
            ? { x: 0, y: 0 }
            : graph.getAbsolutePosition(parentId);
          const firstIndex = Math.min(...nodeIds.map((id) => parent.childIds.indexOf(id)));

          const group = graph.createNode("GROUP", parentId, {
            name: "Group",
            x: minX - parentAbs.x,
            y: minY - parentAbs.y,
            width: maxX - minX,
            height: maxY - minY,
            fills: [],
          });
          const groupId = group.id;

          parent.childIds = parent.childIds.filter((id) => id !== groupId);
          parent.childIds.splice(firstIndex, 0, groupId);

          for (const n of nodes) graph.reparentNode(n.id, groupId);
          set({ selectedIds: new Set([groupId]) });

          undo.push({
            label: "Group",
            forward: () => {
              const g = graph.createNode("GROUP", parentId, { ...group });
              parent.childIds = parent.childIds.filter((id) => id !== g.id);
              parent.childIds.splice(firstIndex, 0, g.id);
              for (const n of origPositions) graph.reparentNode(n.id, g.id);
              set({ selectedIds: new Set([g.id]) });
              requestRender();
            },
            inverse: () => {
              for (const orig of origPositions) {
                graph.reparentNode(orig.id, parentId);
                graph.updateNode(orig.id, { x: orig.x, y: orig.y });
              }
              graph.deleteNode(groupId);
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          requestRender();
        },

        ungroupSelected() {
          const s = get();
          if (s.selectedIds.size !== 1) return;
          const nodeId = [...s.selectedIds][0];
          const node = graph.getNode(nodeId);
          if (node?.type !== "GROUP") return;

          const parentId = node.parentId ?? s.currentPageId;
          const parent = graph.getNode(parentId);
          if (!parent) return;

          const groupIndex = parent.childIds.indexOf(node.id);
          const childIds = [...node.childIds];
          const prevSelection = new Set(s.selectedIds);
          const origPositions = childIds.map((id) => {
            const child = graph.getNode(id);
            return { id, x: child?.x ?? 0, y: child?.y ?? 0 };
          });

          for (let i = 0; i < childIds.length; i++) {
            graph.reparentNode(childIds[i], parentId);
            parent.childIds = parent.childIds.filter((id) => id !== childIds[i]);
            parent.childIds.splice(groupIndex + i, 0, childIds[i]);
          }
          graph.deleteNode(node.id);
          set({ selectedIds: new Set(childIds) });

          undo.push({
            label: "Ungroup",
            forward: () => {
              for (let i = 0; i < childIds.length; i++) {
                graph.reparentNode(childIds[i], parentId);
                parent.childIds = parent.childIds.filter((id) => id !== childIds[i]);
                parent.childIds.splice(groupIndex + i, 0, childIds[i]);
              }
              graph.deleteNode(node.id);
              set({ selectedIds: new Set(childIds) });
              requestRender();
            },
            inverse: () => {
              const g = graph.createNode("GROUP", parentId, { ...node, childIds: [] });
              parent.childIds = parent.childIds.filter((id) => id !== g.id);
              parent.childIds.splice(groupIndex, 0, g.id);
              for (const orig of origPositions) {
                graph.reparentNode(orig.id, g.id);
                graph.updateNode(orig.id, { x: orig.x, y: orig.y });
              }
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          requestRender();
        },

        createComponentFromSelection() {
          const s = get();
          const nodes: SceneNode[] = [];
          for (const id of s.selectedIds) {
            const n = graph.getNode(id);
            if (n) nodes.push({ ...n });
          }
          if (nodes.length === 0) return;

          const prevSelection = new Set(s.selectedIds);

          if (nodes.length === 1) {
            const node = nodes[0];
            if (node.type === "COMPONENT") return;
            if (node.type === "FRAME" || node.type === "GROUP") {
              const prevType = node.type;
              graph.updateNode(node.id, { type: "COMPONENT" });
              set({ selectedIds: new Set([node.id]) });
              undo.push({
                label: "Create component",
                forward: () => {
                  graph.updateNode(node.id, { type: "COMPONENT" });
                  set({ selectedIds: new Set([node.id]) });
                  requestRender();
                },
                inverse: () => {
                  graph.updateNode(node.id, { type: prevType });
                  set({ selectedIds: prevSelection });
                  requestRender();
                },
              });
              requestRender();
              return;
            }
          }

          const parentId = nodes[0].parentId ?? s.currentPageId;
          const sameParent = nodes.every((n) => (n.parentId ?? s.currentPageId) === parentId);
          if (!sameParent) return;
          const parent = graph.getNode(parentId);
          if (!parent) return;

          const nodeIds = nodes.map((n) => n.id);
          const origPositions = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            const abs = graph.getAbsolutePosition(n.id);
            minX = Math.min(minX, abs.x);
            minY = Math.min(minY, abs.y);
            maxX = Math.max(maxX, abs.x + n.width);
            maxY = Math.max(maxY, abs.y + n.height);
          }
          const parentAbs = isTopLevel(parentId)
            ? { x: 0, y: 0 }
            : graph.getAbsolutePosition(parentId);
          const firstIndex = Math.min(...nodeIds.map((id) => parent.childIds.indexOf(id)));

          const component = graph.createNode("COMPONENT", parentId, {
            name: "Component",
            x: minX - parentAbs.x,
            y: minY - parentAbs.y,
            width: maxX - minX,
            height: maxY - minY,
            fills: [],
          });
          const componentId = component.id;
          parent.childIds = parent.childIds.filter((id) => id !== componentId);
          parent.childIds.splice(firstIndex, 0, componentId);
          for (const n of nodes) graph.reparentNode(n.id, componentId);
          set({ selectedIds: new Set([componentId]) });

          undo.push({
            label: "Create component",
            forward: () => {
              const c = graph.createNode("COMPONENT", parentId, { ...component });
              parent.childIds = parent.childIds.filter((id) => id !== c.id);
              parent.childIds.splice(firstIndex, 0, c.id);
              for (const n of origPositions) graph.reparentNode(n.id, c.id);
              set({ selectedIds: new Set([c.id]) });
              requestRender();
            },
            inverse: () => {
              for (const orig of origPositions) {
                graph.reparentNode(orig.id, parentId);
                graph.updateNode(orig.id, { x: orig.x, y: orig.y });
              }
              graph.deleteNode(componentId);
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          requestRender();
        },

        createComponentSetFromComponents() {
          const s = get();
          const nodes: SceneNode[] = [];
          for (const id of s.selectedIds) {
            const n = graph.getNode(id);
            if (n) nodes.push({ ...n });
          }
          if (nodes.length < 2 || !nodes.every((n) => n.type === "COMPONENT")) return;

          const parentId = nodes[0].parentId ?? s.currentPageId;
          const sameParent = nodes.every((n) => (n.parentId ?? s.currentPageId) === parentId);
          if (!sameParent) return;
          const parent = graph.getNode(parentId);
          if (!parent) return;

          const prevSelection = new Set(s.selectedIds);
          const nodeIds = nodes.map((n) => n.id);
          const origPositions = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            const abs = graph.getAbsolutePosition(n.id);
            minX = Math.min(minX, abs.x);
            minY = Math.min(minY, abs.y);
            maxX = Math.max(maxX, abs.x + n.width);
            maxY = Math.max(maxY, abs.y + n.height);
          }

          const padding = 40;
          const parentAbs = isTopLevel(parentId)
            ? { x: 0, y: 0 }
            : graph.getAbsolutePosition(parentId);
          const firstIndex = Math.min(...nodeIds.map((id) => parent.childIds.indexOf(id)));

          const componentSet = graph.createNode("COMPONENT_SET", parentId, {
            name: nodes[0].name.split("/")[0]?.trim() || "Component Set",
            x: minX - parentAbs.x - padding,
            y: minY - parentAbs.y - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
            fills: [
              {
                type: "SOLID",
                color: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
                opacity: 1,
                visible: true,
              },
            ],
          });
          const setId = componentSet.id;
          parent.childIds = parent.childIds.filter((id) => id !== setId);
          parent.childIds.splice(firstIndex, 0, setId);
          for (const n of nodes) graph.reparentNode(n.id, setId);
          set({ selectedIds: new Set([setId]) });

          undo.push({
            label: "Create component set",
            forward: () => {
              const cs = graph.createNode("COMPONENT_SET", parentId, { ...componentSet });
              parent.childIds = parent.childIds.filter((id) => id !== cs.id);
              parent.childIds.splice(firstIndex, 0, cs.id);
              for (const n of origPositions) graph.reparentNode(n.id, cs.id);
              set({ selectedIds: new Set([cs.id]) });
              requestRender();
            },
            inverse: () => {
              for (const orig of origPositions) {
                graph.reparentNode(orig.id, parentId);
                graph.updateNode(orig.id, { x: orig.x, y: orig.y });
              }
              graph.deleteNode(setId);
              set({ selectedIds: prevSelection });
              requestRender();
            },
          });
          requestRender();
        },

        createInstanceFromComponent(componentId: string, x?: number, y?: number) {
          const component = graph.getNode(componentId);
          if (component?.type !== "COMPONENT") return null;
          const parentId = component.parentId ?? get().currentPageId;
          const instance = graph.createInstance(componentId, parentId, {
            x: x ?? component.x + component.width + 40,
            y: y ?? component.y,
          });
          if (!instance) return null;
          const instanceId = instance.id;
          set({ selectedIds: new Set([instanceId]) });
          undo.push({
            label: "Create instance",
            forward: () => {
              graph.createInstance(componentId, parentId, { ...instance });
              set({ selectedIds: new Set([instanceId]) });
              requestRender();
            },
            inverse: () => {
              graph.deleteNode(instanceId);
              set({ selectedIds: new Set([componentId]) });
              requestRender();
            },
          });
          requestRender();
          return instanceId;
        },

        detachInstance() {
          const s = get();
          if (s.selectedIds.size !== 1) return;
          const nodeId = [...s.selectedIds][0];
          const node = graph.getNode(nodeId);
          if (node?.type !== "INSTANCE") return;
          const prevComponentId = node.componentId;
          graph.detachInstance(node.id);
          set({ selectedIds: new Set([node.id]) });
          undo.push({
            label: "Detach instance",
            forward: () => {
              graph.detachInstance(node.id);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(node.id, {
                type: "INSTANCE",
                componentId: prevComponentId,
                overrides: {},
              });
              requestRender();
            },
          });
          requestRender();
        },

        goToMainComponent() {
          const s = get();
          if (s.selectedIds.size !== 1) return;
          const nodeId = [...s.selectedIds][0];
          const node = graph.getNode(nodeId);
          if (!node?.componentId) return;
          const main = graph.getMainComponent(nodeId);
          if (!main) return;
          let current: SceneNode | undefined = main;
          while (current && current.type !== "CANVAS") {
            current = current.parentId ? graph.getNode(current.parentId) : undefined;
          }
          if (current && current.id !== s.currentPageId) {
            get().actions.switchPage(current.id);
          }
          const abs = graph.getAbsolutePosition(main.id);
          const viewW = 800;
          const viewH = 600;
          set({
            selectedIds: new Set([main.id]),
            panX: viewW / 2 - (abs.x + main.width / 2) * s.zoom,
            panY: viewH / 2 - (abs.y + main.height / 2) * s.zoom,
          });
          requestRender();
        },

        bringToFront() {
          for (const id of get().selectedIds) {
            const node = graph.getNode(id);
            if (!node?.parentId) continue;
            const parent = graph.getNode(node.parentId);
            if (!parent) continue;
            if (parent.childIds.indexOf(id) === parent.childIds.length - 1) continue;
            parent.childIds = parent.childIds.filter((cid) => cid !== id);
            parent.childIds.push(id);
          }
          requestRender();
        },

        bringForward() {
          for (const id of get().selectedIds) {
            const node = graph.getNode(id);
            if (!node?.parentId) continue;
            const parent = graph.getNode(node.parentId);
            if (!parent) continue;
            const idx = parent.childIds.indexOf(id);
            if (idx === parent.childIds.length - 1) continue;
            parent.childIds[idx] = parent.childIds[idx + 1];
            parent.childIds[idx + 1] = id;
          }
          requestRender();
        },

        sendToBack() {
          for (const id of get().selectedIds) {
            const node = graph.getNode(id);
            if (!node?.parentId) continue;
            const parent = graph.getNode(node.parentId);
            if (!parent) continue;
            if (parent.childIds.indexOf(id) === 0) continue;
            parent.childIds = parent.childIds.filter((cid) => cid !== id);
            parent.childIds.unshift(id);
          }
          requestRender();
        },

        sendBackward() {
          const ids = [...get().selectedIds].reverse();
          for (const id of ids) {
            const node = graph.getNode(id);
            if (!node?.parentId) continue;
            const parent = graph.getNode(node.parentId);
            if (!parent) continue;
            const idx = parent.childIds.indexOf(id);
            if (idx <= 0) continue;
            parent.childIds[idx] = parent.childIds[idx - 1];
            parent.childIds[idx - 1] = id;
          }
          requestRender();
        },

        toggleVisibility() {
          for (const id of get().selectedIds) {
            const node = graph.getNode(id);
            if (!node) continue;
            graph.updateNode(id, { visible: !node.visible });
          }
          requestRender();
        },

        toggleLock() {
          for (const id of get().selectedIds) {
            const node = graph.getNode(id);
            if (!node) continue;
            graph.updateNode(id, { locked: !node.locked });
          }
          requestRender();
        },

        moveToPage(pageId: string) {
          const targetPage = graph.getNode(pageId);
          if (targetPage?.type !== "CANVAS") return;
          for (const id of get().selectedIds) {
            graph.reparentNode(id, pageId);
          }
          set({ selectedIds: new Set() });
          requestRender();
        },

        duplicateSelected() {
          const s = get();
          const prevSelection = new Set(s.selectedIds);
          const newIds: string[] = [];
          const snapshots: { id: string; parentId: string; snapshot: SceneNode }[] = [];

          for (const id of s.selectedIds) {
            const src = graph.getNode(id);
            if (!src) continue;
            const parentId = src.parentId ?? s.currentPageId;
            const { id: _srcId, parentId: _srcParent, childIds: _srcChildren, ...srcRest } = src;
            const node = graph.createNode(src.type, parentId, {
              ...srcRest,
              name: `${src.name} copy`,
              x: src.x + 20,
              y: src.y + 20,
            });
            newIds.push(node.id);
            snapshots.push({ id: node.id, parentId, snapshot: { ...node } });
          }

          if (newIds.length > 0) {
            set({ selectedIds: new Set(newIds) });
            undo.push({
              label: "Duplicate",
              forward: () => {
                for (const { snapshot, parentId } of snapshots) {
                  graph.createNode(snapshot.type, parentId, snapshot);
                }
                set({ selectedIds: new Set(newIds) });
                requestRender();
              },
              inverse: () => {
                for (const { id } of snapshots) graph.deleteNode(id);
                set({ selectedIds: prevSelection });
                requestRender();
              },
            });
            requestRender();
          }
        },

        writeCopyData(clipboardData: DataTransfer) {
          const s = get();
          const nodes: SceneNode[] = [];
          for (const id of s.selectedIds) {
            const n = graph.getNode(id);
            if (n) nodes.push({ ...n });
          }
          if (nodes.length === 0) return;

          const names = nodes.map((n) => n.name).join("\n");
          const renderer = _renderer;
          const textPicBuilder = renderer
            ? (node: SceneNode) => renderer.buildTextPicture(node)
            : undefined;
          const internalHtml = buildOpenPencilClipboardHTML(nodes, graph, textPicBuilder);
          const figmaHtml = buildFigmaClipboardHTML(nodes, graph);
          const html = figmaHtml ? figmaHtml + internalHtml : internalHtml;
          clipboardData.setData("text/html", html);
          clipboardData.setData("text/plain", names);
        },

        pasteFromHTML(html: string) {
          const ownNodes = parseOpenPencilClipboard(html);
          if (ownNodes) {
            pasteOpenPencilNodes(ownNodes);
            return;
          }

          void parseFigmaClipboard(html).then((figma) => {
            if (!figma) return;
            const s = get();
            const bounds = figmaNodesBounds(figma.nodes);
            const viewCenterX = (-s.panX + window.innerWidth / 2) / s.zoom;
            const viewCenterY = (-s.panY + window.innerHeight / 2) / s.zoom;
            const offsetX = bounds ? viewCenterX - (bounds.x + bounds.w / 2) : 0;
            const offsetY = bounds ? viewCenterY - (bounds.y + bounds.h / 2) : 0;

            const prevSelection = new Set(s.selectedIds);
            const created = importClipboardNodes(
              figma.nodes,
              graph,
              s.currentPageId,
              offsetX,
              offsetY,
              figma.blobs,
            );
            if (created.length > 0) {
              computeAllLayouts(graph);
              set({ selectedIds: new Set(created) });
              const allNodes = collectSubtrees(graph, created);
              const pageId = s.currentPageId;
              undo.push({
                label: "Paste",
                forward: () => {
                  for (const snapshot of allNodes) {
                    graph.createNode(snapshot.type, snapshot.parentId ?? pageId, {
                      ...snapshot,
                      childIds: [],
                    });
                  }
                  computeAllLayouts(graph);
                  set({ selectedIds: new Set(created) });
                  requestRender();
                },
                inverse: () => {
                  for (const id of [...created].reverse()) graph.deleteNode(id);
                  computeAllLayouts(graph);
                  set({ selectedIds: prevSelection });
                  requestRender();
                },
              });
              requestRender();
            }
          });
        },

        // ── Vector editing ──

        enterVectorEdit(nodeId: string) {
          const node = graph.getNode(nodeId);
          if (!node?.vectorNetwork) return;
          set({ vectorEditId: nodeId, vectorEditSelectedVertex: null });
          requestRender();
        },

        exitVectorEdit() {
          set({ vectorEditId: null, vectorEditSelectedVertex: null });
          requestRender();
        },

        selectVectorVertex(index: number | null) {
          set({ vectorEditSelectedVertex: index });
          requestRepaint();
        },

        deleteVectorVertex(nodeId: string, vertexIndex: number) {
          const node = graph.getNode(nodeId);
          if (!node?.vectorNetwork) return;
          const network = structuredClone(node.vectorNetwork);
          if (network.vertices.length <= 2) return; // Need at least 2 vertices

          // Remove the vertex
          network.vertices.splice(vertexIndex, 1);
          // Remove segments that reference this vertex and update indices
          network.segments = network.segments
            .filter((seg) => seg.start !== vertexIndex && seg.end !== vertexIndex)
            .map((seg) => ({
              ...seg,
              start: seg.start > vertexIndex ? seg.start - 1 : seg.start,
              end: seg.end > vertexIndex ? seg.end - 1 : seg.end,
            }));
          // Clear regions (they'd need full recomputation)
          network.regions = [];

          const previous = { vectorNetwork: node.vectorNetwork };
          graph.updateNode(nodeId, { vectorNetwork: network });
          _renderer?.invalidateVectorPath(nodeId);

          const bounds = computeVectorBounds(network);
          graph.updateNode(nodeId, {
            width: bounds.width,
            height: bounds.height,
          });

          undo.push({
            label: "Delete vertex",
            forward: () => {
              graph.updateNode(nodeId, { vectorNetwork: network });
              _renderer?.invalidateVectorPath(nodeId);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(nodeId, previous);
              _renderer?.invalidateVectorPath(nodeId);
              requestRender();
            },
          });

          set({ vectorEditSelectedVertex: null });
          requestRender();
        },

        penAddVertex(x: number, y: number) {
          const s = get();
          if (!s.penState) {
            set({
              penState: {
                vertices: [{ x, y }],
                segments: [],
                dragTangent: null,
                closingToFirst: false,
              },
            });
            requestRender();
            return;
          }

          const ps = {
            ...s.penState,
            vertices: [...s.penState.vertices],
            segments: [...s.penState.segments],
          };
          const prevIdx = ps.vertices.length - 1;
          const first = ps.vertices[0];
          const dist = Math.hypot(x - first.x, y - first.y);
          if (ps.vertices.length > 2 && dist < 8) {
            ps.segments.push({
              start: prevIdx,
              end: 0,
              tangentStart: ps.dragTangent ?? { x: 0, y: 0 },
              tangentEnd: { x: 0, y: 0 },
            });
            set({ penState: ps });
            get().actions.penCommit(true);
            return;
          }

          ps.vertices.push({ x, y });
          const newIdx = ps.vertices.length - 1;
          ps.segments.push({
            start: prevIdx,
            end: newIdx,
            tangentStart: ps.dragTangent ?? { x: 0, y: 0 },
            tangentEnd: { x: 0, y: 0 },
          });
          ps.dragTangent = null;
          set({ penState: ps });
          requestRender();
        },

        penSetDragTangent(tx: number, ty: number) {
          const s = get();
          if (!s.penState) return;
          const ps = { ...s.penState, segments: [...s.penState.segments] };
          ps.dragTangent = { x: tx, y: ty };
          if (ps.segments.length > 0) {
            const lastSeg = { ...ps.segments[ps.segments.length - 1] };
            lastSeg.tangentEnd = { x: -tx, y: -ty };
            ps.segments[ps.segments.length - 1] = lastSeg;
          }
          set({ penState: ps });
          requestRender();
        },

        penSetClosingToFirst(closing: boolean) {
          const s = get();
          if (!s.penState) return;
          set({ penState: { ...s.penState, closingToFirst: closing } });
          requestRender();
        },

        penCommit(closed: boolean) {
          const ps = get().penState;
          if (!ps || ps.vertices.length < 2) {
            set({ penState: null, penCursorX: null, penCursorY: null });
            return;
          }
          const regions: VectorRegion[] = closed
            ? [{ windingRule: "NONZERO", loops: [ps.segments.map((_, i) => i)] }]
            : [];
          const network: VectorNetwork = { vertices: ps.vertices, segments: ps.segments, regions };
          const bounds = computeVectorBounds(network);
          const normalizedVertices = network.vertices.map((v) => ({
            ...v,
            x: v.x - bounds.x,
            y: v.y - bounds.y,
          }));
          const normalizedNetwork: VectorNetwork = {
            vertices: normalizedVertices,
            segments: network.segments,
            regions: network.regions,
          };
          const { actions } = get();
          const nodeId = actions.createShape(
            "VECTOR" as NodeType,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
          );
          actions.updateNode(nodeId, {
            vectorNetwork: normalizedNetwork,
            name: "Vector",
            fills: closed ? [{ ...DEFAULT_SHAPE_FILL }] : [],
            strokes: closed
              ? []
              : [
                  {
                    color: { r: 0, g: 0, b: 0, a: 1 },
                    weight: 2,
                    opacity: 1,
                    visible: true,
                    align: "CENTER" as const,
                  },
                ],
          });
          actions.select([nodeId]);
          set({ penState: null, penCursorX: null, penCursorY: null, activeTool: "SELECT" });
          requestRender();
        },

        penCancel() {
          set({ penState: null, penCursorX: null, penCursorY: null, activeTool: "SELECT" });
          requestRender();
        },

        startTextEditing(nodeId: string) {
          if (get().editingTextId) get().actions.commitTextEdit();
          const node = graph.getNode(nodeId);
          if (!node) return;
          set({ editingTextId: nodeId });
          if (_textEditor) {
            _textEditor.setRenderer(_renderer);
            _textEditor.start(node);
          }
          requestRender();
        },

        commitTextEdit() {
          if (!_textEditor?.isActive) {
            set({ editingTextId: null });
            return;
          }
          const result = _textEditor.stop();
          if (!result) {
            set({ editingTextId: null });
            requestRender();
            return;
          }
          const prevText = result.originalText;
          const newText = result.text;
          graph.updateNode(result.nodeId, { text: newText });
          set({ editingTextId: null });
          if (prevText !== newText) {
            undo.push({
              label: "Edit text",
              forward: () => {
                graph.updateNode(result.nodeId, { text: newText });
                requestRender();
              },
              inverse: () => {
                graph.updateNode(result.nodeId, { text: prevText });
                requestRender();
              },
            });
          }
          requestRender();
        },

        adoptNodesIntoSection(sectionId: string) {
          const section = graph.getNode(sectionId);
          if (section?.type !== "SECTION") return;
          const parentId = section.parentId ?? get().currentPageId;
          const siblings = graph.getChildren(parentId);

          const sx = section.x,
            sy = section.y;
          const sx2 = sx + section.width,
            sy2 = sy + section.height;

          const toAdopt: string[] = [];
          for (const sibling of siblings) {
            if (sibling.id === sectionId) continue;
            if (
              sibling.x >= sx &&
              sibling.y >= sy &&
              sibling.x + sibling.width <= sx2 &&
              sibling.y + sibling.height <= sy2
            ) {
              toAdopt.push(sibling.id);
            }
          }
          if (toAdopt.length === 0) return;

          const undoOps: {
            id: string;
            oldParent: string;
            oldX: number;
            oldY: number;
            newX: number;
            newY: number;
          }[] = [];
          for (const id of toAdopt) {
            const node = graph.getNode(id);
            if (!node) continue;
            const newX = node.x - sx,
              newY = node.y - sy;
            undoOps.push({ id, oldParent: parentId, oldX: node.x, oldY: node.y, newX, newY });
            graph.reparentNode(id, sectionId);
            graph.updateNode(id, { x: newX, y: newY });
          }

          undo.push({
            label: "Adopt into section",
            forward: () => {
              for (const op of undoOps) {
                graph.reparentNode(op.id, sectionId);
                graph.updateNode(op.id, { x: op.newX, y: op.newY });
              }
              requestRender();
            },
            inverse: () => {
              for (const op of undoOps) {
                graph.reparentNode(op.id, op.oldParent);
                graph.updateNode(op.id, { x: op.oldX, y: op.oldY });
              }
              requestRender();
            },
          });
          requestRender();
        },

        commitMove(originals: Map<string, { x: number; y: number }>) {
          const finals = new Map<string, { x: number; y: number }>();
          for (const [id] of originals) {
            const n = graph.getNode(id);
            if (n) finals.set(id, { x: n.x, y: n.y });
          }
          for (const [id] of finals) syncIfInsideComponent(id);
          undo.push({
            label: "Move",
            forward: () => {
              for (const [id, pos] of finals) {
                graph.updateNode(id, pos);
                runLayoutForNode(id);
              }
              for (const [id] of finals) syncIfInsideComponent(id);
              requestRender();
            },
            inverse: () => {
              for (const [id, pos] of originals) {
                graph.updateNode(id, pos);
                runLayoutForNode(id);
              }
              for (const [id] of originals) syncIfInsideComponent(id);
              requestRender();
            },
          });
        },

        commitResize(nodeId: string, origRect: Rect) {
          const node = graph.getNode(nodeId);
          if (!node) return;
          const finalRect = { x: node.x, y: node.y, width: node.width, height: node.height };
          // Enforce constraints on children when a container is resized
          applyConstraints(graph, nodeId, origRect.width, origRect.height, finalRect.width, finalRect.height);
          syncIfInsideComponent(nodeId);
          undo.push({
            label: "Resize",
            forward: () => {
              graph.updateNode(nodeId, finalRect);
              applyConstraints(graph, nodeId, origRect.width, origRect.height, finalRect.width, finalRect.height);
              runLayoutForNode(nodeId);
              syncIfInsideComponent(nodeId);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(nodeId, origRect);
              applyConstraints(graph, nodeId, finalRect.width, finalRect.height, origRect.width, origRect.height);
              runLayoutForNode(nodeId);
              syncIfInsideComponent(nodeId);
              requestRender();
            },
          });
        },

        commitRotation(nodeId: string, origRotation: number) {
          const node = graph.getNode(nodeId);
          if (!node) return;
          const finalRotation = node.rotation;
          undo.push({
            label: "Rotate",
            forward: () => {
              graph.updateNode(nodeId, { rotation: finalRotation });
              requestRender();
            },
            inverse: () => {
              graph.updateNode(nodeId, { rotation: origRotation });
              requestRender();
            },
          });
        },

        commitNodeUpdate(nodeId: string, previous: Partial<SceneNode>, label = "Update") {
          const node = graph.getNode(nodeId);
          if (!node) return;
          const current: Partial<SceneNode> = {};
          for (const key of Object.keys(previous) as (keyof SceneNode)[]) {
            (current as Record<string, unknown>)[key] = node[key];
          }
          undo.push({
            label,
            forward: () => {
              graph.updateNode(nodeId, current);
              runLayoutForNode(nodeId);
              requestRender();
            },
            inverse: () => {
              graph.updateNode(nodeId, previous);
              runLayoutForNode(nodeId);
              requestRender();
            },
          });
        },

        undoAction() {
          undo.undo();
          requestRender();
        },

        redoAction() {
          undo.redo();
          requestRender();
        },

        screenToCanvas(sx: number, sy: number) {
          const s = get();
          return { x: (sx - s.panX) / s.zoom, y: (sy - s.panY) / s.zoom };
        },

        applyZoom(delta: number, centerX: number, centerY: number) {
          const s = get();
          const factor = Math.pow(ZOOM_SENSITIVITY, delta);
          const newZoom = Math.max(0.02, Math.min(256, s.zoom * factor));
          set({
            panX: centerX - (centerX - s.panX) * (newZoom / s.zoom),
            panY: centerY - (centerY - s.panY) * (newZoom / s.zoom),
            zoom: newZoom,
          });
          requestRepaint();
        },

        pan(dx: number, dy: number) {
          set((s) => ({ panX: s.panX + dx, panY: s.panY + dy }));
          requestRepaint();
        },

        zoomToFit() {
          const s = get();
          const nodes = graph.getChildren(s.currentPageId);
          if (nodes.length === 0) return;
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
          }
          const padding = 80;
          const w = maxX - minX + padding * 2;
          const h = maxY - minY + padding * 2;
          const viewW = 800,
            viewH = 600;
          const zoom = Math.min(viewW / w, viewH / h, 1);
          set({
            zoom,
            panX: (viewW - w * zoom) / 2 - minX * zoom + padding * zoom,
            panY: (viewH - h * zoom) / 2 - minY * zoom + padding * zoom,
          });
          requestRepaint();
        },

        zoomToSelection() {
          const s = get();
          const ids = [...s.selectedIds];
          if (ids.length === 0) return;
          const nodes = ids.map((id) => graph.getNode(id)).filter((n): n is NonNullable<typeof n> => !!n);
          if (nodes.length === 0) return;
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of nodes) {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
          }
          const padding = 48;
          const w = maxX - minX + padding * 2;
          const h = maxY - minY + padding * 2;
          const viewW = 800,
            viewH = 600;
          const zoom = Math.min(viewW / w, viewH / h, 1);
          set({
            zoom,
            panX: (viewW - w * zoom) / 2 - minX * zoom + padding * zoom,
            panY: (viewH - h * zoom) / 2 - minY * zoom + padding * zoom,
          });
          requestRepaint();
        },

        setCanvasKit(ck: CanvasKit, renderer: SkiaRenderer) {
          _ck = ck;
          _renderer = renderer;
          _textEditor = new TextEditor(ck);
        },

        async openFigFile(file: File, handle?: FileSystemFileHandle, path?: string) {
          try {
            const imported = await readFigFile(file);
            graph = imported;
            computeAllLayouts(graph);
            undo.clear();
            pageViewports.clear();
            fileHandle = handle ?? null;
            filePath = path ?? null;
            const firstPage = graph.getPages()[0];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- getPages may return empty array
            const pageId = firstPage?.id ?? graph.rootId;
            set({
              documentName: file.name.replace(/\.fig$/i, ""),
              selectedIds: new Set(),
              currentPageId: pageId,
              panX: 0,
              panY: 0,
              zoom: 1,
              pageColor: { ...PAGE_BG_COLOR },
            });
            requestRender();
            void startWatchingFile();
          } catch (e) {
            console.error("Failed to open .fig file:", e);
          }
        },

        async saveFigFile() {
          if (filePath || fileHandle) {
            await writeFile(await buildFigFile());
          } else if (downloadName) {
            downloadBlob(
              new Uint8Array(await buildFigFile()),
              downloadName,
              "application/octet-stream",
            );
          } else {
            await get().actions.saveFigFileAs();
          }
        },

        async saveFigFileAs() {
          const data = await buildFigFile();

          if (IS_TAURI) {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const path = await save({
              defaultPath: "Untitled.fig",
              filters: [{ name: "Figma file", extensions: ["fig"] }],
            });
            if (!path) return;
            filePath = path;
            fileHandle = null;
            set({
              documentName:
                path
                  .split("/")
                  .pop()
                  ?.replace(/\.fig$/i, "") ?? "Untitled",
            });
            await writeFile(data);
            void startWatchingFile();
            return;
          }

          if (window.showSaveFilePicker) {
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: "Untitled.fig",
                types: [
                  { description: "Figma file", accept: { "application/octet-stream": [".fig"] } },
                ],
              });
              fileHandle = handle;
              filePath = null;
              set({ documentName: handle.name.replace(/\.fig$/i, "") });
              await writeFile(data);
              void startWatchingFile();
              return;
            } catch (e) {
              if ((e as Error).name === "AbortError") return;
            }
          }

          // eslint-disable-next-line no-alert -- browser fallback for Save As
          const filename = prompt("Save as:", downloadName ?? "Untitled.fig");
          if (!filename) return;
          downloadName = filename;
          set({ documentName: filename.replace(/\.fig$/i, "") });
          downloadBlob(new Uint8Array(data), filename, "application/octet-stream");
        },

        renderExportImage(nodeIds: string[], scale: number, format: ExportFormat) {
          if (!_ck || !_renderer) return null;
          const s = get();
          const ids =
            nodeIds.length > 0 ? nodeIds : graph.getChildren(s.currentPageId).map((n) => n.id);
          if (ids.length === 0) return null;
          return renderNodesToImage(_ck, _renderer, graph, s.currentPageId, ids, { scale, format });
        },

        async exportSelection(scale: number, format: ExportFormat) {
          const s = get();
          const ids = [...s.selectedIds];
          const data = get().actions.renderExportImage(ids, scale, format);
          if (!data) return;

          const node = ids.length === 1 ? graph.getNode(ids[0]) : undefined;
          const baseName = node?.name ?? "Export";
          const ext = exportImageExtension(format);
          const fileName = `${baseName}@${scale}x${ext}`;

          if (IS_TAURI) {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const path = await save({
              defaultPath: fileName,
              filters: [{ name: format, extensions: [ext.slice(1)] }],
            });
            if (!path) return;
            const { writeFile: tauriWrite } = await import("@tauri-apps/plugin-fs");
            await tauriWrite(path, data);
            return;
          }

          if (window.showSaveFilePicker) {
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [
                  { description: `${format} image`, accept: { [exportImageMime(format)]: [ext] } },
                ],
              });
              const writable = await handle.createWritable();
              await writable.write(new Uint8Array(data));
              await writable.close();
              return;
            } catch (e) {
              if ((e as Error).name === "AbortError") return;
            }
          }

          downloadBlob(new Uint8Array(data), fileName, exportImageMime(format));
        },

        toggleAiChat() {
          set((s) => ({ showAiChat: !s.showAiChat }));
        },

        // ── Variables / Design Tokens ──

        createCollection(name: string) {
          const collection = graph.createCollection(name);
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
          return collection;
        },

        deleteCollection(id: string) {
          graph.removeCollection(id);
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
        },

        renameCollection(id: string, name: string) {
          const collection = graph.variableCollections.get(id);
          if (collection) {
            collection.name = name;
            set((s) => ({ variableVersion: s.variableVersion + 1 }));
          }
        },

        addCollectionMode(collectionId: string, name: string) {
          const collection = graph.variableCollections.get(collectionId);
          if (!collection) throw new Error(`Collection "${collectionId}" not found`);
          const modeId = `mode_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const mode: VariableCollectionMode = { modeId, name };
          collection.modes.push(mode);
          // Initialize all variables in this collection with default values for the new mode
          for (const varId of collection.variableIds) {
            const variable = graph.variables.get(varId);
            if (variable && !(modeId in variable.valuesByMode)) {
              const defaultVal =
                variable.type === "COLOR"
                  ? { r: 0, g: 0, b: 0, a: 1 }
                  : variable.type === "FLOAT"
                    ? 0
                    : variable.type === "BOOLEAN"
                      ? false
                      : "";
              variable.valuesByMode[modeId] = defaultVal;
            }
          }
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
          return mode;
        },

        removeCollectionMode(collectionId: string, modeId: string) {
          const collection = graph.variableCollections.get(collectionId);
          if (!collection) return;
          collection.modes = collection.modes.filter((m) => m.modeId !== modeId);
          // Remove mode values from all variables
          for (const varId of collection.variableIds) {
            const variable = graph.variables.get(varId);
            if (variable) delete variable.valuesByMode[modeId];
          }
          // Reset default mode if it was removed
          if (collection.defaultModeId === modeId && collection.modes.length > 0) {
            collection.defaultModeId = collection.modes[0].modeId;
          }
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
        },

        renameCollectionMode(collectionId: string, modeId: string, name: string) {
          const collection = graph.variableCollections.get(collectionId);
          if (!collection) return;
          const mode = collection.modes.find((m) => m.modeId === modeId);
          if (mode) {
            mode.name = name;
            set((s) => ({ variableVersion: s.variableVersion + 1 }));
          }
        },

        createVariable(
          name: string,
          type: VariableType,
          collectionId: string,
          value?: VariableValue,
        ) {
          const variable = graph.createVariable(name, type, collectionId, value);
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
          return variable;
        },

        deleteVariable(id: string) {
          graph.removeVariable(id);
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
        },

        renameVariable(id: string, name: string) {
          const variable = graph.variables.get(id);
          if (variable) {
            variable.name = name;
            set((s) => ({ variableVersion: s.variableVersion + 1 }));
          }
        },

        setVariableValue(id: string, modeId: string, value: VariableValue) {
          const variable = graph.variables.get(id);
          if (variable) {
            variable.valuesByMode[modeId] = value;
            set((s) => ({ variableVersion: s.variableVersion + 1 }));
            requestRender();
          }
        },

        setActiveMode(collectionId: string, modeId: string) {
          graph.setActiveMode(collectionId, modeId);
          set((s) => ({ variableVersion: s.variableVersion + 1 }));
          requestRender();
        },

        bindVariable(nodeId: string, field: string, variableId: string) {
          graph.bindVariable(nodeId, field, variableId);
          requestRender();
        },

        unbindVariable(nodeId: string, field: string) {
          graph.unbindVariable(nodeId, field);
          requestRender();
        },

        isTopLevel,
      },
    };

    // Local helper — paste OpenPencil clipboard nodes
    function pasteOpenPencilNodes(
      nodes: (SceneNode & { children?: SceneNode[] })[],
      parentId?: string,
    ) {
      const target = parentId ?? get().currentPageId;
      const prevSelection = new Set(get().selectedIds);
      const newIds: string[] = [];
      const created: { id: string; parentId: string; snapshot: SceneNode }[] = [];

      function createTree(
        src: SceneNode & { children?: SceneNode[] },
        pid: string,
        isTop: boolean,
      ) {
        const { id: _srcId, parentId: _srcParent, childIds: _srcChildren, ...rest } = src;
        const node = graph.createNode(src.type, pid, {
          ...rest,
          x: src.x + (isTop ? 20 : 0),
          y: src.y + (isTop ? 20 : 0),
        });
        created.push({ id: node.id, parentId: pid, snapshot: { ...node } });
        if (isTop) newIds.push(node.id);
        if (src.children) {
          for (const child of src.children) createTree(child, node.id, false);
        }
      }

      for (const src of nodes) createTree(src, target, true);
      if (newIds.length > 0) {
        set({ selectedIds: new Set(newIds) });
        undo.push({
          label: "Paste",
          forward: () => {
            for (const { snapshot, parentId: pid } of created) {
              graph.createNode(snapshot.type, pid, snapshot);
            }
            set({ selectedIds: new Set(newIds) });
            requestRender();
          },
          inverse: () => {
            for (const { id } of [...created].reverse()) graph.deleteNode(id);
            set({ selectedIds: prevSelection });
            requestRender();
          },
        });
        requestRender();
      }
    }
  }),
);

// ── Autosave subscription ──

const AUTOSAVE_DELAY = 3000;

useEditorStore.subscribe(
  (state) => state.sceneVersion,
  (version) => {
    if (version === savedVersion) return;
    if (!fileHandle && !filePath) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void (async () => {
        if (useEditorStore.getState().sceneVersion === savedVersion) return;
        try {
          const data = await exportFigFile(
            graph,
            _ck ?? undefined,
            _renderer ?? undefined,
            useEditorStore.getState().currentPageId,
          );
          lastWriteTime = Date.now();
          if (filePath && IS_TAURI) {
            const { writeFile: tauriWrite } = await import("@tauri-apps/plugin-fs");
            await tauriWrite(filePath, data);
            savedVersion = useEditorStore.getState().sceneVersion;
          } else if (fileHandle) {
            const writable = await fileHandle.createWritable();
            await writable.write(new Uint8Array(data));
            await writable.close();
            savedVersion = useEditorStore.getState().sceneVersion;
          }
        } catch {
          // silently fail — user can still save manually
        }
      })();
    }, AUTOSAVE_DELAY);
  },
);
