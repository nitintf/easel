import { ChevronRight } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "easel-panel-sections";

// Simple external store for collapsed sections (persisted to localStorage)
let collapsedSections: Set<string> = new Set();
const listeners = new Set<() => void>();

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) collapsedSections = new Set(JSON.parse(stored) as string[]);
  } catch {
    // ignore
  }
}
loadFromStorage();

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedSections]));
  } catch {
    // ignore
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return collapsedSections;
}

function toggle(key: string) {
  const next = new Set(collapsedSections);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedSections = next;
  saveToStorage();
  for (const cb of listeners) cb();
}

/**
 * Wraps a property section with a collapsible header.
 * When collapsed, only the header label is visible.
 * When expanded, children (the actual section component) are shown.
 */
export function CollapsibleSection({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot);
  const isCollapsed = collapsed.has(id);

  const handleToggle = useCallback(() => {
    toggle(id);
  }, [id]);

  if (isCollapsed) {
    return (
      <div className="border-b border-[#2a2a2a]">
        <button
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
          onClick={handleToggle}
        >
          <ChevronRight className="size-3 text-[#888]" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#888]">
            {label}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className="absolute top-2 left-1 z-10 flex size-4 items-center justify-center rounded transition-colors hover:bg-[#2a2a2a]"
        onClick={handleToggle}
        title={`Collapse ${label}`}
      >
        <ChevronRight className="size-2.5 rotate-90 text-[#888]" />
      </button>
      {children}
    </div>
  );
}
