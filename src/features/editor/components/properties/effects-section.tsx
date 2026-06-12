import { Blend, Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";

import { useNodeProps } from "../../hooks/use-node-props";
import { ColorInput } from "../ui/color-input";
import { ScrubInput } from "../ui/scrub-input";

import type { Effect } from "@easel/editor-core";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EffectType = Effect["type"];

const EFFECT_LABELS: Record<string, string> = {
  DROP_SHADOW: "Drop shadow",
  INNER_SHADOW: "Inner shadow",
  LAYER_BLUR: "Layer blur",
  BACKGROUND_BLUR: "Background blur",
  FOREGROUND_BLUR: "Foreground blur",
};

const EFFECT_TYPES = Object.keys(EFFECT_LABELS) as EffectType[];

function isShadow(type: string) {
  return type === "DROP_SHADOW" || type === "INNER_SHADOW";
}

function defaultEffect(): Effect {
  return {
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.25 },
    offset: { x: 0, y: 4 },
    radius: 4,
    spread: 0,
    visible: true,
  };
}

export function EffectsSection() {
  const { node, actions } = useNodeProps();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const effectsBeforeScrub = useRef<Effect[] | null>(null);

  if (!node) return null;

  function scrubEffect(index: number, changes: Partial<Effect>) {
    if (!effectsBeforeScrub.current) {
      effectsBeforeScrub.current = node.effects.map((e: Effect) => ({
        ...e,
        color: { ...e.color },
        offset: { ...e.offset },
      }));
    }
    const effects = [...node.effects];
    effects[index] = { ...effects[index], ...changes };
    actions.updateNode(node.id, { effects });
    actions.requestRender();
  }

  function commitEffect(index: number, changes: Partial<Effect>) {
    const previous = effectsBeforeScrub.current;
    effectsBeforeScrub.current = null;
    const effects = [...node.effects];
    effects[index] = { ...effects[index], ...changes };
    actions.updateNode(node.id, { effects });
    actions.requestRender();
    if (previous) {
      actions.commitNodeUpdate(node.id, { effects: previous }, "Change effect");
    }
  }

  function updateEffect(index: number, changes: Partial<Effect>) {
    const effects = [...node.effects];
    effects[index] = { ...effects[index], ...changes };
    actions.updateNodeWithUndo(node.id, { effects }, "Change effect");
  }

  function add() {
    const effects = [...node.effects, defaultEffect()];
    actions.updateNodeWithUndo(node.id, { effects }, "Add effect");
  }

  function remove(index: number) {
    actions.updateNodeWithUndo(
      node.id,
      { effects: node.effects.filter((_: Effect, i: number) => i !== index) },
      "Remove effect",
    );
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  }

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Effects</label>
        <button
          className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
          onClick={add}
        >
          +
        </button>
      </div>

      {node.effects.map((effect: Effect, i: number) => (
        <div key={i}>
          <div className="group flex min-w-0 flex-wrap items-center gap-1.5 py-0.5">
            {isShadow(effect.type) ? (
              <button
                className="size-5 shrink-0 cursor-pointer rounded border border-[#2a2a2a]"
                style={{
                  background: `rgba(${Math.round(effect.color.r * 255)}, ${Math.round(effect.color.g * 255)}, ${Math.round(effect.color.b * 255)}, ${effect.color.a})`,
                }}
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              />
            ) : (
              <button
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border border-[#2a2a2a] bg-[#2a2a2a]"
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              >
                <Blend className="size-3 text-[#888]" />
              </button>
            )}

            <Select
              value={effect.type}
              onValueChange={(v) => {
                const changes: Partial<Effect> = { type: v as EffectType };
                if (!isShadow(v)) {
                  changes.offset = { x: 0, y: 0 };
                  changes.spread = 0;
                } else if (!isShadow(effect.type)) {
                  changes.offset = { x: 0, y: 4 };
                  changes.spread = 0;
                }
                updateEffect(i, changes);
              }}
            >
              <SelectTrigger className="h-[22px] flex-1 border-[#2a2a2a] bg-[#2a2a2a] text-[9px] text-[#ccc]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#252525] border-[#2a2a2a]">
                {EFFECT_TYPES.map((t) => (
                  <SelectItem key={t} className="text-xs text-[#ccc]" value={t}>
                    {EFFECT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="cursor-pointer border-none bg-transparent p-0 text-[#888] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#ccc]"
              onClick={() => updateEffect(i, { visible: !effect.visible })}
            >
              {effect.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
            <button
              className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
              onClick={() => remove(i)}
            >
              -
            </button>
          </div>

          {expandedIndex === i && (
            <div className="flex flex-col gap-1.5 py-1.5">
              {isShadow(effect.type) ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <ScrubInput
                      label="X"
                      value={effect.offset.x}
                      onChange={(v) => scrubEffect(i, { offset: { ...effect.offset, x: v } })}
                      onCommit={(v) => commitEffect(i, { offset: { ...effect.offset, x: v } })}
                    />
                    <ScrubInput
                      label="Y"
                      value={effect.offset.y}
                      onChange={(v) => scrubEffect(i, { offset: { ...effect.offset, y: v } })}
                      onCommit={(v) => commitEffect(i, { offset: { ...effect.offset, y: v } })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ScrubInput
                      label="B"
                      min={0}
                      value={effect.radius}
                      onChange={(v) => scrubEffect(i, { radius: v })}
                      onCommit={(v) => commitEffect(i, { radius: v })}
                    />
                    <ScrubInput
                      label="S"
                      value={effect.spread}
                      onChange={(v) => scrubEffect(i, { spread: v })}
                      onCommit={(v) => commitEffect(i, { spread: v })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ColorInput
                      editable
                      color={effect.color}
                      onUpdate={(c) => updateEffect(i, { color: c })}
                    />
                    <ScrubInput
                      className="w-14 flex-none"
                      max={100}
                      min={0}
                      suffix="%"
                      value={Math.round(effect.color.a * 100)}
                      onChange={(v) =>
                        scrubEffect(i, {
                          color: { ...effect.color, a: Math.max(0, Math.min(1, v / 100)) },
                        })
                      }
                      onCommit={(v) =>
                        commitEffect(i, {
                          color: { ...effect.color, a: Math.max(0, Math.min(1, v / 100)) },
                        })
                      }
                    />
                  </div>
                </>
              ) : (
                <ScrubInput
                  label="B"
                  min={0}
                  value={effect.radius}
                  onChange={(v) => scrubEffect(i, { radius: v })}
                  onCommit={(v) => commitEffect(i, { radius: v })}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
