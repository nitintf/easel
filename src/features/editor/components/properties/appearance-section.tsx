import { Blend, Eye, EyeOff, Radius } from "lucide-react";

import { useNodeProps } from "../../hooks/use-node-props";
import { ScrubInput } from "../ui/scrub-input";

import type { SceneNode } from "@easel/editor-core";

const CORNER_RADIUS_TYPES = new Set([
  "RECTANGLE",
  "ROUNDED_RECTANGLE",
  "FRAME",
  "COMPONENT",
  "INSTANCE",
]);

export function AppearanceSection() {
  const { node, updateProp, commitProp, actions } = useNodeProps();
  if (!node) return null;

  const hasCornerRadius = CORNER_RADIUS_TYPES.has(node.type);

  function toggleVisibility() {
    actions.updateNodeWithUndo(node.id, { visible: !node.visible }, "Toggle visibility");
    actions.requestRender();
  }

  function toggleIndependentCorners() {
    if (node.independentCorners) {
      const uniform = node.topLeftRadius;
      actions.updateNodeWithUndo(
        node.id,
        {
          independentCorners: false,
          cornerRadius: uniform,
          topLeftRadius: uniform,
          topRightRadius: uniform,
          bottomRightRadius: uniform,
          bottomLeftRadius: uniform,
        } as Partial<SceneNode>,
        "Uniform corner radius",
      );
    } else {
      actions.updateNodeWithUndo(
        node.id,
        {
          independentCorners: true,
          topLeftRadius: node.cornerRadius,
          topRightRadius: node.cornerRadius,
          bottomRightRadius: node.cornerRadius,
          bottomLeftRadius: node.cornerRadius,
        } as Partial<SceneNode>,
        "Independent corner radii",
      );
    }
  }

  function updateCornerProp(key: string, value: number) {
    actions.updateNode(node.id, { [key]: value });
  }

  function commitCornerProp(key: string, _value: number, previous: number) {
    actions.commitNodeUpdate(node.id, { [key]: previous } as Partial<SceneNode>, `Change ${key}`);
  }

  const cornerPaths = {
    topLeft: "M1 11V4a3 3 0 0 1 3-3h7",
    topRight: "M11 11V4a3 3 0 0 0-3-3H1",
    bottomLeft: "M1 1v7a3 3 0 0 0 3 3h7",
    bottomRight: "M11 1v7a3 3 0 0 1-3 3H1",
  };

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-medium uppercase tracking-wide text-[#888]">Appearance</label>
        <button
          className={`flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5 hover:bg-[#3a3a3a] ${!node.visible ? "text-[#a855f7]" : "text-[#888] hover:text-[#ccc]"}`}
          title="Toggle visibility"
          onClick={toggleVisibility}
        >
          {node.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      </div>
      <div className="flex gap-1.5">
        <ScrubInput
          icon={<Blend className="size-3" />}
          max={100}
          min={0}
          suffix="%"
          value={Math.round(node.opacity * 100)}
          onChange={(v) => updateProp("opacity", v / 100)}
          onCommit={(v, p) => commitProp("opacity", v / 100, p / 100)}
        />
        {hasCornerRadius && !node.independentCorners && (
          <ScrubInput
            icon={<Radius className="size-3" />}
            min={0}
            value={node.cornerRadius}
            onChange={(v) => updateProp("cornerRadius", v)}
            onCommit={(v, p) => commitProp("cornerRadius", v, p)}
          />
        )}
        {hasCornerRadius && (
          <button
            className={`flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded border bg-[#2a2a2a] ${
              node.independentCorners
                ? "!border-[#a855f7] !text-[#a855f7]"
                : "border-[#2a2a2a] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
            }`}
            title="Independent corner radii"
            onClick={toggleIndependentCorners}
          >
            <svg
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 12 12"
            >
              <path d="M1 4V2.5A1.5 1.5 0 0 1 2.5 1H4" />
              <path d="M8 1h1.5A2.5 2.5 0 0 1 11 3.5V5" />
              <path d="M11 8v1a2 2 0 0 1-2 2H8" />
              <path d="M4 11H3a2 2 0 0 1-2-2V8" />
            </svg>
          </button>
        )}
      </div>

      {hasCornerRadius && node.independentCorners && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(
            [
              ["topLeftRadius", cornerPaths.topLeft],
              ["topRightRadius", cornerPaths.topRight],
              ["bottomLeftRadius", cornerPaths.bottomLeft],
              ["bottomRightRadius", cornerPaths.bottomRight],
            ] as const
          ).map(([key, path]) => (
            <ScrubInput
              key={key}
              icon={
                <svg
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 12 12"
                >
                  <path d={path} />
                </svg>
              }
              min={0}
              value={node[key]}
              onChange={(v) => updateCornerProp(key, v)}
              onCommit={(v, p) => commitCornerProp(key, v, p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
