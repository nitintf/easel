import {
  ChevronDown,
  Diamond,
  Hash,
  Palette,
  Plus,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useEditorStore,
  getCollections,
  getVariables,
} from "@/features/editor/store/editor-store";

import type { VariableType, VariableValue, Color } from "@easel/editor-core";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type TokenType = "color" | "number" | "string";

const VARIABLE_TYPE_MAP: Record<TokenType, VariableType> = {
  color: "COLOR",
  number: "FLOAT",
  string: "STRING",
};

const DISPLAY_TYPE_MAP: Record<VariableType, TokenType> = {
  COLOR: "color",
  FLOAT: "number",
  STRING: "string",
  BOOLEAN: "string",
};

const TOKEN_TYPE_ICONS = {
  color: Diamond,
  number: Hash,
  string: TypeIcon,
} as const;

const TOKEN_TYPE_COLORS = {
  color: "text-[#e879a8]",
  number: "text-[#7dd3fc]",
  string: "text-[#fbbf24]",
} as const;

function colorToHex(c: Color): string {
  const r = Math.round(c.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(c.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(c.b * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

function hexToColor(hex: string): Color {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: 1,
  };
}

function formatVariableValue(value: VariableValue, type: VariableType): string {
  if (type === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
    return colorToHex(value as Color);
  }
  return String(value ?? "");
}

interface EditorThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditorThemeDialog({ open, onOpenChange }: EditorThemeDialogProps) {
  // Subscribe to variableVersion so the dialog re-renders on variable changes
  const variableVersion = useEditorStore((s) => s.variableVersion);
  const actions = useEditorStore((s) => s.actions);

  // Read collections and variables from the graph (re-read when variableVersion changes)
  const { collections, collectionList } = useMemo(() => {
    const cols = getCollections();
    return { collections: cols, collectionList: [...cols.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableVersion]);

  // Use the first collection, or null if none exist
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  const activeCollection = useMemo(() => {
    if (activeCollectionId && collections.has(activeCollectionId)) {
      return collections.get(activeCollectionId)!;
    }
    return collectionList[0] ?? null;
  }, [activeCollectionId, collections, collectionList]);

  const variables = useMemo(() => {
    if (!activeCollection) return [];
    const vars = getVariables();
    return activeCollection.variableIds
      .map((id) => vars.get(id))
      .filter((v): v is NonNullable<typeof v> => v !== undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollection, variableVersion]);

  const modes = activeCollection?.modes ?? [];

  const [editingMode, setEditingMode] = useState<string | null>(null);
  const [editingModeValue, setEditingModeValue] = useState("");
  const [editingVarName, setEditingVarName] = useState<string | null>(null);
  const [editingVarValue, setEditingVarValue] = useState("");
  const [addVariableOpen, setAddVariableOpen] = useState(false);
  const addVarRef = useRef<HTMLDivElement>(null);

  // Reset editing state when dialog closes
  useEffect(() => {
    if (!open) {
      setEditingMode(null);
      setEditingVarName(null);
      setAddVariableOpen(false);
    }
  }, [open]);

  // Close add-variable dropdown on outside click
  useEffect(() => {
    if (!addVariableOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (addVarRef.current && !addVarRef.current.contains(e.target as Node)) {
        setAddVariableOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addVariableOpen]);

  // Auto-create a default collection if none exist when dialog opens
  useEffect(() => {
    if (open && collectionList.length === 0) {
      const col = actions.createCollection("Design Tokens");
      setActiveCollectionId(col.id);
    }
  }, [open, collectionList.length, actions]);

  const handleAddMode = useCallback(() => {
    if (!activeCollection) return;
    const defaultName = `Mode ${String(modes.length + 1)}`;
    actions.addCollectionMode(activeCollection.id, defaultName);
  }, [activeCollection, modes.length, actions]);

  const handleAddVariable = useCallback(
    (type: TokenType) => {
      if (!activeCollection) return;
      const varType = VARIABLE_TYPE_MAP[type];
      const count =
        variables.filter((v) => v.type === varType).length + 1;
      const name = `${type}-${String(count)}`;
      const variable = actions.createVariable(name, varType, activeCollection.id);
      setAddVariableOpen(false);
      setEditingVarName(variable.id);
      setEditingVarValue(name);
    },
    [activeCollection, variables, actions],
  );

  const handleStartEditMode = useCallback((modeId: string, currentName: string) => {
    setEditingMode(modeId);
    setEditingModeValue(currentName);
  }, []);

  const handleFinishEditMode = useCallback(() => {
    if (editingMode && editingModeValue.trim() && activeCollection) {
      actions.renameCollectionMode(activeCollection.id, editingMode, editingModeValue.trim());
    }
    setEditingMode(null);
    setEditingModeValue("");
  }, [editingMode, editingModeValue, activeCollection, actions]);

  const handleStartEditVar = useCallback((varId: string, currentName: string) => {
    setEditingVarName(varId);
    setEditingVarValue(currentName);
  }, []);

  const handleFinishEditVar = useCallback(() => {
    if (editingVarName && editingVarValue.trim()) {
      const variable = getVariables().get(editingVarName);
      if (variable && editingVarValue.trim() !== variable.name) {
        actions.renameVariable(editingVarName, editingVarValue.trim());
      }
    }
    setEditingVarName(null);
    setEditingVarValue("");
  }, [editingVarName, editingVarValue, actions]);

  const handleSetValue = useCallback(
    (varId: string, modeId: string, rawValue: string, type: VariableType) => {
      let value: VariableValue;
      if (type === "COLOR") {
        value = hexToColor(rawValue);
      } else if (type === "FLOAT") {
        value = parseFloat(rawValue) || 0;
      } else {
        value = rawValue;
      }
      actions.setVariableValue(varId, modeId, value);
    },
    [actions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80vh] w-[480px] max-w-[90vw] gap-0 overflow-hidden rounded-xl border-[#2a2a2a] bg-[#191919] p-0 text-[#e0e0e0]"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b border-[#222] px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-[13px] font-medium text-[#e0e0e0]">
            <Palette className="size-4 text-[#a78bfa]" />
            Design Tokens
          </DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex flex-shrink-0 items-center gap-1 border-b border-[#222] px-4 py-2">
          {modes.map((mode) => (
            <div key={mode.modeId} className="group relative flex items-center gap-1">
              {editingMode === mode.modeId ? (
                <input
                  autoFocus
                  className="h-6 w-20 rounded bg-[#252525] px-2 text-[11px] text-[#e0e0e0] outline-none ring-1 ring-inset ring-[#4f8ef7]"
                  value={editingModeValue}
                  onBlur={handleFinishEditMode}
                  onChange={(e) => setEditingModeValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFinishEditMode();
                    if (e.key === "Escape") setEditingMode(null);
                  }}
                />
              ) : (
                <span
                  className="flex h-6 cursor-pointer items-center rounded bg-[#252525] px-2.5 text-[11px] text-[#b0b0b0] transition-colors hover:bg-[#2e2e2e] hover:text-[#e0e0e0]"
                  onDoubleClick={() => handleStartEditMode(mode.modeId, mode.name)}
                >
                  {mode.name}
                </span>
              )}
              <button
                className="flex size-4 items-center justify-center rounded text-[#888] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                title="Remove mode"
                onClick={() =>
                  activeCollection &&
                  actions.removeCollectionMode(activeCollection.id, mode.modeId)
                }
              >
                <Trash2 className="size-2.5" />
              </button>
            </div>
          ))}
          <button
            className="flex size-6 items-center justify-center rounded text-[#888] transition-colors hover:bg-[#252525] hover:text-[#999]"
            title="Add mode"
            onClick={handleAddMode}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* Variables table */}
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: "calc(80vh - 160px)" }}>
          {modes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10">
              <p className="text-center text-[11px] text-[#888]">
                No modes yet. Click <strong className="text-[#ccc]">+</strong> above to create
                modes like Light and Dark.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Table header */}
              <div className="sticky top-0 z-10 flex items-center gap-0 border-b border-[#222] bg-[#191919]">
                <div className="w-7 flex-shrink-0" />
                <div className="w-[120px] flex-shrink-0 px-2 py-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-[#888]">
                    Variable
                  </span>
                </div>
                {modes.map((mode) => (
                  <div key={mode.modeId} className="min-w-0 flex-1 px-2 py-1.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-[#888]">
                      {mode.name}
                    </span>
                  </div>
                ))}
                <div className="w-7 flex-shrink-0" />
              </div>

              {/* Variable rows */}
              {variables.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[#888]">
                  No variables yet. Click &quot;Add variable&quot; below.
                </div>
              ) : (
                variables.map((variable) => {
                  const displayType = DISPLAY_TYPE_MAP[variable.type];
                  const Icon = TOKEN_TYPE_ICONS[displayType];
                  const iconColor = TOKEN_TYPE_COLORS[displayType];
                  return (
                    <div
                      key={variable.id}
                      className="group flex items-center gap-0 border-b border-[#1e1e1e] transition-colors hover:bg-[#1e1e1e]"
                    >
                      {/* Type icon */}
                      <div className="flex w-7 flex-shrink-0 items-center justify-center">
                        <Icon className={cn("size-3", iconColor)} />
                      </div>

                      {/* Variable name */}
                      <div className="w-[120px] flex-shrink-0 px-2 py-1.5">
                        {editingVarName === variable.id ? (
                          <input
                            autoFocus
                            className="h-5 w-full rounded bg-[#252525] px-1 text-[10px] text-[#e0e0e0] outline-none ring-1 ring-inset ring-[#4f8ef7]"
                            value={editingVarValue}
                            onBlur={handleFinishEditVar}
                            onChange={(e) => setEditingVarValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleFinishEditVar();
                              if (e.key === "Escape") {
                                setEditingVarName(null);
                                setEditingVarValue("");
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="cursor-pointer truncate text-[10px] font-medium text-[#b0b0b0]"
                            onDoubleClick={() => handleStartEditVar(variable.id, variable.name)}
                          >
                            {variable.name}
                          </span>
                        )}
                      </div>

                      {/* Mode values */}
                      {modes.map((mode) => {
                        const rawVal = variable.valuesByMode[mode.modeId];
                        const displayVal = formatVariableValue(rawVal, variable.type);
                        return (
                          <div
                            key={mode.modeId}
                            className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5"
                          >
                            {variable.type === "COLOR" ? (
                              <div className="flex items-center gap-1.5">
                                <div className="relative">
                                  <div
                                    className="size-5 rounded border border-[#444]"
                                    style={{ backgroundColor: displayVal || "#000000" }}
                                  />
                                  <input
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    type="color"
                                    value={displayVal || "#000000"}
                                    onChange={(e) =>
                                      handleSetValue(
                                        variable.id,
                                        mode.modeId,
                                        e.target.value,
                                        variable.type,
                                      )
                                    }
                                  />
                                </div>
                                <input
                                  className="h-5 w-full min-w-0 rounded bg-[#252525] px-1 text-[9px] uppercase text-[#888] outline-none focus:ring-1 focus:ring-inset focus:ring-[#4f8ef7]"
                                  value={displayVal}
                                  onChange={(e) =>
                                    handleSetValue(
                                      variable.id,
                                      mode.modeId,
                                      e.target.value,
                                      variable.type,
                                    )
                                  }
                                />
                              </div>
                            ) : (
                              <input
                                className="h-5 w-full min-w-0 rounded bg-[#252525] px-1.5 text-[10px] text-[#888] outline-none focus:ring-1 focus:ring-inset focus:ring-[#4f8ef7]"
                                placeholder={variable.type === "FLOAT" ? "0" : "value"}
                                type={variable.type === "FLOAT" ? "number" : "text"}
                                value={displayVal}
                                onChange={(e) =>
                                  handleSetValue(
                                    variable.id,
                                    mode.modeId,
                                    e.target.value,
                                    variable.type,
                                  )
                                }
                              />
                            )}
                          </div>
                        );
                      })}

                      {/* Delete button */}
                      <div className="flex w-7 flex-shrink-0 items-center justify-center">
                        <button
                          className="flex size-4 items-center justify-center rounded text-[#888] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                          title="Remove variable"
                          onClick={() => actions.deleteVariable(variable.id)}
                        >
                          <Trash2 className="size-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer: Add variable button */}
        {modes.length > 0 && (
          <div className="flex-shrink-0 border-t border-[#222] px-4 py-2.5">
            <div ref={addVarRef} className="relative">
              <button
                className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[#252525] text-[10px] text-[#888] transition-colors hover:bg-[#2e2e2e] hover:text-[#ccc]"
                onClick={() => setAddVariableOpen(!addVariableOpen)}
              >
                <Plus className="size-3" />
                Add variable
                <ChevronDown
                  className={cn("size-3 transition-transform", addVariableOpen && "rotate-180")}
                />
              </button>

              <AnimatePresence>
                {addVariableOpen && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 right-0 z-10 mb-1 rounded-lg border border-[#2a2a2a] bg-[#252525] py-1 shadow-lg shadow-black/40"
                    exit={{ opacity: 0, y: 4 }}
                    initial={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.1 }}
                  >
                    {(["color", "number", "string"] as const).map((type) => {
                      const Icon = TOKEN_TYPE_ICONS[type];
                      const color = TOKEN_TYPE_COLORS[type];
                      return (
                        <button
                          key={type}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b0b0b0] transition-colors hover:bg-[#333] hover:text-white"
                          onClick={() => handleAddVariable(type)}
                        >
                          <Icon className={cn("size-3", color)} />
                          <span className="capitalize">{type}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
