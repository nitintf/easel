import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface CanvasFileChangedPayload {
  canvasId: string;
}

export function watchCanvasFile(canvasId: string): Promise<void> {
  return invoke("watch_canvas_file", { canvasId });
}

export function unwatchCanvasFile(canvasId: string): Promise<void> {
  return invoke("unwatch_canvas_file", { canvasId });
}

export function onCanvasFileChanged(
  callback: (payload: CanvasFileChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<CanvasFileChangedPayload>("canvas-file-changed", (event) => {
    callback(event.payload);
  });
}
