import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { ClaudeStreamEvent } from "@/features/chat/types";

export interface StartClaudeParams {
  runId: string;
  prompt: string;
  canvasId: string;
  model: string;
  sessionId?: string;
}

export function startClaude(params: StartClaudeParams): Promise<void> {
  return invoke("start_claude", {
    params: {
      runId: params.runId,
      prompt: params.prompt,
      canvasId: params.canvasId,
      model: params.model,
      sessionId: params.sessionId ?? null,
    },
  });
}

export function stopClaude(runId: string): Promise<void> {
  return invoke("stop_claude", { runId });
}

export function getCanvasPath(canvasId: string): Promise<string> {
  return invoke<string>("get_canvas_path", { canvasId });
}

export function onClaudeStream(
  callback: (event: ClaudeStreamEvent) => void,
): Promise<UnlistenFn> {
  return listen<ClaudeStreamEvent>("claude-stream", (event) => {
    callback(event.payload);
  });
}
