import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
} from "lucide-react";

import { useNodeProps } from "../../hooks/use-node-props";
import { ScrubInput } from "../ui/scrub-input";

import type { ConstraintType } from "@easel/editor-core";

type HAlign = "left" | "center" | "right";
type VAlign = "top" | "center" | "bottom";

export function PositionSection() {
  const { node, nodes, updateProp, commitProp, actions, graph } = useNodeProps();
  if (!node) return null;

  function alignHorizontal(align: HAlign) {
    if (nodes.length < 2) return;
    let minX = Infinity,
      maxX = -Infinity;
    for (const n of nodes) {
      const abs = graph.getAbsolutePosition(n.id);
      minX = Math.min(minX, abs.x);
      maxX = Math.max(maxX, abs.x + n.width);
    }
    for (const n of nodes) {
      const abs = graph.getAbsolutePosition(n.id);
      let targetX: number;
      if (align === "left") targetX = minX;
      else if (align === "right") targetX = maxX - n.width;
      else targetX = (minX + maxX) / 2 - n.width / 2;
      const dx = targetX - abs.x;
      actions.updateNode(n.id, { x: n.x + dx });
    }
    actions.requestRender();
  }

  function alignVertical(align: VAlign) {
    if (nodes.length < 2) return;
    let minY = Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      const abs = graph.getAbsolutePosition(n.id);
      minY = Math.min(minY, abs.y);
      maxY = Math.max(maxY, abs.y + n.height);
    }
    for (const n of nodes) {
      const abs = graph.getAbsolutePosition(n.id);
      let targetY: number;
      if (align === "top") targetY = minY;
      else if (align === "bottom") targetY = maxY - n.height;
      else targetY = (minY + maxY) / 2 - n.height / 2;
      const dy = targetY - abs.y;
      actions.updateNode(n.id, { y: n.y + dy });
    }
    actions.requestRender();
  }

  function distributeHorizontal() {
    if (nodes.length < 3) return;
    const sorted = [...nodes]
      .map((n) => ({ n, abs: graph.getAbsolutePosition(n.id) }))
      .sort((a, b) => a.abs.x - b.abs.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpace =
      last.abs.x + last.n.width - first.abs.x -
      sorted.reduce((sum, s) => sum + s.n.width, 0);
    const gap = totalSpace / (sorted.length - 1);
    let currentX = first.abs.x + first.n.width + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const s = sorted[i];
      const dx = currentX - s.abs.x;
      actions.updateNode(s.n.id, { x: s.n.x + dx });
      currentX += s.n.width + gap;
    }
    actions.requestRender();
  }

  function distributeVertical() {
    if (nodes.length < 3) return;
    const sorted = [...nodes]
      .map((n) => ({ n, abs: graph.getAbsolutePosition(n.id) }))
      .sort((a, b) => a.abs.y - b.abs.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpace =
      last.abs.y + last.n.height - first.abs.y -
      sorted.reduce((sum, s) => sum + s.n.height, 0);
    const gap = totalSpace / (sorted.length - 1);
    let currentY = first.abs.y + first.n.height + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const s = sorted[i];
      const dy = currentY - s.abs.y;
      actions.updateNode(s.n.id, { y: s.n.y + dy });
      currentY += s.n.height + gap;
    }
    actions.requestRender();
  }

  const btnClass =
    "flex size-6 cursor-pointer items-center justify-center rounded border border-[#2a2a2a] bg-[#2a2a2a] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]";

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Position</label>

      {/* Alignment buttons */}
      <div className="mb-2 flex flex-wrap gap-2">
        <div className="flex gap-0.5">
          <button className={btnClass} title="Align left" onClick={() => alignHorizontal("left")}>
            <AlignHorizontalJustifyStart className="size-3.5" />
          </button>
          <button
            className={btnClass}
            title="Align center H"
            onClick={() => alignHorizontal("center")}
          >
            <AlignHorizontalJustifyCenter className="size-3.5" />
          </button>
          <button className={btnClass} title="Align right" onClick={() => alignHorizontal("right")}>
            <AlignHorizontalJustifyEnd className="size-3.5" />
          </button>
        </div>
        <div className="flex gap-0.5">
          <button className={btnClass} title="Align top" onClick={() => alignVertical("top")}>
            <AlignVerticalJustifyStart className="size-3.5" />
          </button>
          <button
            className={btnClass}
            title="Align center V"
            onClick={() => alignVertical("center")}
          >
            <AlignVerticalJustifyCenter className="size-3.5" />
          </button>
          <button className={btnClass} title="Align bottom" onClick={() => alignVertical("bottom")}>
            <AlignVerticalJustifyEnd className="size-3.5" />
          </button>
        </div>
        {nodes.length >= 3 && (
          <div className="flex gap-0.5">
            <button className={btnClass} title="Distribute horizontal spacing" onClick={distributeHorizontal}>
              <AlignHorizontalSpaceBetween className="size-3.5" />
            </button>
            <button className={btnClass} title="Distribute vertical spacing" onClick={distributeVertical}>
              <AlignVerticalSpaceBetween className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* X / Y */}
      <div className="flex gap-1.5">
        <ScrubInput
          label="X"
          value={Math.round(node.x)}
          onChange={(v) => updateProp("x", v)}
          onCommit={(v, p) => commitProp("x", v, p)}
        />
        <ScrubInput
          label="Y"
          value={Math.round(node.y)}
          onChange={(v) => updateProp("y", v)}
          onCommit={(v, p) => commitProp("y", v, p)}
        />
      </div>

      {/* Rotation + flip */}
      <div className="mt-2 flex items-center gap-1.5">
        <ScrubInput
          className="flex-1"
          icon={<RotateCcw className="size-3" />}
          max={360}
          min={-360}
          suffix="\u00b0"
          value={Math.round(node.rotation)}
          onChange={(v) => updateProp("rotation", v)}
          onCommit={(v, p) => commitProp("rotation", v, p)}
        />
        <button
          className={btnClass}
          title="Flip horizontal"
          onClick={() => {
            actions.updateNodeWithUndo(
              node.id,
              { rotation: -node.rotation || 0 },
              "Flip horizontal",
            );
            actions.requestRender();
          }}
        >
          <FlipHorizontal className="size-3.5" />
        </button>
        <button
          className={btnClass}
          title="Flip vertical"
          onClick={() => {
            actions.updateNodeWithUndo(
              node.id,
              { rotation: (180 - node.rotation) % 360 },
              "Flip vertical",
            );
            actions.requestRender();
          }}
        >
          <FlipVertical className="size-3.5" />
        </button>
        <button
          className={btnClass}
          title="Rotate 90\u00b0"
          onClick={() => {
            actions.updateNodeWithUndo(
              node.id,
              { rotation: (node.rotation + 90) % 360 },
              "Rotate 90\u00b0",
            );
            actions.requestRender();
          }}
        >
          <RotateCw className="size-3.5" />
        </button>
      </div>

      {/* Constraints — only show for children inside a frame */}
      {node.parentId && (
        <ConstraintSelector
          horizontal={node.horizontalConstraint as ConstraintType}
          vertical={node.verticalConstraint as ConstraintType}
          onChangeH={(c) => {
            actions.updateNodeWithUndo(node.id, { horizontalConstraint: c }, "Set constraint");
            actions.requestRender();
          }}
          onChangeV={(c) => {
            actions.updateNodeWithUndo(node.id, { verticalConstraint: c }, "Set constraint");
            actions.requestRender();
          }}
        />
      )}
    </div>
  );
}

const CONSTRAINT_OPTIONS: { value: ConstraintType; label: string }[] = [
  { value: "MIN", label: "Left" },
  { value: "CENTER", label: "Center" },
  { value: "MAX", label: "Right" },
  { value: "STRETCH", label: "Stretch" },
  { value: "SCALE", label: "Scale" },
];

const CONSTRAINT_OPTIONS_V: { value: ConstraintType; label: string }[] = [
  { value: "MIN", label: "Top" },
  { value: "CENTER", label: "Center" },
  { value: "MAX", label: "Bottom" },
  { value: "STRETCH", label: "Stretch" },
  { value: "SCALE", label: "Scale" },
];

function ConstraintSelector({
  horizontal,
  vertical,
  onChangeH,
  onChangeV,
}: {
  horizontal: ConstraintType;
  vertical: ConstraintType;
  onChangeH: (c: ConstraintType) => void;
  onChangeV: (c: ConstraintType) => void;
}) {
  const selectClass =
    "h-6 rounded bg-[#1e1e1e] px-1.5 text-[11px] text-[#ccc] outline-none ring-inset focus:ring-1 focus:ring-[#4f8ef7]";

  return (
    <div className="mt-2">
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[#888]">
        Constraints
      </label>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] text-[#888]">H</span>
          <select
            className={selectClass}
            value={horizontal}
            onChange={(e) => onChangeH(e.target.value as ConstraintType)}
          >
            {CONSTRAINT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] text-[#888]">V</span>
          <select
            className={selectClass}
            value={vertical}
            onChange={(e) => onChangeV(e.target.value as ConstraintType)}
          >
            {CONSTRAINT_OPTIONS_V.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
