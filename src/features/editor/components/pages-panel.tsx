import { FileIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { getGraph, useEditorStore } from "../store/editor-store";

export function PagesPanel() {
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const sceneVersion = useEditorStore((s) => s.sceneVersion);
  const actions = useEditorStore((s) => s.actions);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const pages = useMemo(() => {
    void sceneVersion;
    return getGraph().getPages();
  }, [sceneVersion]);

  const startRename = useCallback((pageId: string) => {
    setEditingPageId(pageId);
  }, []);

  const commitRename = useCallback(
    (pageId: string, input: HTMLInputElement) => {
      if (editingPageId !== pageId) return;
      const value = input.value.trim();
      const node = getGraph().getNode(pageId);
      if (value && value !== node?.name) {
        actions.renamePage(pageId, value);
      }
      setEditingPageId(null);
    },
    [editingPageId, actions],
  );

  return (
    <div className="shrink-0 border-b border-[#2a2a2a]">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-[#888]">Pages</span>
        <button
          className="cursor-pointer rounded border-none bg-transparent px-1 text-base leading-none text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]"
          title="Add page"
          onClick={() => actions.addPage()}
        >
          +
        </button>
      </div>
      <div className="px-1 pb-1">
        {pages.map((pg) => (
          <div key={pg.id}>
            {editingPageId === pg.id ? (
              <input
                autoFocus
                className="w-full rounded border border-[#a855f7] bg-[#2a2a2a] px-2 py-1 text-xs text-[#ccc] outline-none"
                defaultValue={pg.name}
                onBlur={(e) => commitRename(pg.id, e.target as HTMLInputElement)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <button
                className={`flex w-full cursor-pointer items-center gap-1.5 rounded border-none px-2 py-1 text-left text-xs ${
                  pg.id === currentPageId
                    ? "bg-[#a855f7]/20 text-[#d8b4fe]"
                    : "bg-transparent text-[#888] hover:bg-[#ffffff08] hover:text-[#ccc]"
                }`}
                onClick={() => actions.switchPage(pg.id)}
                onDoubleClick={() => startRename(pg.id)}
              >
                <FileIcon className="size-3 shrink-0" />
                {pg.name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
