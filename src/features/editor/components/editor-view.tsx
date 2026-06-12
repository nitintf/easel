import {
  Box,
  Component,
  Circle,
  Frame,
  Minus,
  PanelLeft,
  PanelRight,
  PenTool,
  Star,
  Triangle,
  Type,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { Toaster } from "sonner";

import { useKeyboard } from "../hooks/use-keyboard";
import { getGraph, useEditorStore } from "../store/editor-store";

import { NodeContextMenu } from "./canvas-context-menu";
import { EditorAiChat } from "./editor-ai-chat";
import { EditorCanvas } from "./editor-canvas";
import { EditorToolbar } from "./editor-toolbar";
import { LayersPanel } from "./layers-panel";
import { PagesPanel } from "./pages-panel";
import { PropertiesPanel } from "./properties-panel";
import { ZoomControl } from "./zoom-control";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { NodeType } from "@easel/editor-core";

const SIDEBAR_W = 240;

const NODE_TYPE_ICONS: Partial<Record<NodeType | 'COMPONENT', React.ComponentType<{ className?: string }>>> = {
  FRAME: Frame,
  RECTANGLE: Box,
  ELLIPSE: Circle,
  LINE: Minus,
  POLYGON: Triangle,
  STAR: Star,
  TEXT: Type,
  VECTOR: PenTool,
  COMPONENT: Component,
};

export function EditorView() {
  useKeyboard();

  const showUI = useEditorStore((s) => s.showUI);
  const showRightPanel = useEditorStore((s) => s.showRightPanel);
  const showAiChat = useEditorStore((s) => s.showAiChat);
  const documentName = useEditorStore((s) => s.documentName);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const sceneVersion = useEditorStore((s) => s.sceneVersion);

  const selectedInfo = useMemo(() => {
    void sceneVersion;
    if (selectedIds.size === 0) return null;
    if (selectedIds.size > 1) return { name: `${selectedIds.size} objects`, type: 'MULTI' as const };
    const id = [...selectedIds][0];
    const node = getGraph().getNode(id);
    if (!node) return null;
    const isComponent = node.type === 'COMPONENT' || node.type === 'INSTANCE';
    return { name: node.name, type: isComponent ? 'COMPONENT' as const : node.type };
  }, [selectedIds, sceneVersion]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#1a1a1a]">
        {/* Top bar — sits above everything, respects macOS traffic lights */}
        <div
          data-tauri-drag-region
          className="flex h-10 shrink-0 items-center border-b border-[#111] bg-[#191919]"
        >
          {/* Left: traffic light spacer + sidebar toggle */}
          <div className="flex shrink-0 items-center gap-0.5 pl-[78px] pr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`flex size-6 items-center justify-center rounded-md transition-colors hover:bg-[#252525] hover:text-[#ccc] ${
                    showUI ? "text-[#ccc]" : "text-[#666]"
                  }`}
                  onClick={() => useEditorStore.setState({ showUI: !showUI })}
                >
                  <PanelLeft className="size-[15px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                Toggle left panel <kbd className="ml-1 text-[10px] opacity-60">{"\u2318\\"}</kbd>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Center: document name */}
          <div
            className="flex min-w-0 flex-1 items-center justify-center"
            data-tauri-drag-region=""
          >
            <DocumentName name={documentName} />
          </div>

          {/* Right spacer to balance */}
          <div className="w-[78px] shrink-0" />
        </div>

        {/* Main content */}
        <div className="relative flex min-h-0 flex-1">
          {/* Left sidebar — animated */}
          <motion.div
            animate={{ width: showUI ? SIDEBAR_W : 0, opacity: showUI ? 1 : 0 }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-[#111] bg-[#191919]"
            initial={false}
            transition={{ type: "tween", duration: 0.2 }}
          >
            <PagesPanel />
            <ScrollArea className="flex-1">
              <LayersPanel />
            </ScrollArea>
          </motion.div>

          {/* Canvas area */}
          <div className="relative min-w-0 flex-1">
            <NodeContextMenu>
              <div className="h-full w-full">
                <EditorCanvas />
              </div>
            </NodeContextMenu>
            {/* Bottom toolbar / AI chat swap */}
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center">
              <AnimatePresence mode="wait">
                {!showAiChat ? (
                  <motion.div
                    key="toolbar"
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    initial={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EditorToolbar />
                  </motion.div>
                ) : (
                  <motion.div
                    key="ai-chat"
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    initial={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <EditorAiChat />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <ZoomControl />

            {/* Floating selection bar when right panel is hidden */}
            <AnimatePresence>
              {!showRightPanel && (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute top-2 right-2 z-10"
                  exit={{ opacity: 0, x: 10 }}
                  initial={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <SelectionBar
                    selectedInfo={selectedInfo}
                    onOpen={() => useEditorStore.setState({ showRightPanel: true })}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right sidebar — animated */}
          <motion.div
            animate={{ width: showRightPanel ? SIDEBAR_W : 0, opacity: showRightPanel ? 1 : 0 }}
            className="flex shrink-0 flex-col overflow-hidden border-l border-[#111] bg-[#191919]"
            initial={false}
            transition={{ type: "tween", duration: 0.2 }}
          >
            <PropertiesPanel />
          </motion.div>
        </div>
      </div>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: '#252525', border: '1px solid #333', color: '#ccc', fontSize: '12px' },
          duration: 2500,
        }}
      />
    </TooltipProvider>
  );
}

/** Compact panel indicator shown when right panel is collapsed */
function SelectionBar({
  selectedInfo,
  onOpen,
}: {
  selectedInfo: { name: string; type: string } | null;
  onOpen: () => void;
}) {
  const IconComp = selectedInfo
    ? NODE_TYPE_ICONS[selectedInfo.type as keyof typeof NODE_TYPE_ICONS] ?? Box
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg border border-[#333] bg-[#252525]/95 py-1 pr-1.5 pl-2 shadow-md backdrop-blur-sm transition-colors hover:border-[#444] hover:bg-[#2e2e2e]"
          onClick={onOpen}
        >
          {/* Object info section */}
          {selectedInfo ? (
            <div className="flex items-center gap-1.5">
              {IconComp && <IconComp className="size-3 shrink-0 text-[#a855f7]" />}
              <span className="max-w-[100px] truncate text-[11px] font-medium text-[#ccc]">
                {selectedInfo.name}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[#666]">Properties</span>
          )}

          {/* Divider + panel icon */}
          <div className="h-4 w-px bg-[#444]" />
          <PanelRight className="size-3.5 shrink-0 text-[#666]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={4}>
        Open properties panel
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline-editable document name, centered in top bar */
function DocumentName({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        className="w-[180px] rounded border border-[#a855f7]/50 bg-[#1a1a1a] px-2 py-0.5 text-center text-[11px] text-[#d4d4d4] outline-none ring-1 ring-[#a855f7]/30"
        defaultValue={name}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v) useEditorStore.setState({ documentName: v });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className="cursor-default truncate rounded px-2 py-0.5 text-[11px] text-[#888] hover:bg-[#252525] hover:text-[#ccc]"
      onDoubleClick={() => setEditing(true)}
    >
      {name}
    </span>
  );
}
