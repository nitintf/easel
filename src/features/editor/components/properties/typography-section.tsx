import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Baseline,
  ALargeSmall,
} from "lucide-react";

import { useNodeProps } from "../../hooks/use-node-props";
import { ScrubInput } from "../ui/scrub-input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEIGHTS = [
  { value: 100, label: "Thin" },
  { value: 200, label: "ExtraLight" },
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "SemiBold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "ExtraBold" },
  { value: 900, label: "Black" },
];

type TextAlign = "LEFT" | "CENTER" | "RIGHT";

export function TypographySection() {
  const { node, updateProp, commitProp, actions } = useNodeProps();
  if (!node) return null;

  function selectWeight(weight: number) {
    actions.updateNodeWithUndo(node.id, { fontWeight: weight }, "Change font weight");
    actions.requestRender();
  }

  function setAlign(align: TextAlign) {
    actions.updateNodeWithUndo(node.id, { textAlignHorizontal: align }, "Change text alignment");
    actions.requestRender();
  }

  function toggleBold() {
    selectWeight(node.fontWeight >= 700 ? 400 : 700);
  }

  function toggleItalic() {
    actions.updateNodeWithUndo(node.id, { italic: !node.italic }, "Toggle italic");
    actions.requestRender();
  }

  function toggleDecoration(deco: "UNDERLINE" | "STRIKETHROUGH") {
    const current = node.textDecoration;
    actions.updateNodeWithUndo(
      node.id,
      { textDecoration: current === deco ? "NONE" : deco },
      `Toggle ${deco.toLowerCase()}`,
    );
    actions.requestRender();
  }

  const toggleBtnClass = (active: boolean) =>
    `flex cursor-pointer items-center justify-center rounded border px-2 py-1 ${
      active
        ? "border-[#a855f7] bg-[#a855f7] text-white"
        : "border-[#2a2a2a] bg-[#2a2a2a] text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
    }`;

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Typography</label>

      {/* Font family (text input for now) */}
      <div className="mb-2">
        <input
          className="w-full rounded border border-[#2a2a2a] bg-[#2a2a2a] px-2 py-1 text-[10px] text-[#ccc] outline-none focus:border-[#a855f7]"
          value={node.fontFamily}
          onChange={(e) => {
            actions.updateNodeWithUndo(node.id, { fontFamily: e.target.value }, "Change font");
            actions.requestRender();
          }}
        />
      </div>

      {/* Weight + Size */}
      <div className="mb-2 flex gap-1.5">
        <Select value={String(node.fontWeight)} onValueChange={(v) => selectWeight(+v)}>
          <SelectTrigger className="h-[22px] flex-1 border-[#2a2a2a] bg-[#2a2a2a] text-[10px] text-[#ccc]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#252525] border-[#2a2a2a]">
            {WEIGHTS.map((w) => (
              <SelectItem key={w.value} className="text-xs text-[#ccc]" value={String(w.value)}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ScrubInput
          className="flex-1"
          max={1000}
          min={1}
          value={node.fontSize}
          onChange={(v) => updateProp("fontSize", v)}
          onCommit={(v, p) => commitProp("fontSize", v, p)}
        />
      </div>

      {/* Line height + Letter spacing */}
      <div className="mb-2 flex gap-1.5">
        <ScrubInput
          className="flex-1"
          icon={<Baseline className="size-3" />}
          min={0}
          value={node.lineHeight ?? Math.round((node.fontSize || 14) * 1.2)}
          onChange={(v) => updateProp("lineHeight", v)}
          onCommit={(v, p) => commitProp("lineHeight", v, p)}
        />
        <ScrubInput
          className="flex-1"
          icon={<ALargeSmall className="size-3" />}
          suffix="%"
          value={node.letterSpacing}
          onChange={(v) => updateProp("letterSpacing", v)}
          onCommit={(v, p) => commitProp("letterSpacing", v, p)}
        />
      </div>

      {/* Alignment + formatting */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5">
          {(
            [
              ["LEFT", AlignLeft],
              ["CENTER", AlignCenter],
              ["RIGHT", AlignRight],
            ] as const
          ).map(([align, Icon]) => (
            <button
              key={align}
              className={toggleBtnClass(node.textAlignHorizontal === align)}
              onClick={() => setAlign(align as TextAlign)}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="flex gap-0.5">
          <button
            className={toggleBtnClass(node.fontWeight >= 700)}
            title="Bold"
            onClick={toggleBold}
          >
            <Bold className="size-3.5" />
          </button>
          <button className={toggleBtnClass(node.italic)} title="Italic" onClick={toggleItalic}>
            <Italic className="size-3.5" />
          </button>
          <button
            className={toggleBtnClass(node.textDecoration === "UNDERLINE")}
            title="Underline"
            onClick={() => toggleDecoration("UNDERLINE")}
          >
            <Underline className="size-3.5" />
          </button>
          <button
            className={toggleBtnClass(node.textDecoration === "STRIKETHROUGH")}
            title="Strikethrough"
            onClick={() => toggleDecoration("STRIKETHROUGH")}
          >
            <Strikethrough className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
