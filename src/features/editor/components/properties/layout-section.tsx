import { useState } from "react";

import { useNodeProps } from "../../hooks/use-node-props";
import { ScrubInput } from "../ui/scrub-input";

import type { SceneNode, LayoutSizing, LayoutAlign } from "@easel/editor-core";

type LayoutCounterAlign = "MIN" | "CENTER" | "MAX";

const ALIGN_GRID: { primary: LayoutAlign; counter: LayoutCounterAlign }[] = [
  { primary: "MIN", counter: "MIN" },
  { primary: "CENTER", counter: "MIN" },
  { primary: "MAX", counter: "MIN" },
  { primary: "MIN", counter: "CENTER" },
  { primary: "CENTER", counter: "CENTER" },
  { primary: "MAX", counter: "CENTER" },
  { primary: "MIN", counter: "MAX" },
  { primary: "CENTER", counter: "MAX" },
  { primary: "MAX", counter: "MAX" },
];

export function LayoutSection() {
  const { node, updateProp, commitProp, actions, graph } = useNodeProps();
  const [showIndividualPadding, setShowIndividualPadding] = useState(false);
  const [widthSizingOpen, setWidthSizingOpen] = useState(false);
  const [heightSizingOpen, setHeightSizingOpen] = useState(false);

  if (!node) return null;

  const isInAutoLayout = (() => {
    if (!node.parentId) return false;
    const parent = graph.getNode(node.parentId);
    return parent ? parent.layoutMode !== "NONE" : false;
  })();

  const widthSizing: LayoutSizing = (() => {
    if (node.layoutMode !== "NONE") {
      return node.layoutMode === "HORIZONTAL" ? node.primaryAxisSizing : node.counterAxisSizing;
    }
    if (isInAutoLayout && node.layoutGrow > 0) return "FILL";
    return "FIXED";
  })();

  const heightSizing: LayoutSizing = (() => {
    if (node.layoutMode !== "NONE") {
      return node.layoutMode === "VERTICAL" ? node.primaryAxisSizing : node.counterAxisSizing;
    }
    if (isInAutoLayout && node.layoutAlignSelf === "STRETCH") return "FILL";
    return "FIXED";
  })();

  function setWidthSizing(sizing: LayoutSizing) {
    if (node.layoutMode !== "NONE") {
      if (node.layoutMode === "HORIZONTAL") updateProp("primaryAxisSizing", sizing);
      else updateProp("counterAxisSizing", sizing);
    } else if (isInAutoLayout) {
      updateProp("layoutGrow", sizing === "FILL" ? 1 : 0);
    }
    setWidthSizingOpen(false);
  }

  function setHeightSizing(sizing: LayoutSizing) {
    if (node.layoutMode !== "NONE") {
      if (node.layoutMode === "VERTICAL") updateProp("primaryAxisSizing", sizing);
      else updateProp("counterAxisSizing", sizing);
    } else if (isInAutoLayout) {
      updateProp("layoutAlignSelf", sizing === "FILL" ? "STRETCH" : "AUTO");
    }
    setHeightSizingOpen(false);
  }

  function sizingLabel(s: string) {
    if (s === "HUG") return "Hug";
    if (s === "FILL") return "Fill";
    return "Fixed";
  }

  function hasUniformPadding() {
    return (
      node.paddingTop === node.paddingRight &&
      node.paddingRight === node.paddingBottom &&
      node.paddingBottom === node.paddingLeft
    );
  }

  function setUniformPadding(v: number) {
    actions.updateNode(node.id, {
      paddingTop: v,
      paddingRight: v,
      paddingBottom: v,
      paddingLeft: v,
    });
  }

  function commitUniformPadding(_value: number, previous: number) {
    actions.commitNodeUpdate(
      node.id,
      {
        paddingTop: previous,
        paddingRight: previous,
        paddingBottom: previous,
        paddingLeft: previous,
      } as unknown as Partial<SceneNode>,
      "Change padding",
    );
  }

  const showSizing = node.layoutMode !== "NONE" || isInAutoLayout;
  const sizingBtnClass =
    "cursor-pointer whitespace-nowrap rounded border-none bg-transparent px-1 py-px text-[9px] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]";
  const sizingOptClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center gap-2 rounded border-none bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[#3a3a3a] ${active ? "text-[#a855f7]" : "text-[#ccc]"}`;
  const dirBtnClass = (active: boolean) =>
    `flex cursor-pointer items-center justify-center rounded border px-2 py-1 ${active ? "border-[#a855f7] bg-[#a855f7] text-white" : "border-[#2a2a2a] bg-[#2a2a2a] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"}`;

  return (
    <>
      <div className="border-b border-[#2a2a2a] px-3 py-2.5">
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Layout</label>
        <div className="flex gap-1.5">
          {/* Width */}
          <div className="relative flex min-w-0 flex-1 items-center gap-1">
            <ScrubInput
              label="W"
              min={0}
              value={Math.round(node.width)}
              onChange={(v) => updateProp("width", v)}
              onCommit={(v, p) => commitProp("width", v, p)}
            />
            {showSizing && (
              <button
                className={sizingBtnClass}
                onClick={() => setWidthSizingOpen(!widthSizingOpen)}
              >
                {sizingLabel(widthSizing)}
              </button>
            )}
            {widthSizingOpen && (
              <div className="absolute top-full left-0 right-0 z-10 min-w-40 rounded-md border border-[#2a2a2a] bg-[#252525] p-1 shadow-lg">
                <button
                  className={sizingOptClass(widthSizing === "FIXED")}
                  onClick={() => setWidthSizing("FIXED")}
                >
                  Fixed width ({Math.round(node.width)})
                </button>
                {node.layoutMode !== "NONE" && (
                  <button
                    className={sizingOptClass(widthSizing === "HUG")}
                    onClick={() => setWidthSizing("HUG")}
                  >
                    Hug contents
                  </button>
                )}
                {isInAutoLayout && (
                  <button
                    className={sizingOptClass(widthSizing === "FILL")}
                    onClick={() => setWidthSizing("FILL")}
                  >
                    Fill container
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Height */}
          <div className="relative flex min-w-0 flex-1 items-center gap-1">
            <ScrubInput
              label="H"
              min={0}
              value={Math.round(node.height)}
              onChange={(v) => updateProp("height", v)}
              onCommit={(v, p) => commitProp("height", v, p)}
            />
            {showSizing && (
              <button
                className={sizingBtnClass}
                onClick={() => setHeightSizingOpen(!heightSizingOpen)}
              >
                {sizingLabel(heightSizing)}
              </button>
            )}
            {heightSizingOpen && (
              <div className="absolute top-full left-0 right-0 z-10 min-w-40 rounded-md border border-[#2a2a2a] bg-[#252525] p-1 shadow-lg">
                <button
                  className={sizingOptClass(heightSizing === "FIXED")}
                  onClick={() => setHeightSizing("FIXED")}
                >
                  Fixed height ({Math.round(node.height)})
                </button>
                {node.layoutMode !== "NONE" && (
                  <button
                    className={sizingOptClass(heightSizing === "HUG")}
                    onClick={() => setHeightSizing("HUG")}
                  >
                    Hug contents
                  </button>
                )}
                {isInAutoLayout && (
                  <button
                    className={sizingOptClass(heightSizing === "FILL")}
                    onClick={() => setHeightSizing("FILL")}
                  >
                    Fill container
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto Layout section (frames only) */}
      {node.type === "FRAME" && (
        <div className="border-b border-[#2a2a2a] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Auto layout</label>
            {node.layoutMode === "NONE" ? (
              <button
                className="cursor-pointer rounded border-none bg-transparent px-1 text-base leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
                title="Add auto layout (Shift+A)"
                onClick={() => actions.setLayoutMode(node.id, "VERTICAL")}
              >
                +
              </button>
            ) : (
              <button
                className="cursor-pointer rounded border-none bg-transparent px-1 text-base leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
                title="Remove auto layout"
                onClick={() => actions.setLayoutMode(node.id, "NONE")}
              >
                -
              </button>
            )}
          </div>

          {node.layoutMode !== "NONE" && (
            <>
              {/* Direction */}
              <div className="mt-1.5 flex gap-0.5">
                <button
                  className={dirBtnClass(node.layoutMode === "VERTICAL")}
                  title="Vertical"
                  onClick={() => actions.setLayoutMode(node.id, "VERTICAL")}
                >
                  <svg height="16" viewBox="0 0 16 16" width="16">
                    <rect fill="currentColor" height="3" rx="0.5" width="10" x="3" y="2" />
                    <rect fill="currentColor" height="3" rx="0.5" width="10" x="3" y="6.5" />
                    <rect fill="currentColor" height="3" rx="0.5" width="10" x="3" y="11" />
                  </svg>
                </button>
                <button
                  className={dirBtnClass(node.layoutMode === "HORIZONTAL")}
                  title="Horizontal"
                  onClick={() => actions.setLayoutMode(node.id, "HORIZONTAL")}
                >
                  <svg height="16" viewBox="0 0 16 16" width="16">
                    <rect fill="currentColor" height="10" rx="0.5" width="3" x="2" y="3" />
                    <rect fill="currentColor" height="10" rx="0.5" width="3" x="6.5" y="3" />
                    <rect fill="currentColor" height="10" rx="0.5" width="3" x="11" y="3" />
                  </svg>
                </button>
                <button
                  className={dirBtnClass(node.layoutWrap === "WRAP")}
                  title="Wrap"
                  onClick={() =>
                    updateProp("layoutWrap", node.layoutWrap === "WRAP" ? "NO_WRAP" : "WRAP")
                  }
                >
                  <svg height="16" viewBox="0 0 16 16" width="16">
                    <rect fill="currentColor" height="5" rx="0.5" width="5" x="2" y="2" />
                    <rect fill="currentColor" height="5" rx="0.5" width="5" x="9" y="2" />
                    <rect fill="currentColor" height="5" rx="0.5" width="5" x="2" y="9" />
                  </svg>
                </button>
              </div>

              {/* Alignment grid + Gap */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="grid grid-cols-3 gap-0.5 rounded border border-[#2a2a2a] bg-[#2a2a2a] p-1">
                  {ALIGN_GRID.map((a, i) => (
                    <button
                      key={i}
                      className="flex size-3.5 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 hover:bg-[#3a3a3a]"
                      onClick={() =>
                        actions.updateNodeWithUndo(
                          node.id,
                          { primaryAxisAlign: a.primary, counterAxisAlign: a.counter },
                          "Change alignment",
                        )
                      }
                    >
                      <span
                        className={`rounded-full ${
                          node.primaryAxisAlign === a.primary && node.counterAxisAlign === a.counter
                            ? "size-1.5 bg-[#a855f7]"
                            : "size-1 bg-[#666] opacity-40"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <ScrubInput
                  icon={
                    <svg height="14" viewBox="0 0 14 14" width="14">
                      <rect
                        fill="currentColor"
                        height="12"
                        opacity="0.4"
                        rx="0.5"
                        width="4"
                        x="0"
                        y="1"
                      />
                      <rect fill="currentColor" height="4" rx="0.5" width="4" x="5" y="5" />
                      <rect
                        fill="currentColor"
                        height="12"
                        opacity="0.4"
                        rx="0.5"
                        width="4"
                        x="10"
                        y="1"
                      />
                    </svg>
                  }
                  min={0}
                  value={node.itemSpacing}
                  onChange={(v) => updateProp("itemSpacing", v)}
                  onCommit={(v, p) => commitProp("itemSpacing", v, p)}
                />
              </div>

              {/* Padding */}
              <div className="mt-1.5 flex items-start gap-1">
                {showIndividualPadding || !hasUniformPadding() ? (
                  <div className="grid flex-1 grid-cols-2 gap-0.5">
                    {(["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const).map(
                      (side) => (
                        <input
                          key={side}
                          className="w-full rounded border border-[#2a2a2a] bg-[#2a2a2a] px-1 py-0.5 text-center text-[11px] text-[#ccc] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          min={0}
                          type="number"
                          value={node[side]}
                          onChange={(e) => updateProp(side, +e.target.value)}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <ScrubInput
                    icon={
                      <svg height="14" viewBox="0 0 14 14" width="14">
                        <rect
                          fill="none"
                          height="14"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1"
                          width="14"
                          x="0"
                          y="0"
                        />
                        <rect
                          fill="currentColor"
                          height="8"
                          opacity="0.3"
                          rx="1"
                          width="8"
                          x="3"
                          y="3"
                        />
                      </svg>
                    }
                    min={0}
                    value={node.paddingTop}
                    onChange={setUniformPadding}
                    onCommit={commitUniformPadding}
                  />
                )}
                <button
                  className={`flex shrink-0 cursor-pointer items-center justify-center rounded border p-1 ${
                    showIndividualPadding || !hasUniformPadding()
                      ? "border-[#a855f7] bg-[#a855f7] text-white"
                      : "border-[#2a2a2a] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
                  }`}
                  title="Individual padding"
                  onClick={() => setShowIndividualPadding(!showIndividualPadding)}
                >
                  <svg height="14" viewBox="0 0 14 14" width="14">
                    <rect
                      fill="currentColor"
                      height="4"
                      opacity="0.6"
                      rx="1"
                      width="14"
                      x="0"
                      y="0"
                    />
                    <rect
                      fill="currentColor"
                      height="14"
                      opacity="0.6"
                      rx="1"
                      width="4"
                      x="10"
                      y="0"
                    />
                    <rect
                      fill="currentColor"
                      height="4"
                      opacity="0.6"
                      rx="1"
                      width="14"
                      x="0"
                      y="10"
                    />
                    <rect
                      fill="currentColor"
                      height="14"
                      opacity="0.6"
                      rx="1"
                      width="4"
                      x="0"
                      y="0"
                    />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Clip content */}
      {node.type === "FRAME" && (
        <div className="border-b border-[#2a2a2a] px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#ccc]">
            <input
              checked={node.clipsContent}
              className="accent-[#a855f7]"
              type="checkbox"
              onChange={() =>
                actions.updateNodeWithUndo(
                  node.id,
                  { clipsContent: !node.clipsContent },
                  "Toggle clip content",
                )
              }
            />
            Clip content
          </label>
        </div>
      )}
    </>
  );
}
