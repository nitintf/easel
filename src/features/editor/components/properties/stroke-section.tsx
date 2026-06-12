import { useMemo } from "react";

import { useNodeProps } from "../../hooks/use-node-props";
import { getGraph, getVariables, useEditorStore } from "../../store/editor-store";
import { ColorInput } from "../ui/color-input";
import { ScrubInput } from "../ui/scrub-input";

import type { Color, Stroke, Variable } from "@easel/editor-core";

export function StrokeSection() {
  const { node, actions } = useNodeProps();
  const variableVersion = useEditorStore((s) => s.variableVersion);

  const colorVariables = useMemo(() => {
    void variableVersion;
    return getGraph().getVariablesByType("COLOR");
  }, [variableVersion]);

  if (!node) return null;

  const boundStrokeVar = node.boundVariables?.["strokes.0.color"] ?? null;
  const boundVariable = boundStrokeVar ? getVariables().get(boundStrokeVar) : null;

  function updateColor(index: number, color: Color) {
    const strokes = [...node.strokes];
    strokes[index] = { ...strokes[index], color };
    actions.updateNodeWithUndo(node.id, { strokes }, "Change stroke");
    if (index === 0 && boundStrokeVar) {
      actions.unbindVariable(node.id, "strokes.0.color");
    }
  }

  function updateWeight(index: number, weight: number) {
    const strokes = [...node.strokes];
    strokes[index] = { ...strokes[index], weight };
    actions.updateNodeWithUndo(node.id, { strokes }, "Change stroke");
  }

  function add() {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0, a: 1 },
      weight: 1,
      opacity: 1,
      visible: true,
      align: "CENTER",
    };
    actions.updateNodeWithUndo(node.id, { strokes: [...node.strokes, stroke] }, "Add stroke");
  }

  function remove(index: number) {
    actions.updateNodeWithUndo(
      node.id,
      { strokes: node.strokes.filter((_: Stroke, i: number) => i !== index) },
      "Remove stroke",
    );
  }

  function bindColorVariable(variableId: string) {
    const graph = getGraph();
    const color = graph.resolveColorVariable(variableId);
    if (color && node.strokes.length > 0) {
      const strokes = [...node.strokes];
      strokes[0] = { ...strokes[0], color };
      actions.updateNodeWithUndo(node.id, { strokes }, "Bind variable");
      actions.bindVariable(node.id, "strokes.0.color", variableId);
    }
  }

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Stroke</label>
        <button
          className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
          onClick={add}
        >
          +
        </button>
      </div>
      {node.strokes.map((stroke: Stroke, i: number) => (
        <div key={i} className="group flex items-center gap-1.5 py-1">
          <ColorInput editable color={stroke.color} onUpdate={(c) => updateColor(i, c)} />
          {i === 0 && boundVariable && (
            <span className="truncate text-[10px] text-[#a855f7]">{boundVariable.name}</span>
          )}
          <div className="flex w-14 shrink-0 items-center rounded border border-[#2a2a2a] bg-[#222] px-1.5 py-0.5 text-[10px] text-[#ccc]">
            <span className="flex-1">{Math.round(stroke.opacity * 100)}</span>
          </div>
          <button
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={() => remove(i)}
          >
            -
          </button>
        </div>
      ))}
      {node.strokes.length > 0 && (
        <div className="mt-1 flex items-center gap-1.5">
          <ScrubInput
            className="w-16 flex-none"
            label="W"
            min={0}
            value={node.strokes[0].weight}
            onChange={(v) => updateWeight(0, v)}
          />
        </div>
      )}

      {/* Variable binding for stroke color */}
      {colorVariables.length > 0 && node.strokes.length > 0 && (
        <div className="mt-1.5">
          <select
            className="h-6 w-full rounded bg-[#1e1e1e] px-1.5 text-[11px] text-[#ccc] outline-none ring-inset focus:ring-1 focus:ring-[#4f8ef7]"
            value={boundStrokeVar ?? ""}
            onChange={(e) => {
              if (e.target.value) bindColorVariable(e.target.value);
              else actions.unbindVariable(node.id, "strokes.0.color");
            }}
          >
            <option value="">No variable</option>
            {colorVariables.map((v: Variable) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
