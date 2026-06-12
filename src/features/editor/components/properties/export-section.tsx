import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { getGraph, useEditorStore } from "../../store/editor-store";

import type { ExportFormat } from "@easel/editor-core";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExportSetting {
  scale: number;
  format: ExportFormat;
}

const SCALES = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
const FORMATS: ExportFormat[] = ["PNG", "JPG", "WEBP"];

export function ExportSection() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const sceneVersion = useEditorStore((s) => s.sceneVersion);
  const actions = useEditorStore((s) => s.actions);
  const [settings, setSettings] = useState<ExportSetting[]>([{ scale: 1, format: "PNG" }]);
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const nodeName = useMemo(() => {
    void sceneVersion;
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      return getGraph().getNode(id)?.name ?? "Export";
    }
    return `${selectedIds.size} layers`;
  }, [selectedIds, sceneVersion]);

  function addSetting() {
    const last = settings[settings.length - 1];
    const nextScale = SCALES.find((s) => s > (last?.scale ?? 1)) ?? 2;
    setSettings([...settings, { scale: nextScale, format: last?.format ?? "PNG" }]);
  }

  function removeSetting(index: number) {
    setSettings(settings.filter((_, i) => i !== index));
  }

  function updateSetting(index: number, changes: Partial<ExportSetting>) {
    setSettings(settings.map((s, i) => (i === index ? { ...s, ...changes } : s)));
  }

  async function doExport() {
    setExporting(true);
    try {
      for (const setting of settings) {
        await actions.exportSelection(setting.scale, setting.format);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Export</label>
        <button
          className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
          onClick={addSetting}
        >
          +
        </button>
      </div>

      {settings.map((setting, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5">
          <Select
            value={String(setting.scale)}
            onValueChange={(v) => updateSetting(i, { scale: Number(v) })}
          >
            <SelectTrigger className="h-[22px] w-16 border-[#2a2a2a] bg-[#2a2a2a] text-[9px] text-[#ccc]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#252525] border-[#2a2a2a]">
              {SCALES.map((s) => (
                <SelectItem key={s} className="text-[10px] text-[#ccc]" value={String(s)}>
                  {s}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={setting.format}
            onValueChange={(v) => updateSetting(i, { format: v as ExportFormat })}
          >
            <SelectTrigger className="h-[22px] w-16 border-[#2a2a2a] bg-[#2a2a2a] text-[9px] text-[#ccc]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#252525] border-[#2a2a2a]">
              {FORMATS.map((f) => (
                <SelectItem key={f} className="text-[10px] text-[#ccc]" value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={() => removeSetting(i)}
          >
            -
          </button>
        </div>
      ))}

      {settings.length > 0 && (
        <button
          className="mt-2 w-full cursor-pointer truncate rounded bg-[#a855f7] px-3 py-1 text-[10px] font-medium text-white hover:bg-[#9333ea] disabled:cursor-default disabled:opacity-50"
          disabled={exporting}
          onClick={() => void doExport()}
        >
          Export {nodeName}
        </button>
      )}

      {settings.length > 0 && (
        <button
          className="mt-1 flex w-full cursor-pointer items-center gap-1 rounded border-none bg-transparent px-0 py-1 text-[10px] text-[#888] hover:text-[#ccc]"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Preview
        </button>
      )}

      {showPreview && (
        <div className="mt-1 rounded border border-[#2a2a2a] px-3 py-2 text-[11px] text-[#888]">
          Preview not available yet
        </div>
      )}
    </div>
  );
}
