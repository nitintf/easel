import { invoke } from "@tauri-apps/api/core";

export interface CanvasMeta {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasState {
  canvasId: string;
  canvasJson: string;
  zoom: number;
  viewportTransform: string;
  themeJson?: string | null;
  updatedAt: string;
}

export function listCanvases(): Promise<CanvasMeta[]> {
  return invoke<CanvasMeta[]>("list_canvases");
}

export function createCanvas(name: string): Promise<CanvasMeta> {
  return invoke<CanvasMeta>("create_canvas", { name });
}

export function renameCanvas(id: string, name: string): Promise<void> {
  return invoke("rename_canvas", { id, name });
}

export function deleteCanvas(id: string): Promise<void> {
  return invoke("delete_canvas", { id });
}

export function getCanvasState(canvasId: string): Promise<CanvasState | null> {
  return invoke<CanvasState | null>("get_canvas_state", { canvasId });
}

export function importEaselFile(filePath: string): Promise<CanvasMeta> {
  return invoke<CanvasMeta>("import_easel_file", { filePath });
}

export function saveCanvasState(
  canvasId: string,
  canvasJson: string,
  zoom: number,
  viewportTransform: string,
  themeJson?: string | null,
): Promise<void> {
  return invoke("save_canvas_state", {
    canvasId,
    canvasJson,
    zoom,
    viewportTransform,
    themeJson: themeJson ?? null,
  });
}

export function saveThumbnail(canvasId: string, dataUrl: string): Promise<void> {
  return invoke("save_canvas_thumbnail", { canvasId, dataUrl });
}
