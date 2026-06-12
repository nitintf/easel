import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleCheck,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAgentIdentity, useChatStore, useTabChatSession } from "../store/chat-store";
import { AGENT_PROVIDERS } from "../types";

import type {
  ChatMessage,
  ToolResultContentBlock,
  ToolUseContentBlock,
} from "../types";

import { useEditorStore, getDocumentId } from "@/features/editor/store/editor-store";
import { cn } from "@/lib/utils";


/** Strip MCP tool name prefix for display */
function displayToolName(name: string): string {
  return name
    .replace(/^mcp__easel__/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Generate a friendly label for a tool call based on its name and input */
function getToolLabel(name: string, input: Record<string, unknown>): string {
  const clean = name.replace(/^mcp__easel__/, "");
  switch (clean) {
    case "create_object": {
      const type = input.type as string | undefined;
      const objName = input.name as string | undefined;
      if (objName) return objName;
      if (type) return `Creating ${type}`;
      return "Creating object";
    }
    case "update_object":
      return "Updating object";
    case "delete_objects":
      return "Deleting objects";
    case "get_canvas_state":
      return "Reading canvas";
    case "get_object":
      return "Reading object";
    case "list_easel_files":
      return "Listing files";
    case "group_objects":
      return "Grouping objects";
    case "ungroup_objects":
      return "Ungrouping";
    case "reorder_object":
      return "Reordering";
    default:
      return displayToolName(name);
  }
}

/** Truncate a string to a max length with ellipsis */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

/** Format tool input as a compact preview string */
function formatToolInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "{}";
  const parts = entries.map(([k, v]) => {
    const val = typeof v === "string" ? `"${truncate(v, 40)}"` : JSON.stringify(v);
    return `${k}: ${truncate(String(val), 60)}`;
  });
  return parts.join("\n");
}

/** Renders content blocks for an assistant message in the new UI style */
function MessageContent({ message, agentColor }: { message: ChatMessage; agentColor: string }) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const blocks = message.contentBlocks;

  if (!blocks || blocks.length === 0) {
    if (!message.content) {
      return message.isStreaming ? <StreamingCursor color={agentColor} /> : null;
    }
    return <span className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#ccc]">{message.content}</span>;
  }

  // Group consecutive tool_use + tool_result pairs, keep text blocks separate
  const groups: Array<
    | { kind: "text"; text: string }
    | { kind: "tool"; toolUse: ToolUseContentBlock; result?: ToolResultContentBlock }
  > = [];

  const toolResultMap = new Map<string, ToolResultContentBlock>();
  for (const b of blocks) {
    if (b.type === "tool_result") {
      toolResultMap.set(b.tool_use_id, b);
    }
  }

  for (const block of blocks) {
    if (block.type === "text") {
      if (block.text.trim()) {
        groups.push({ kind: "text", text: block.text });
      }
    } else if (block.type === "tool_use") {
      groups.push({
        kind: "tool",
        toolUse: block,
        result: toolResultMap.get(block.id),
      });
    }
    // tool_result blocks are consumed by the map above
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group, idx) => {
        if (group.kind === "text") {
          return (
            <span key={`text-${String(idx)}`} className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#ccc]">
              {group.text}
            </span>
          );
        }

        const { toolUse, result } = group;
        const isExpanded = expandedTools.has(toolUse.id);
        const isDone = !!result && !result.is_error;
        const isError = !!result?.is_error;
        const isPending = !result;
        const label = getToolLabel(toolUse.name, toolUse.input);

        return (
          <div
            key={toolUse.id}
            className="overflow-hidden rounded-lg"
            style={{ borderLeft: `2px solid ${agentColor}33` }}
          >
            <button
              className={cn(
                "flex w-full items-center gap-2 border border-l-0 px-3 py-2 text-left transition-colors",
                isExpanded ? "rounded-t-lg" : "rounded-r-lg",
                isDone
                  ? "border-[#333] bg-[#1a1a1a] hover:bg-[#222]"
                  : isError
                    ? "border-[#f87171]/30 bg-[#f87171]/5 hover:bg-[#f87171]/10"
                    : "border-[#333] bg-[#1a1a1a] hover:bg-[#222]",
              )}
              onClick={() => toggleTool(toolUse.id)}
            >
              <span className="flex-1 text-[11px] font-medium text-[#ccc]">{label}</span>
              {isDone && <CircleCheck className="size-3.5 flex-shrink-0 text-[#4ade80]" />}
              {isError && <CircleAlert className="size-3.5 flex-shrink-0 text-[#f87171]" />}
              {isPending && <Loader2 className="size-3.5 flex-shrink-0 animate-spin text-[#8ab4f8]" />}
              {isExpanded ? (
                <ChevronDown className="size-3 flex-shrink-0 text-[#555]" />
              ) : (
                <ChevronRight className="size-3 flex-shrink-0 text-[#555]" />
              )}
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  className="overflow-hidden border-r border-b border-[#333] bg-[#141414]"
                  exit={{ height: 0, opacity: 0 }}
                  initial={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <div className="flex flex-col gap-2 p-2.5">
                    {/* Tool input preview */}
                    {Object.keys(toolUse.input).length > 0 && (
                      <div>
                        <span className="text-[9px] font-medium uppercase tracking-wider text-[#555]">Input</span>
                        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-[#1a1a1a] p-2 text-[10px] leading-relaxed text-[#888]">
                          {formatToolInput(toolUse.input)}
                        </pre>
                      </div>
                    )}
                    {/* Tool result preview */}
                    {result && (
                      <div>
                        <span className={cn("text-[9px] font-medium uppercase tracking-wider", result.is_error ? "text-[#f87171]" : "text-[#555]")}>
                          {result.is_error ? "Error" : "Result"}
                        </span>
                        <pre className={cn(
                          "mt-1 whitespace-pre-wrap break-all rounded p-2 text-[10px] leading-relaxed",
                          result.is_error ? "bg-[#f87171]/10 text-[#f87171]" : "bg-[#1a1a1a] text-[#888]",
                        )}>
                          {truncate(result.content, 500)}
                        </pre>
                      </div>
                    )}
                    {isPending && (
                      <span className="text-[10px] italic text-[#555]">Waiting for result…</span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {message.isStreaming && <StreamingCursor color={agentColor} />}
    </div>
  );
}

function StreamingCursor({ color = "#8ab4f8" }: { color?: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex gap-0.5">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
        />
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
        />
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
        />
      </div>
    </div>
  );
}

/** Task progress list extracted from tool_use blocks */
function TaskProgressList({ message, agentColor }: { message: ChatMessage; agentColor: string }) {
  const blocks = message.contentBlocks;
  if (!blocks || blocks.length === 0) return null;

  const toolUseBlocks = blocks.filter((b): b is ToolUseContentBlock => b.type === "tool_use");
  const toolResults = new Map<string, ToolResultContentBlock>();
  for (const b of blocks) {
    if (b.type === "tool_result") {
      toolResults.set((b as ToolResultContentBlock).tool_use_id, b as ToolResultContentBlock);
    }
  }

  if (toolUseBlocks.length === 0) return null;

  const completed = toolUseBlocks.filter((t) => toolResults.has(t.id) && !toolResults.get(t.id)?.is_error).length;

  return (
    <div className="mt-2 rounded-lg border border-[#2a2a2a] bg-[#141414] p-2.5" style={{ borderLeft: `2px solid ${agentColor}33` }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Pencil className="size-3" style={{ color: agentColor }} />
          <span className="text-[10px] font-medium" style={{ color: agentColor }}>Working on it</span>
        </div>
        <span className="text-[10px] text-[#555]">{completed}/{toolUseBlocks.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {toolUseBlocks.map((tool) => {
          const result = toolResults.get(tool.id);
          const isDone = !!result && !result.is_error;
          const isError = !!result?.is_error;
          const isPending = !result;
          const label = getToolLabel(tool.name, tool.input);

          return (
            <div key={tool.id} className="flex items-center gap-2 py-0.5">
              {isDone && <CircleCheck className="size-3.5 flex-shrink-0 text-[#4ade80]" />}
              {isError && <CircleAlert className="size-3.5 flex-shrink-0 text-[#f87171]" />}
              {isPending && (
                message.isStreaming
                  ? <Circle className="size-3.5 flex-shrink-0 text-[#555]" />
                  : <CircleCheck className="size-3.5 flex-shrink-0 text-[#4ade80]" />
              )}
              <span
                className={cn(
                  "text-[11px]",
                  isDone ? "text-[#999]" : isError ? "text-[#f87171]" : isPending && message.isStreaming ? "text-[#888]" : "text-[#999]",
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const activeTabId = getDocumentId();
  const isOpen = useChatStore((s) => s.isOpen);
  const activeProvider = useChatStore((s) => s.activeProvider);
  const inputValue = useChatStore((s) => s.inputValue);
  const {
    toggleChat,
    setInputValue,
    sendMessage,
    stopAgent,
    clearMessages,
  } = useChatStore((s) => s.actions);
  const rightPanelOpen = useEditorStore((s) => s.showRightPanel);

  const { messages, agents } = useTabChatSession(activeTabId);

  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const provider = AGENT_PROVIDERS.find((p) => p.id === activeProvider) ?? AGENT_PROVIDERS[0];
  const { name: agentName, color: agentColor } = useAgentIdentity(activeTabId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${String(Math.min(el.scrollHeight, 120))}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    void sendMessage(inputValue, activeTabId, attachments);
    setAttachments([]);
  }, [inputValue, activeTabId, attachments, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStop = useCallback(() => {
    for (const agent of agents) {
      if (agent.runId && (agent.status === "thinking" || agent.status === "working")) {
        void stopAgent(activeTabId, agent.runId);
      }
    }
  }, [agents, activeTabId, stopAgent]);

  // Offset from right edge — shift left when right panel is open
  const rightOffset = rightPanelOpen ? 260 + 12 : 12;

  // Check if any agents are actively running
  const hasActiveAgents = agents.some((a) => a.status === "thinking" || a.status === "working");

  // Find the last assistant message for task progress
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <motion.div
      animate={{ right: rightOffset }}
      className="absolute bottom-3 z-20"
      transition={{ type: "tween", duration: 0.2 }}
    >
      <AnimatePresence mode="wait">
        {!isOpen ? (
          /* Collapsed mini-bar */
          <motion.button
            key="collapsed"
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 rounded-xl bg-[#191919] px-3 py-2 shadow-lg shadow-black/30 transition-colors hover:bg-[#1f1f1f]"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={toggleChat}
          >
            <Sparkles className="size-3.5 text-[#8ab4f8]" />
            <span className="text-[11px] font-medium text-[#888]">Design with AI</span>

            {agents.length > 0 && (
              <>
                <div className="h-3 w-px bg-[#333]" />
                {hasActiveAgents ? (
                  <div className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin text-[#8ab4f8]" />
                    <span className="text-[10px] text-[#8ab4f8]">Working...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Check className="size-3 text-[#4ade80]" />
                    <span className="text-[10px] text-[#4ade80]">Done</span>
                  </div>
                )}
              </>
            )}

            <ChevronUp className="size-3 text-[#555]" />
          </motion.button>
        ) : (
          /* Expanded chat panel */
          <motion.div
            key="expanded"
            animate={{ opacity: 1, y: 0 }}
            className="flex w-[380px] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#191919] shadow-2xl shadow-black/50"
            exit={{ opacity: 0, y: 20 }}
            initial={{ opacity: 0, y: 20 }}
            style={{ maxHeight: "min(560px, calc(100vh - 120px))" }}
            transition={{ type: "tween", duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-[#222] px-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3 text-[#8ab4f8]" />
                <span className="text-[11px] font-medium text-[#999]">AI Chat</span>
                {hasActiveAgents && (
                  <div className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" style={{ color: agentColor }} />
                    <span className="text-[9px]" style={{ color: agentColor }}>Working</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {hasActiveAgents && (
                  <button
                    className="flex size-5 items-center justify-center rounded bg-[#f87171]/20 text-[#f87171] transition-colors hover:bg-[#f87171]/30"
                    title="Stop"
                    onClick={handleStop}
                  >
                    <Square className="size-2.5" />
                  </button>
                )}
                <button
                  className="flex size-5 items-center justify-center rounded text-[#666] transition-colors hover:bg-[#252525] hover:text-[#999]"
                  title="New Chat"
                  onClick={() => void clearMessages(activeTabId)}
                >
                  <MessageSquarePlus className="size-3" />
                </button>
                <button
                  className="flex size-5 items-center justify-center rounded text-[#666] transition-colors hover:bg-[#252525] hover:text-[#999]"
                  title="Minimize"
                  onClick={toggleChat}
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <Sparkles className="size-5 text-[#333]" />
                  <p className="text-[11px] text-[#555]">
                    Ask anything about your design or let AI help you build.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 px-3 py-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col gap-1">
                      {msg.role === "user" ? (
                        /* User message — right-aligned bubble */
                        <div className="flex flex-row-reverse gap-2.5">
                          <div className="max-w-[85%] rounded-xl bg-[#4f8ef7] px-3 py-2 text-[12px] leading-relaxed text-white">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        /* Assistant message — left-aligned with AI label */
                        <div className="flex flex-col gap-1.5">
                          {/* AI name label */}
                          <div className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ backgroundColor: agentColor }} />
                            <span className="text-[11px] font-semibold" style={{ color: agentColor }}>{agentName}</span>
                          </div>
                          {/* Message content */}
                          <div className="ml-3.5">
                            <MessageContent message={msg} agentColor={agentColor} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Task progress list for the latest assistant message */}
                  {lastAssistantMsg && lastAssistantMsg.contentBlocks && lastAssistantMsg.contentBlocks.some((b) => b.type === "tool_use") && (
                    <TaskProgressList message={lastAssistantMsg} agentColor={agentColor} />
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="flex flex-col gap-2 border-t border-[#222] p-3">
              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((file, i) => (
                    <div
                      key={`${file.name}-${String(i)}`}
                      className="flex items-center gap-1 rounded-md bg-[#252525] px-2 py-1 text-[10px] text-[#999]"
                    >
                      <Paperclip className="size-2.5" />
                      <span className="max-w-[100px] truncate">{file.name}</span>
                      <button
                        className="ml-0.5 text-[#666] hover:text-[#999]"
                        onClick={() => removeAttachment(i)}
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className="w-full resize-none rounded-xl bg-[#222] px-3 py-2.5 pr-9 text-[12px] leading-relaxed text-[#e0e0e0] outline-none placeholder:text-[#555]"
                  placeholder="Design with AI..."
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  className={cn(
                    "absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors",
                    inputValue.trim()
                      ? "bg-[#4f8ef7] text-white hover:bg-[#3d7be5]"
                      : "text-[#555]",
                  )}
                  disabled={!inputValue.trim() || hasActiveAgents}
                  onClick={handleSend}
                >
                  <Send className="size-3" />
                </button>
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center gap-1">
                <div className="flex h-6 items-center gap-1 rounded-md px-2 text-[10px] text-[#888]">
                  <Sparkles className="size-3" />
                  <span>{provider.name}</span>
                </div>
                <div className="h-3 w-px bg-[#333]" />
                <button
                  className="flex h-6 items-center gap-1 rounded-md px-2 text-[10px] text-[#888] transition-colors hover:bg-[#252525] hover:text-[#ccc]"
                  onClick={handleFileSelect}
                >
                  <Paperclip className="size-3" />
                  <span>Attach</span>
                </button>
                <input
                  ref={fileInputRef}
                  multiple
                  className="hidden"
                  type="file"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
