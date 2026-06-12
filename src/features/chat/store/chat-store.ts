import { create } from "zustand";
import { useShallow } from "zustand/shallow";

import type {
  AgentProviderId,
  AgentRun,
  ChatMessage,
  ChatState,
  ClaudeStreamEvent,
  ContentBlock,
  TabChatSession,
  TextContentBlock,
  ToolResultContentBlock,
  ToolResultEventDetail,
  ToolUseContentBlock,
} from "../types";
import { AGENT_PROVIDERS } from "../types";

import { pickAgentName } from "../lib/agent-names";

import * as chatApi from "@/lib/api/chat";
import * as claudeApi from "@/lib/api/claude";
import { getPreference, setPreference } from "@/lib/api/preferences";

let messageCounter = 0;

function generateMessageId(): string {
  messageCounter += 1;
  return `msg-${String(messageCounter)}-${String(Date.now())}`;
}

function generateRunId(): string {
  return `run-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
}

const EMPTY_SESSION: TabChatSession = { messages: [], agents: [] };

function getSession(state: ChatState, tabId: string): TabChatSession {
  return state.tabSessions[tabId] ?? EMPTY_SESSION;
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

/** Strip MCP tool name prefix for display */
function stripToolPrefix(name: string): string {
  return name.replace(/^mcp__easel__/, "");
}

/** Check if a tool result is for a mutating tool */
function isMutatingToolResult(blocks: ContentBlock[], toolUseId: string): boolean {
  const toolUse = blocks.find(
    (b): b is ToolUseContentBlock => b.type === "tool_use" && b.id === toolUseId,
  );
  if (!toolUse) return false;
  return MUTATING_TOOLS.has(toolUse.name) || MUTATING_TOOLS.has(stripToolPrefix(toolUse.name));
}

/** Build a ToolResultEventDetail from the blocks array for a given tool_result */
function buildToolResultDetail(
  blocks: ContentBlock[],
  toolUseId: string,
  resultContent: string,
  isError: boolean,
): ToolResultEventDetail | null {
  const toolUse = blocks.find(
    (b): b is ToolUseContentBlock => b.type === "tool_use" && b.id === toolUseId,
  );
  if (!toolUse) return null;
  return {
    toolName: stripToolPrefix(toolUse.name),
    toolNameFull: toolUse.name,
    toolInput: toolUse.input,
    resultContent,
    isError,
    toolUseId,
  };
}

// Store active unlisten functions for cleanup
const activeListeners = new Map<string, () => void>();

// Re-entry guard to prevent recursive sendMessage calls
let isSending = false;

export const useChatStore = create<ChatState>((set, get) => ({
  isOpen: false,
  tabSessions: {},
  activeProvider: "claude-code",
  inputValue: "",

  actions: {
    toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),

    setActiveProvider: (provider: AgentProviderId) => {
      set({ activeProvider: provider });
      void setPreference("activeProvider", provider);
    },

    setInputValue: (value) => set({ inputValue: value }),

    initializePreferences: async () => {
      const provider = await getPreference<AgentProviderId>("activeProvider", "claude-code");
      set({ activeProvider: provider });
    },

    loadSessionForTab: async (tabId: string) => {
      const sessions = await chatApi.listChatSessions(tabId);
      if (sessions.length === 0) return;

      const latestSession = sessions[sessions.length - 1];
      const messageRows = await chatApi.getChatMessages(latestSession.id);

      const messages: ChatMessage[] = messageRows.map((row) => ({
        id: row.id,
        role: row.role as ChatMessage["role"],
        content: row.content,
        timestamp: new Date(row.createdAt).getTime(),
      }));

      set((s) => ({
        tabSessions: {
          ...s.tabSessions,
          [tabId]: {
            messages,
            agents: [],
            sessionId: latestSession.id,
          },
        },
      }));
    },

    sendMessage: async (content: string, tabId: string, _attachments?: File[]) => {
      if (!content.trim()) return;
      if (isSending) return;
      isSending = true;

      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const { activeProvider } = get();
      const provider = AGENT_PROVIDERS.find((p) => p.id === activeProvider) ?? AGENT_PROVIDERS[0];
      const session = getSession(get(), tabId);

      // Ensure a chat session exists in SQLite
      let sessionId = session.sessionId;
      if (!sessionId) {
        const dbSession = await chatApi.createChatSession(tabId, provider.model, "Chat");
        sessionId = dbSession.id;
      }

      // Persist user message
      void chatApi.saveChatMessage(sessionId, "user", content.trim());

      const runId = generateRunId();
      const agentId = `agent-${String(Date.now())}`;

      const agent: AgentRun = {
        id: agentId,
        label: provider.name,
        status: "thinking",
        message: `Using ${provider.name}...`,
        runId,
      };

      // Create placeholder streaming assistant message
      const assistantMsgId = generateMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        contentBlocks: [],
        isStreaming: true,
      };

      // Assign agent identity on first message for this tab
      const picked = pickAgentName(tabId);
      const agentName = session.agentName ?? picked.name;
      const agentColor = session.agentColor ?? picked.color;

      set((s) => ({
        tabSessions: {
          ...s.tabSessions,
          [tabId]: {
            ...session,
            messages: [...session.messages, userMessage, assistantMessage],
            agents: [agent],
            sessionId,
            claudeSessionId: session.claudeSessionId,
            agentName,
            agentColor,
          },
        },
        inputValue: "",
      }));

      // Set up stream listener
      const unlisten = await claudeApi.onClaudeStream((event: ClaudeStreamEvent) => {
        if (event.runId !== runId) return;

        console.log(`[claude-stream] ${event.eventType}:`, event.data?.slice(0, 300));

        if (event.eventType === "stream_line") {
          handleStreamLine(event.data, tabId, assistantMsgId, agentId);
        } else if (event.eventType === "finished") {
          handleFinished(tabId, assistantMsgId, agentId, sessionId!);
          cleanup();
        } else if (event.eventType === "error") {
          handleError(tabId, agentId, event.data);
          cleanup();
        }
      });

      function cleanup() {
        isSending = false;
        unlisten();
        activeListeners.delete(runId);
      }

      activeListeners.set(runId, cleanup);

      // Start Claude CLI
      try {
        await claudeApi.startClaude({
          runId,
          prompt: content.trim(),
          canvasId: tabId,
          model: provider.model,
          sessionId: session.claudeSessionId,
        });
      } catch (err) {
        handleError(tabId, agentId, String(err));
        cleanup();
      }

      function handleStreamLine(
        data: string,
        tabId: string,
        msgId: string,
        agentId: string,
      ) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          console.warn("[claude-stream] Failed to parse JSON:", data.slice(0, 200));
          return;
        }

        const eventType = parsed.type as string | undefined;
        const subtype = (parsed.subtype ?? "") as string;
        console.log(`[claude-stream] parsed event: type=${eventType} subtype=${subtype}`);

        // system/init — capture session_id for conversation continuity
        if (eventType === "system" && parsed.subtype === "init") {
          const sid = (parsed as Record<string, unknown>).session_id as string | undefined;
          if (sid) {
            set((s) => {
              const sess = getSession(s, tabId);
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: { ...sess, claudeSessionId: sid },
                },
              };
            });
          }
          return;
        }

        // assistant message with content blocks
        if (eventType === "assistant") {
          const message = parsed.message as Record<string, unknown> | undefined;
          const contentArr = (message?.content ?? parsed.content) as
            | Array<Record<string, unknown>>
            | undefined;
          if (!contentArr || !Array.isArray(contentArr)) return;

          set((s) => {
            const sess = getSession(s, tabId);
            return {
              tabSessions: {
                ...s.tabSessions,
                [tabId]: {
                  ...sess,
                  agents: sess.agents.map((a) =>
                    a.id === agentId
                      ? { ...a, status: "working" as const, message: "Generating..." }
                      : a,
                  ),
                },
              },
            };
          });

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
              const resultBlock: ToolResultContentBlock = {
                type: "tool_result",
                tool_use_id: (block.tool_use_id ?? block.id ?? "") as string,
                content: (block.content ?? "") as string,
                is_error: (block.is_error ?? false) as boolean,
              };
              incomingBlocks.push(resultBlock);
            }
          }

          if (incomingBlocks.length === 0) return;

          let toolResultDetail: ToolResultEventDetail | null = null;

          set((s) => {
            const sess = getSession(s, tabId);
            const msgs = sess.messages.map((m) => {
              if (m.id !== msgId) return m;

              const existing = m.contentBlocks ?? [];
              const existingToolUseIds = new Set(
                existing.filter((b): b is ToolUseContentBlock => b.type === "tool_use").map((b) => b.id),
              );
              const existingToolResultIds = new Set(
                existing.filter((b): b is ToolResultContentBlock => b.type === "tool_result").map((b) => b.tool_use_id),
              );

              const merged = [...existing];
              for (const block of incomingBlocks) {
                if (block.type === "tool_use" && existingToolUseIds.has(block.id)) continue;
                if (block.type === "tool_result" && existingToolResultIds.has(block.tool_use_id)) continue;
                if (block.type === "text") {
                  // If the last existing block is text and matches, skip duplicate
                  const last = merged[merged.length - 1];
                  if (last?.type === "text" && last.text === block.text) continue;
                }
                merged.push(block);

                // Build detail for mutating tool results (dispatched after set)
                if (block.type === "tool_result" && isMutatingToolResult(merged, block.tool_use_id)) {
                  toolResultDetail = buildToolResultDetail(merged, block.tool_use_id, block.content, block.is_error ?? false);
                }
              }

              const newContent = incomingText ? m.content + incomingText : m.content;
              return { ...m, content: newContent, contentBlocks: merged };
            });
            return {
              tabSessions: {
                ...s.tabSessions,
                [tabId]: { ...sess, messages: msgs },
              },
            };
          });

          // Dispatch tool-result with rich detail for cursor choreography
          if (toolResultDetail) {
            queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:tool-result", { detail: toolResultDetail })));
          }
          return;
        }

        // content_block_delta — streaming text updates
        if (eventType === "content_block_delta") {
          const delta = parsed.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta") {
            const text = delta.text as string;
            set((s) => {
              const sess = getSession(s, tabId);
              const msgs = sess.messages.map((m) => {
                if (m.id !== msgId) return m;
                const blocks = [...(m.contentBlocks ?? [])];
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  blocks[blocks.length - 1] = {
                    ...lastBlock,
                    text: lastBlock.text + text,
                  };
                } else {
                  blocks.push({ type: "text", text });
                }
                return { ...m, content: m.content + text, contentBlocks: blocks };
              });
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: {
                    ...sess,
                    messages: msgs,
                    agents: sess.agents.map((a) =>
                      a.id === agentId
                        ? { ...a, status: "working" as const, message: "Generating..." }
                        : a,
                    ),
                  },
                },
              };
            });
          }
          return;
        }

        // content_block_start — new block starting (tool_use)
        if (eventType === "content_block_start") {
          const contentBlock = parsed.content_block as Record<string, unknown> | undefined;
          if (contentBlock?.type === "tool_use") {
            const toolBlock: ToolUseContentBlock = {
              type: "tool_use",
              id: contentBlock.id as string,
              name: contentBlock.name as string,
              input: (contentBlock.input ?? {}) as Record<string, unknown>,
            };
            set((s) => {
              const sess = getSession(s, tabId);
              const msgs = sess.messages.map((m) => {
                if (m.id !== msgId) return m;
                return {
                  ...m,
                  contentBlocks: [...(m.contentBlocks ?? []), toolBlock],
                };
              });
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: { ...sess, messages: msgs },
                },
              };
            });
          }
          return;
        }

        // result — final result from Claude CLI
        if (eventType === "result") {
          const resultContent = parsed.result as string | undefined;
          const subtype = parsed.subtype as string | undefined;

          if (resultContent && subtype !== "error") {
            set((s) => {
              const sess = getSession(s, tabId);
              const msgs = sess.messages.map((m) => {
                if (m.id !== msgId) return m;
                if (!m.contentBlocks || m.contentBlocks.length === 0) {
                  return {
                    ...m,
                    content: resultContent,
                    contentBlocks: [{ type: "text" as const, text: resultContent }],
                  };
                }
                return m;
              });
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: { ...sess, messages: msgs },
                },
              };
            });
          }

          const resultSessionId = parsed.session_id as string | undefined;
          if (resultSessionId) {
            set((s) => {
              const sess = getSession(s, tabId);
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: { ...sess, claudeSessionId: resultSessionId },
                },
              };
            });
          }
          return;
        }

        // tool_result — result of a tool call
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

            let toolResultDetail2: ToolResultEventDetail | null = null;

            set((s) => {
              const sess = getSession(s, tabId);
              const msgs = sess.messages.map((m) => {
                if (m.id !== msgId) return m;
                const blocks = [...(m.contentBlocks ?? []), resultBlock];
                if (isMutatingToolResult(blocks, toolUseId)) {
                  toolResultDetail2 = buildToolResultDetail(blocks, toolUseId, resultContent ?? "", isError);
                }
                return { ...m, contentBlocks: blocks };
              });
              return {
                tabSessions: {
                  ...s.tabSessions,
                  [tabId]: { ...sess, messages: msgs },
                },
              };
            });

            // Dispatch tool-result with rich detail for cursor choreography
            if (toolResultDetail2) {
              queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:tool-result", { detail: toolResultDetail2 })));
            }
          }
          return;
        }
      }

      function handleFinished(
        tabId: string,
        msgId: string,
        agentId: string,
        sessionId: string,
      ) {
        set((s) => {
          const sess = getSession(s, tabId);
          const msgs = sess.messages.map((m) =>
            m.id === msgId ? { ...m, isStreaming: false } : m,
          );

          const finalMsg = msgs.find((m) => m.id === msgId);
          if (finalMsg && sessionId) {
            void chatApi.saveChatMessage(sessionId, "assistant", finalMsg.content);
          }

          return {
            tabSessions: {
              ...s.tabSessions,
              [tabId]: {
                ...sess,
                messages: msgs,
                agents: sess.agents.map((a) =>
                  a.id === agentId
                    ? { ...a, status: "done" as const, message: "Complete" }
                    : a,
                ),
              },
            },
          };
        });

        // Dispatch after set() completes to avoid re-entrant state updates
        queueMicrotask(() => window.dispatchEvent(new CustomEvent("easel:canvas-changed")));
      }

      function handleError(tabId: string, agentId: string, errorMsg: string) {
        set((s) => {
          const sess = getSession(s, tabId);
          return {
            tabSessions: {
              ...s.tabSessions,
              [tabId]: {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.isStreaming
                    ? {
                        ...m,
                        isStreaming: false,
                        content: m.content || `Error: ${errorMsg}`,
                      }
                    : m,
                ),
                agents: sess.agents.map((a) =>
                  a.id === agentId
                    ? { ...a, status: "error" as const, message: errorMsg }
                    : a,
                ),
              },
            },
          };
        });
      }
    },

    stopAgent: async (_tabId: string, runId: string) => {
      try {
        await claudeApi.stopClaude(runId);
      } catch {
        // Process may have already exited
      }
      const cleanup = activeListeners.get(runId);
      if (cleanup) cleanup();
    },

    clearMessages: async (tabId: string) => {
      const session = getSession(get(), tabId);
      if (session.sessionId) {
        await chatApi.clearChatMessages(session.sessionId);
      }
      for (const agent of session.agents) {
        if (agent.runId && (agent.status === "thinking" || agent.status === "working")) {
          try {
            await claudeApi.stopClaude(agent.runId);
          } catch {
            // ignore
          }
        }
      }
      set((s) => ({
        tabSessions: {
          ...s.tabSessions,
          [tabId]: EMPTY_SESSION,
        },
      }));
    },
  },
}));

export function useTabChatSession(tabId: string): TabChatSession {
  return useChatStore((s) => s.tabSessions[tabId] ?? EMPTY_SESSION);
}

const DEFAULT_IDENTITY = { name: "Easley", color: "#34d399" };

export function useAgentIdentity(tabId: string): { name: string; color: string } {
  return useChatStore(
    useShallow((s) => {
      const session = s.tabSessions[tabId];
      if (session?.agentName && session.agentColor) {
        return { name: session.agentName, color: session.agentColor };
      }
      // Deterministic fallback before first message
      return pickAgentName(tabId) ?? DEFAULT_IDENTITY;
    }),
  );
}
