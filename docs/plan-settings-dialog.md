# Pigment Settings Dialog — Implementation Plan

## Problem

The current settings dialog (`studio-settings-dialog.tsx`) has a basic two-tab UI (General + AI) with **no persistence** — all values are local React state that resets on every open. The dialog needs a full redesign to become a polished, comprehensive settings hub wired to the LazyStore preference system.

---

## Design

### Layout

Replace the tabbed layout with a **left sidebar + content area** (VS Code / Figma style):

```
+---------------------------------------------------+
| Settings                                    [X]   |
+----------+----------------------------------------+
| General  |  General                               |
| Canvas   |  --------------------------------      |
| AI       |  Theme        [Dark v]                 |
| Shortcuts|  Language      [English v]             |
| About    |  Updates       [x] Check automatically |
|          |                                        |
+----------+----------------------------------------+
```

Size: `h-[85vh] w-[90vw] max-w-[800px]`

---

## Sections & Settings

### 1. General

| Setting | Type | Default | Preference Key |
|---------|------|---------|---------------|
| Theme | Select: Dark / Light / System | Dark | `theme` |
| Language | Select: English | English | `language` |
| Check for updates | Toggle | true | `checkForUpdates` |

**Theme switching:**
- Currently `index.html` has `class="dark"` hardcoded
- Implementation: toggle `document.documentElement.classList` between `dark` and `light`
- "System" mode: use `window.matchMedia("(prefers-color-scheme: dark)")` listener
- CSS variables are already defined for both themes in `index.css`

### 2. Canvas

| Setting | Type | Default | Preference Key |
|---------|------|---------|---------------|
| Snap to grid | Toggle | true | `snapToGrid` |
| Grid size | Number (1-100 px) | 10 | `gridSize` |
| Smart guides | Toggle | true | `smartGuides` |
| Auto-save | Toggle | true | `autoSave` |
| Auto-save interval | Number (1-30 s) | 2 | `autoSaveInterval` |
| Default canvas background | Color | #111111 | `defaultCanvasBg` |
| Default shape fill | Color | #d9d9d9 | `defaultShapeFill` |
| Default shape stroke | Color | #b3b3b3 | `defaultShapeStroke` |
| Default stroke width | Number (0-20 px) | 1 | `defaultStrokeWidth` |

### 3. AI & Models

| Setting | Type | Default | Preference Key |
|---------|------|---------|---------------|
| Default model | Select | Claude Sonnet 4.5 | `defaultModel` |
| Anthropic API key | Password | (empty) | `anthropicApiKey` |
| OpenAI API key | Password | (empty) | `openaiApiKey` |
| Claude Code path | File path | auto-detect | `claudeCodePath` |
| Local model | Select (from Ollama) | (none) | `localModel` |
| Max parallel agents | Number (1-10) | 3 | `maxParallelAgents` |
| System prompt | Textarea | (default prompt) | `systemPrompt` |

**API key UX:**
- Show/hide toggle for password fields
- "Test Connection" button that validates the key against the API
- Green checkmark or red X indicator after test
- Keys stored in LazyStore (Tauri app data directory, not accessible from web)

### 4. Keyboard Shortcuts

Read-only reference table grouped by category:

**Tools:**
| Shortcut | Action |
|----------|--------|
| V | Select |
| R | Rectangle |
| O | Ellipse |
| T | Text |
| F | Frame |
| H | Hand / Pan |
| L | Line |
| A | Arrow |

**Canvas:**
| Shortcut | Action |
|----------|--------|
| Cmd+C / Cmd+X / Cmd+V | Copy / Cut / Paste |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo |
| Cmd+A | Select All |
| Cmd+D | Duplicate |
| Cmd+G / Cmd+Shift+G | Group / Ungroup |
| Cmd+] / Cmd+[ | Bring Forward / Send Backward |
| Arrow keys | Nudge 1px (Shift: 10px) |
| Space (hold) | Pan |
| Cmd+Scroll | Zoom |
| Delete / Backspace | Delete selected |

**App:**
| Shortcut | Action |
|----------|--------|
| Cmd+K | Command menu |
| Cmd+, | Settings |
| Cmd+Shift+G | Gallery |
| Cmd+\\ | Toggle layers |
| Cmd+. | Toggle properties |
| Cmd+J | Toggle AI chat |

### 5. About

- **App name & version**: Pigment v0.1.0
- **Tauri version**: from `@tauri-apps/api`
- **Links:**
  - GitHub repository
  - Documentation (placeholder)
  - Report a bug (GitHub issues)
- **Credits / licenses**: brief open-source notice

---

## Persistence Layer

### `src/hooks/use-settings.ts` (new)

```typescript
interface Settings {
  theme: "dark" | "light" | "system";
  snapToGrid: boolean;
  gridSize: number;
  smartGuides: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  defaultCanvasBg: string;
  defaultShapeFill: string;
  defaultShapeStroke: string;
  defaultStrokeWidth: number;
  anthropicApiKey: string;
  openaiApiKey: string;
  claudeCodePath: string;
  defaultModel: string;
  localModel: string;
  maxParallelAgents: number;
  systemPrompt: string;
}

const DEFAULTS: Settings = { /* ... */ };

// Zustand store that loads from LazyStore on init
// Each setter calls setPreference() to persist immediately
```

### Preference Read/Write

Extend `src/lib/api/preferences.ts` with:
- `getAllPreferences()` — batch read all keys
- `setPreferences(partial: Partial<Settings>)` — batch write

---

## Files

| Action | File |
|--------|------|
| **New** | `src/hooks/use-settings.ts` |
| **Rewrite** | `src/features/studio/components/studio-settings-dialog.tsx` |
| **Modify** | `src/lib/api/preferences.ts` (batch operations) |
| **Modify** | `src/features/studio/components/studio-canvas.tsx` (read defaults from settings) |
| **Modify** | `src/index.css` (ensure both light/dark vars work) |
| **Modify** | `src/app.tsx` (apply theme class on init) |

---

## Verification

1. Open settings via Cmd+, or gear icon
2. Change theme to Light — app switches immediately
3. Change grid size — new shapes snap to new grid
4. Enter Anthropic API key, click Test Connection — shows green check
5. Close and reopen settings — all values persist
6. Restart the app entirely — settings still saved
7. Keyboard shortcuts tab shows all shortcuts correctly
8. About tab shows app version
