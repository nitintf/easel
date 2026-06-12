import { create } from "zustand";

import type {
  ChatMessage,
  ClaudeStreamEvent,
  ContentBlock,
  TextContentBlock,
  ToolResultContentBlock,
  ToolUseContentBlock,
} from "@/features/chat/types";

import * as claudeApi from "@/lib/api/claude";

let messageCounter = 0;

function generateMessageId(): string {
  messageCounter += 1;
  return `echat-${String(messageCounter)}-${String(Date.now())}`;
}

function generateRunId(): string {
  return `erun-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
}

/** Tools that mutate the canvas and should trigger a reload */
const MUTATING_TOOLS = new Set([
  "create_object",
  "update_object",
  "delete_objects",
  "group_objects",
  "ungroup_objects",
  "reorder_object",
  "mcp__easel__create_object",
  "mcp__easel__update_object",
  "mcp__easel__delete_objects",
  "mcp__easel__group_objects",
  "mcp__easel__ungroup_objects",
  "mcp__easel__reorder_object",
]);

function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name) || MUTATING_TOOLS.has(name.replace(/^mcp__easel__/, ""));
}

interface EditorChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeRunId: string | null;
  inputValue: string;
  actions: EditorChatActions;
}

interface EditorChatActions {
  setInputValue: (value: string) => void;
  sendMessage: (content: string, canvasId: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}

let activeCleanup: (() => void) | null = null;

export const useEditorChatStore = create<EditorChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeRunId: null,
  inputValue: "",

  actions: {
    setInputValue: (value) => set({ inputValue: value }),

    sendMessage: async (content: string, canvasId: string) => {
      if (!content.trim() || get().isStreaming) return;

      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const runId = generateRunId();
      const assistantMsgId = generateMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        contentBlocks: [],
        isStreaming: true,
      };

      set((s) => ({
        messages: [...s.messages, userMessage, assistantMessage],
        isStreaming: true,
        activeRunId: runId,
        inputValue: "",
      }));

      const unlisten = await claudeApi.onClaudeStream((event: ClaudeStreamEvent) => {
        if (event.runId !== runId) return;

        if (event.eventType === "stream_line") {
          handleStreamLine(event.data, assistantMsgId);
        } else if (event.eventType === "finished") {
          handleFinished(assistantMsgId);
          cleanup();
        } else if (event.eventType === "error") {
          handleError(event.data, assistantMsgId);
          cleanup();
        }
      });

      function cleanup() {
        unlisten();
        activeCleanup = null;
        set({ isStreaming: false, activeRunId: null });
      }

      activeCleanup = () => {
        unlisten();
        set({ isStreaming: false, activeRunId: null });
      };

      try {
        await claudeApi.startClaude({
          runId,
          prompt: content.trim(),
          canvasId,
          model: "claude-sonnet",
        });
      } catch (err) {
        handleError(String(err), assistantMsgId);
        cleanup();
      }

      function handleStreamLine(data: string, msgId: string) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return;
        }

        const eventType = parsed.type as string | undefined;

        // assistant message with content blocks
        if (eventType === "assistant") {
          const message = parsed.message as Record<string, unknown> | undefined;
          const contentArr = (message?.content ?? parsed.content) as
            | Array<Record<string, unknown>>
            | undefined;
          if (!contentArr || !Array.isArray(contentArr)) return;

          const incomingBlocks: ContentBlock[] = [];
          let incomingText = "";

          for (const block of contentArr) {
            if (block.type === "text") {
              const text = block.text as string;
              incomingText += text;
              incomingBlocks.push({ type: "text", text } as TextContentBlock);
            } else if (block.type === "tool_use") {
              incomingBlocks.push({
                type: "tool_use",
                id: block.id as string,
                name: block.name as string,
                input: (block.input ?? {}) as Record<string, unknown>,
              } as ToolUseContentBlock);
            } else if (block.type === "tool_result") {
              incomingBlocks.push({
                type: "tool_result",
                tool_use_id: (block.tool_use_id ?? block.id ?? "") as string,
                content: (block.content ?? "") as string,
                is_error: (block.is_error ?? false) as boolean,
              } as ToolResultContentBlock);
            }
          }

          if (incomingBlocks.length === 0) return;

          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== msgId) return m;
              const existing = m.contentBlocks ?? [];
              const existingToolUseIds = new Set(
                existing.filter((b): b is ToolUseContentBlock => b.type === "tool_use").map((b) => b.id),
              );
              const existingToolResultIds = new Set(
                existing.filter((b): b is ToolResultContentBlock => b.type === "tool_result").map((b) => b.tool_use_id),
              );

              const merged = [...existing];
              let hadMutating = false;
              for (const block of incomingBlocks) {
                if (block.type === "tool_use" && existingToolUseIds.has(block.id)) continue;
                if (block.type === "tool_result" && existingToolResultIds.has(block.tool_use_id)) continue;
                if (block.type === "text") {
                  const last = merged[merged.length - 1];
                  if (last?.type === "text" && last.text === block.text) continue;
                }
                merged.push(block);

                if (block.type === "tool_result") {
                  const toolUse = merged.find(
                    (b): b is ToolUseContentBlock => b.type === "tool_use" && b.id === block.tool_use_id,
                  );
                  if (toolUse && isMutatingTool(toolUse.name)) hadMutating = true;
                }
              }

              if (hadMutating) {
                queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:canvas-changed")));
              }

              const newContent = incomingText ? m.content + incomingText : m.content;
              return { ...m, content: newContent, contentBlocks: merged };
            }),
          }));
          return;
        }

        // content_block_delta — streaming text
        if (eventType === "content_block_delta") {
          const delta = parsed.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta") {
            const text = delta.text as string;
            set((s) => ({
              messages: s.messages.map((m) => {
                if (m.id !== msgId) return m;
                const blocks = [...(m.contentBlocks ?? [])];
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
                } else {
                  blocks.push({ type: "text", text });
                }
                return { ...m, content: m.content + text, contentBlocks: blocks };
              }),
            }));
          }
          return;
        }

        // content_block_start — new tool_use block
        if (eventType === "content_block_start") {
          const contentBlock = parsed.content_block as Record<string, unknown> | undefined;
          if (contentBlock?.type === "tool_use") {
            const toolBlock: ToolUseContentBlock = {
              type: "tool_use",
              id: contentBlock.id as string,
              name: contentBlock.name as string,
              input: (contentBlock.input ?? {}) as Record<string, unknown>,
            };
            set((s) => ({
              messages: s.messages.map((m) => {
                if (m.id !== msgId) return m;
                return { ...m, contentBlocks: [...(m.contentBlocks ?? []), toolBlock] };
              }),
            }));
          }
          return;
        }

        // result — final
        if (eventType === "result") {
          const resultContent = parsed.result as string | undefined;
          const subtype = parsed.subtype as string | undefined;
          if (resultContent && subtype !== "error") {
            set((s) => ({
              messages: s.messages.map((m) => {
                if (m.id !== msgId) return m;
                if (!m.contentBlocks || m.contentBlocks.length === 0) {
                  return { ...m, content: resultContent, contentBlocks: [{ type: "text" as const, text: resultContent }] };
                }
                return m;
              }),
            }));
          }
          return;
        }

        // tool_result
        if (eventType === "tool_result" || parsed.role === "tool") {
          const toolUseId = (parsed.tool_use_id ?? parsed.id) as string | undefined;
          const resultContent = parsed.content as string | undefined;
          const isError = (parsed.is_error ?? false) as boolean;

          if (toolUseId) {
            const resultBlock: ToolResultContentBlock = {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: resultContent ?? "",
              is_error: isError,
            };

            set((s) => ({
              messages: s.messages.map((m) => {
                if (m.id !== msgId) return m;
                const blocks = [...(m.contentBlocks ?? []), resultBlock];
                const toolUse = blocks.find(
                  (b): b is ToolUseContentBlock => b.type === "tool_use" && b.id === toolUseId,
                );
                if (toolUse && isMutatingTool(toolUse.name)) {
                  queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:canvas-changed")));
                }
                return { ...m, contentBlocks: blocks };
              }),
            }));
          }
        }
      }

      function handleFinished(msgId: string) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === msgId ? { ...m, isStreaming: false } : m,
          ),
        }));
        queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:canvas-changed")));
      }

      function handleError(errorMsg: string, msgId: string) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === msgId
              ? { ...m, isStreaming: false, content: m.content || `Error: ${errorMsg}` }
              : m,
          ),
        }));
      }
    },

    stopStreaming: () => {
      const { activeRunId } = get();
      if (activeRunId) {
        void claudeApi.stopClaude(activeRunId).catch(() => {});
      }
      if (activeCleanup) activeCleanup();
    },

    clearMessages: () => {
      const { activeRunId } = get();
      if (activeRunId) {
        void claudeApi.stopClaude(activeRunId).catch(() => {});
      }
      if (activeCleanup) activeCleanup();
      set({ messages: [], isStreaming: false, activeRunId: null });
    },
  },
}));
