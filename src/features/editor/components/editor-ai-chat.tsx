import {
  ArrowUp,
  Loader2,
  Square as StopIcon,
  X,
  Wrench,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { useEditorStore } from "../store/editor-store";
import { useEditorChatStore } from "../store/editor-chat-store";

import type { ContentBlock, ToolResultContentBlock } from "@/features/chat/types";

function stripToolPrefix(name: string): string {
  return name.replace(/^mcp__easel__/, "");
}

export function EditorAiChat() {
  const toggleAiChat = useEditorStore((s) => s.actions.toggleAiChat);
  const documentName = useEditorStore((s) => s.documentName);
  const messages = useEditorChatStore((s) => s.messages);
  const isStreaming = useEditorChatStore((s) => s.isStreaming);
  const inputValue = useEditorChatStore((s) => s.inputValue);
  const { setInputValue, sendMessage, stopStreaming } = useEditorChatStore((s) => s.actions);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;
    void sendMessage(inputValue, documentName);
  }, [inputValue, isStreaming, sendMessage, documentName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Stop propagation to avoid toolbar shortcuts
      e.stopPropagation();

      if (e.key === "Escape") {
        toggleAiChat();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [toggleAiChat, handleSend],
  );

  const hasMessages = messages.length > 0;

  return (
    <div
      className="flex w-[600px] flex-col overflow-hidden rounded-xl border border-[#333] bg-[#1e1e1e]/95 shadow-2xl shadow-black/50 backdrop-blur-sm"
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Messages area — only shown when there are messages */}
      {hasMessages && (
        <div
          ref={messagesContainerRef}
          className="flex max-h-[400px] flex-col gap-2 overflow-y-auto px-3 pt-3 pb-1"
        >
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg bg-[#2e2e2e] px-3 py-2 text-[12px] leading-relaxed text-[#d4d4d4]">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Assistant message
            const blocks = msg.contentBlocks ?? [];
            const hasContent = blocks.length > 0 || msg.content;

            if (!hasContent && msg.isStreaming) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="flex items-center gap-1.5 px-1 py-1 text-[12px] text-[#888]">
                    <Loader2 className="size-3 animate-spin" />
                    Thinking...
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[90%] space-y-1">
                  {blocks.map((block, i) => (
                    <BlockRenderer key={i} block={block} allBlocks={blocks} />
                  ))}
                  {blocks.length === 0 && msg.content && (
                    <div className="text-[12px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                  {msg.isStreaming && (
                    <span className="inline-flex gap-0.5 pl-0.5">
                      <span className="size-1 animate-pulse rounded-full bg-[#a855f7]" />
                      <span className="size-1 animate-pulse rounded-full bg-[#a855f7] [animation-delay:150ms]" />
                      <span className="size-1 animate-pulse rounded-full bg-[#a855f7] [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 px-3 py-2.5">
        {/* Close button */}
        <button
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[#666] transition-colors hover:bg-[#333] hover:text-[#ccc]"
          title="Close (Esc)"
          onClick={toggleAiChat}
        >
          <X className="size-4" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="min-h-[32px] flex-1 resize-none rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-[12px] leading-relaxed text-[#d4d4d4] placeholder-[#555] outline-none"
          placeholder="Ask anything..."
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/30"
            title="Stop"
            onClick={stopStreaming}
          >
            <StopIcon className="size-3.5" />
          </button>
        ) : (
          <button
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
              inputValue.trim()
                ? "bg-[#a855f7] text-white hover:bg-[#9333ea]"
                : "bg-[#333] text-[#555]"
            }`}
            disabled={!inputValue.trim()}
            title="Send"
            onClick={handleSend}
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({ block, allBlocks }: { block: ContentBlock; allBlocks: ContentBlock[] }) {
  if (block.type === "text") {
    return (
      <div className="text-[12px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
        {block.text}
      </div>
    );
  }

  if (block.type === "tool_use") {
    const result = allBlocks.find(
      (b): b is ToolResultContentBlock => b.type === "tool_result" && b.tool_use_id === block.id,
    );
    const name = stripToolPrefix(block.name);
    const isComplete = !!result;
    const isError = result?.is_error;

    return (
      <div className="flex items-center gap-1.5 rounded-md bg-[#252525] px-2 py-1 text-[11px] text-[#888]">
        {!isComplete ? (
          <Loader2 className="size-3 animate-spin text-[#a855f7]" />
        ) : isError ? (
          <AlertCircle className="size-3 text-red-400" />
        ) : (
          <CheckCircle2 className="size-3 text-emerald-400" />
        )}
        <Wrench className="size-3" />
        <span className="truncate font-mono">{name}</span>
      </div>
    );
  }

  // tool_result blocks are rendered as part of tool_use above
  return null;
}
