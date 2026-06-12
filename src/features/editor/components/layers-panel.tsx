import {
  ChevronRight,
  Circle,
  Diamond,
  Component,
  Frame,
  Group,
  Minus,
  PenTool,
  LayoutGrid,
  Square,
  Type,
  EyeOff,
  Lock,
  Search,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { getGraph, useEditorStore } from "../store/editor-store";

interface LayerNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  children?: LayerNode[];
}

const NODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SECTION: LayoutGrid,
  ELLIPSE: Circle,
  FRAME: Frame,
  GROUP: Group,
  COMPONENT: Diamond,
  COMPONENT_SET: Component,
  INSTANCE: Diamond,
  LINE: Minus,
  TEXT: Type,
  VECTOR: PenTool,
  RECTANGLE: Square,
};

const COMPONENT_TYPES = new Set(["COMPONENT", "COMPONENT_SET", "INSTANCE"]);

function buildTree(graph: ReturnType<typeof getGraph>, parentId: string): LayerNode[] {
  const parent = graph.getNode(parentId);
  if (!parent) return [];
  return parent.childIds
    .map((cid) => graph.getNode(cid))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      locked: node.locked,
      children: node.childIds.length > 0 ? buildTree(graph, node.id) : undefined,
    }));
}

interface FlatItem {
  node: LayerNode;
  level: number;
  hasChildren: boolean;
}

function flattenTree(items: LayerNode[], expanded: Set<string>, level = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const item of items) {
    const hasChildren = !!(item.children && item.children.length > 0);
    result.push({ node: item, level, hasChildren });
    if (hasChildren && expanded.has(item.id)) {
      result.push(...flattenTree(item.children!, expanded, level + 1));
    }
  }
  return result;
}

function filterTree(items: LayerNode[], query: string): LayerNode[] {
  const lower = query.toLowerCase();
  const result: LayerNode[] = [];
  for (const item of items) {
    const childMatches = item.children ? filterTree(item.children, query) : undefined;
    const nameMatches = item.name.toLowerCase().includes(lower);
    if (nameMatches || (childMatches && childMatches.length > 0)) {
      result.push({
        ...item,
        children: childMatches && childMatches.length > 0 ? childMatches : item.children,
      });
    }
  }
  return result;
}

export function LayersPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const sceneVersion = useEditorStore((s) => s.sceneVersion);
  const actions = useEditorStore((s) => s.actions);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [indicatorY, setIndicatorY] = useState(-1);
  const [indicatorDepth, setIndicatorDepth] = useState(0);
  const [dropIntoId, setDropIntoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropTargetRef = useRef<{ parentId: string; index: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => {
    void sceneVersion;
    return buildTree(getGraph(), currentPageId);
  }, [sceneVersion, currentPageId]);

  const filteredTree = useMemo(
    () => (searchQuery ? filterTree(tree, searchQuery) : tree),
    [tree, searchQuery],
  );

  // When searching, expand all so matches are visible
  const effectiveExpanded = useMemo(() => {
    if (!searchQuery) return expanded;
    const all = new Set<string>();
    function collectIds(items: LayerNode[]) {
      for (const item of items) {
        all.add(item.id);
        if (item.children) collectIds(item.children);
      }
    }
    collectIds(filteredTree);
    return all;
  }, [searchQuery, expanded, filteredTree]);

  const flatItems = useMemo(
    () => flattenTree(filteredTree, effectiveExpanded),
    [filteredTree, effectiveExpanded],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      actions.renameNode(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, actions]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (renamingId) return; // Don't start drag while renaming
      const startY = e.clientY;
      let didMove = false;

      function onMove(ev: PointerEvent) {
        if (!didMove && Math.abs(ev.clientY - startY) < 4) return;
        didMove = true;
        setDragging(true);
        setDragNodeId(nodeId);
        updateDropTarget(ev, nodeId);
      }

      function onUp() {
        if (didMove && dropTargetRef.current && nodeId) {
          const { parentId, index } = dropTargetRef.current;
          const graph = getGraph();
          if (parentId !== nodeId && !graph.isDescendant(parentId, nodeId)) {
            graph.reorderChild(nodeId, parentId, index);
            actions.requestRender();
          }
        } else if (!didMove) {
          if (e.shiftKey) {
            actions.select([nodeId], true);
          } else {
            actions.select([nodeId]);
          }
        }
        cleanup();
      }

      function cleanup() {
        setDragging(false);
        setDragNodeId(null);
        setIndicatorY(-1);
        setDropIntoId(null);
        dropTargetRef.current = null;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [actions, renamingId],
  );

  function updateDropTarget(ev: PointerEvent, dragId: string) {
    const list = listRef.current;
    if (!list) return;
    const graph = getGraph();
    const state = useEditorStore.getState();

    const rows = list.querySelectorAll<HTMLElement>("[data-node-id]");
    const listRect = list.getBoundingClientRect();
    const mouseY = ev.clientY;

    let bestInsertBefore: { parentId: string; index: number; y: number; depth: number } | null =
      null;
    let bestInto: { nodeId: string } | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row.dataset.nodeId;
      if (!rowId || rowId === dragId) continue;

      const rect = row.getBoundingClientRect();
      const rowMid = rect.top + rect.height / 2;
      const topZone = rect.top + rect.height * 0.25;
      const bottomZone = rect.top + rect.height * 0.75;

      const rowNode = graph.getNode(rowId);
      if (!rowNode) continue;

      if (mouseY > topZone && mouseY < bottomZone && graph.isContainer(rowId)) {
        bestInto = { nodeId: rowId };
        bestInsertBefore = null;
        break;
      }

      if (mouseY <= rowMid) {
        const parentId = rowNode.parentId ?? state.currentPageId;
        const parent = graph.getNode(parentId);
        if (parent) {
          const idx = parent.childIds.indexOf(rowId);
          const level = parseInt(row.dataset.level ?? "0");
          bestInsertBefore = {
            parentId,
            index: Math.max(0, idx),
            y: rect.top - listRect.top + list.scrollTop,
            depth: level,
          };
        }
        break;
      }

      if (i === rows.length - 1 && mouseY > rowMid) {
        const parentId = rowNode.parentId ?? state.currentPageId;
        const parent = graph.getNode(parentId);
        if (parent) {
          const idx = parent.childIds.indexOf(rowId);
          const level = parseInt(row.dataset.level ?? "0");
          bestInsertBefore = {
            parentId,
            index: idx + 1,
            y: rect.bottom - listRect.top + list.scrollTop,
            depth: level,
          };
        }
      }
    }

    if (bestInto) {
      setDropIntoId(bestInto.nodeId);
      setIndicatorY(-1);
      const container = graph.getNode(bestInto.nodeId);
      dropTargetRef.current = container
        ? { parentId: bestInto.nodeId, index: container.childIds.length }
        : null;
    } else if (bestInsertBefore) {
      setDropIntoId(null);
      setIndicatorY(bestInsertBefore.y);
      setIndicatorDepth(bestInsertBefore.depth);
      dropTargetRef.current = {
        parentId: bestInsertBefore.parentId,
        index: bestInsertBefore.index,
      };
    } else {
      setDropIntoId(null);
      setIndicatorY(-1);
      dropTargetRef.current = null;
    }
  }

  return (
    <div aria-label="Layers" className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wider text-[#888]">Layers</span>
        <span className="flex-1" />
      </header>

      {/* Search input */}
      <div className="shrink-0 px-2 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[#888]" />
          <input
            className="h-6 w-full rounded bg-[#1e1e1e] pl-6 pr-2 text-[11px] text-[#ccc] placeholder-[#6b6b6b] outline-none ring-inset focus:ring-1 focus:ring-[#4f8ef7]"
            placeholder="Filter layers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div ref={listRef} className="relative flex-1 overflow-y-auto px-1" role="tree" aria-label="Layer tree">
        {flatItems.length === 0 && searchQuery && (
          <div className="px-3 py-6 text-center text-[11px] text-[#888]">
            No layers match &quot;{searchQuery}&quot;
          </div>
        )}
        {flatItems.length === 0 && !searchQuery && (
          <div className="px-3 py-8 text-center text-[11px] text-[#888]">
            No layers yet
          </div>
        )}
        {flatItems.map((item) => {
          const Icon = NODE_ICONS[item.node.type] ?? Square;
          const isSelected = selectedIds.has(item.node.id);
          const isExpanded = effectiveExpanded.has(item.node.id);
          const isComponent = COMPONENT_TYPES.has(item.node.type);
          const isRenaming = renamingId === item.node.id;

          return (
            <div key={item.node.id} data-level={item.level} data-node-id={item.node.id} role="treeitem" aria-selected={isSelected} aria-expanded={item.hasChildren ? isExpanded : undefined}>
              <button
                className={`group/row flex w-full cursor-pointer items-center gap-1 rounded border-none py-1 text-left text-xs ${
                  isSelected
                    ? "bg-[#a855f7]/20 text-[#d8b4fe]"
                    : "bg-transparent text-[#ccc] hover:bg-[#ffffff08]"
                } ${dragging && dragNodeId === item.node.id ? "opacity-30" : ""} ${
                  dropIntoId === item.node.id ? "ring-2 ring-[#a855f7] ring-inset" : ""
                } ${!item.node.visible ? "opacity-50" : ""}`}
                style={{ paddingLeft: `${8 + item.level * 16}px` }}
                onDoubleClick={() => startRename(item.node.id, item.node.name)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPointerDown(e, item.node.id);
                }}
              >
                {item.hasChildren ? (
                  <span
                    className={`flex w-4 shrink-0 cursor-pointer items-center justify-center text-[#666] transition-transform hover:text-[#ccc] ${
                      isExpanded ? "rotate-90" : "rotate-0"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.node.id);
                    }}
                  >
                    <ChevronRight className="size-3" />
                  </span>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <Icon
                  className={`size-3 shrink-0 ${isComponent ? "text-[#9747ff] opacity-100" : "opacity-70"}`}
                />
                {isRenaming ? (
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded bg-[#252525] px-1 text-xs text-[#e0e0e0] outline-none ring-1 ring-inset ring-[#4f8ef7]"
                    value={renameValue}
                    onBlur={commitRename}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{item.node.name}</span>
                )}
                {item.node.locked && <Lock className="mr-0.5 size-3 shrink-0 text-[#666]" />}
                {!item.node.visible && <EyeOff className="mr-1 size-3 shrink-0 text-[#666]" />}
              </button>
            </div>
          );
        })}

        {/* Drop indicator line */}
        {dragging && indicatorY >= 0 && (
          <div
            className="pointer-events-none absolute right-1 left-1 h-0.5 bg-[#a855f7]"
            style={{ top: `${indicatorY}px`, marginLeft: `${indicatorDepth * 16}px` }}
          />
        )}
      </div>
    </div>
  );
}
