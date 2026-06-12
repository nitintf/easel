import { useMemo } from "react";

import { DEFAULT_SHAPE_FILL } from "../../constants";
import { useNodeProps } from "../../hooks/use-node-props";
import { getGraph, getVariables, useEditorStore } from "../../store/editor-store";
import { FillPicker } from "../ui/fill-picker";

import type { Fill, Variable } from "@easel/editor-core";

function fillLabel(fill: Fill): string {
  if (fill.type === "SOLID") {
    const r = Math.round(fill.color.r * 255)
      .toString(16)
      .padStart(2, "0");
    const g = Math.round(fill.color.g * 255)
      .toString(16)
      .padStart(2, "0");
    const b = Math.round(fill.color.b * 255)
      .toString(16)
      .padStart(2, "0");
    return `${r}${g}${b}`;
  }
  if (fill.type.startsWith("GRADIENT")) {
    return fill.type.replace("GRADIENT_", "");
  }
  return fill.type;
}

export function FillSection() {
  const { node, actions } = useNodeProps();
  const variableVersion = useEditorStore((s) => s.variableVersion);

  const colorVariables = useMemo(() => {
    void variableVersion;
    return getGraph().getVariablesByType("COLOR");
  }, [variableVersion]);

  if (!node) return null;

  const boundFillVar = node.boundVariables?.["fills.0.color"] ?? null;

  function updateFill(index: number, fill: Fill) {
    const fills = [...node.fills];
    fills[index] = fill;
    actions.updateNodeWithUndo(node.id, { fills }, "Change fill");
    // Unbind variable when manually changing fill color
    if (index === 0 && boundFillVar) {
      actions.unbindVariable(node.id, "fills.0.color");
    }
  }

  function add() {
    actions.updateNodeWithUndo(
      node.id,
      { fills: [...node.fills, { ...DEFAULT_SHAPE_FILL }] },
      "Add fill",
    );
  }

  function remove(index: number) {
    actions.updateNodeWithUndo(
      node.id,
      { fills: node.fills.filter((_: Fill, i: number) => i !== index) },
      "Remove fill",
    );
  }

  function bindColorVariable(variableId: string) {
    const graph = getGraph();
    const color = graph.resolveColorVariable(variableId);
    if (color && node.fills.length > 0) {
      const fills = [...node.fills];
      fills[0] = { ...fills[0], type: "SOLID", color };
      actions.updateNodeWithUndo(node.id, { fills }, "Bind variable");
      actions.bindVariable(node.id, "fills.0.color", variableId);
    }
  }

  function unbindColorVariable() {
    actions.unbindVariable(node.id, "fills.0.color");
  }

  const boundVariable = boundFillVar ? getVariables().get(boundFillVar) : null;

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Fill</label>
        <button
          className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
          onClick={add}
        >
          +
        </button>
      </div>
      {node.fills.map((fill: Fill, i: number) => (
        <div key={i} className="group flex flex-wrap items-center gap-1.5 py-1">
          <FillPicker fill={fill} onUpdate={(f) => updateFill(i, f)} />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#ccc]">
            {i === 0 && boundVariable ? (
              <span className="text-[#a855f7]">{boundVariable.name}</span>
            ) : (
              fillLabel(fill)
            )}
          </span>
          <div className="flex w-14 shrink-0 items-center rounded border border-[#2a2a2a] bg-[#222] px-1.5 py-0.5 text-[10px] text-[#ccc]">
            <span className="flex-1">{Math.round(fill.opacity * 100)}</span>
          </div>
          <button
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={() => remove(i)}
          >
            -
          </button>
        </div>
      ))}

      {/* Variable binding section */}
      {colorVariables.length > 0 && node.fills.length > 0 && (
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5">
            <select
              className="h-6 flex-1 rounded bg-[#1e1e1e] px-1.5 text-[11px] text-[#ccc] outline-none ring-inset focus:ring-1 focus:ring-[#4f8ef7]"
              value={boundFillVar ?? ""}
              onChange={(e) => {
                if (e.target.value) bindColorVariable(e.target.value);
                else unbindColorVariable();
              }}
            >
              <option value="">No variable</option>
              {colorVariables.map((v: Variable) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {boundFillVar && (
              <button
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-xs text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
                title="Unbind variable"
                onClick={unbindColorVariable}
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
