# TODOS

## editor-core unit tests
**Priority:** Medium
**What:** Add Vitest tests for SceneGraph (CRUD, hit testing, components, variables), Layout (Yoga computation), Undo (apply/undo/redo/batch), and Clipboard (Figma format round-trip).
**Why:** 25K lines of untested code. Any refactoring or feature addition risks silent regressions. editor-core is a pure library with no DOM dependency — testing it is trivially cheap.
**Where to start:** `packages/editor-core/src/__tests__/scene-graph.test.ts` — test createNode, updateNode, deleteNode, reparentNode, cloneTree, hitTest, createInstance, syncInstances, createVariable, resolveVariable.
**Effort:** ~20 min with CC
**Depends on:** Nothing

## Accessibility contrast audit
**Priority:** Medium
**What:** After implementing Phase 7 (Accessibility) from the editor improvement plan, run an automated contrast audit using axe-core or Lighthouse to catch any remaining WCAG AA contrast failures across all components.
**Why:** Manual contrast fixes target known low-contrast colors (#444, #555, #666), but there may be edge cases in hover states, disabled states, or dynamically-generated colors that only an automated tool would catch.
**Where to start:** Install `@axe-core/react` as a dev dependency, add it to the app entry point in development mode. Review all violations in the console and fix.
**Effort:** ~15 min with CC
**Depends on:** Phase 7 accessibility implementation

## Figma-style constraint pin diagram
**Priority:** Low
**What:** Replace the H/V constraint dropdown selectors in the position section with a visual pin diagram (Figma-style: 4 edges + center point, toggle pins on/off). More intuitive than dropdowns for spatial concepts.
**Why:** Dropdowns work but don't provide spatial context. A pin diagram lets users SEE which edges are constrained, making the relationship between the control and the behavior obvious.
**Where to start:** `src/features/editor/components/properties/position-section.tsx` — replace `ConstraintSelector` with a custom SVG/canvas-based pin selector component.
**Effort:** ~30 min with CC
**Depends on:** Nothing (current dropdown implementation works, this is pure UX polish)

## Multi-file tab system
**Priority:** Medium
**What:** Build a tab store that manages multiple .easel files as browser-like tabs. Open, close, switch between files. Persist last-active tab.
**Why:** The old studio had this (deleted). Current editor is single-document. Multi-file workflows needed for design system file + page files pattern, and eventually Figma import.
**Where to start:** Create `src/features/editor/store/tab-store.ts` with Zustand. Either swap the graph singleton on tab switch, or maintain `Map<tabId, SceneGraph>`. Tauri backend already has canvas file management (`src-tauri/src/commands/canvas.rs`).
**Effort:** ~30 min with CC
**Depends on:** Import migration (studio → editor-store) must be done first
