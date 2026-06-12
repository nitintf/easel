/**
 * Smoke test for @easel/editor-core integration.
 * Remove this file once confirmed working.
 */
import { SceneGraph, generateId } from "@easel/editor-core";

export function smokeTestEditorCore() {
  const sg = new SceneGraph();
  const page = sg.addPage("Test Page");
  const rect = sg.createNode("RECTANGLE", page.id, {
    name: "Test Rect",
    width: 100,
    height: 50,
  });

  console.log("[editor-core] SceneGraph smoke test:");
  console.log("  Root ID:", sg.rootId);
  console.log("  Page:", page.name, page.id);
  console.log("  Rect:", rect.name, rect.id);
  console.log("  generateId():", generateId());
  console.log("  Total nodes:", sg.nodes.size);
  console.log("[editor-core] Smoke test passed!");
}
