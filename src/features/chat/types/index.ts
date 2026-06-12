export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error";

/** A text content block from Claude's response */
export interface TextContentBlock {
  type: "text";
  text: string;
}

/** A tool use content block — Claude wants to call a tool */
export interface ToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** A tool result content block — result of a tool call */
export interface ToolResultContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

/** Payload emitted by the Tauri "claude-stream" event */
export interface ClaudeStreamEvent {
  runId: string;
  eventType: "started" | "stream_line" | "finished" | "error";
  data: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  contentBlocks?: ContentBlock[];
  isStreaming?: boolean;
}

export interface AgentRun {
  id: string;
  label: string;
  status: AgentStatus;
  message?: string;
  runId?: string;
}

/** Available AI agent providers */
export type AgentProviderId = "claude-code" | "codex" | "gemini" | "opencode" | "kiro";

export interface AgentProvider {
  id: AgentProviderId;
  name: string;
  description: string;
  status: "connected" | "not_installed" | "error";
  /** The CLI model string passed to the backend */
  model: string;
}

/** Per-tab chat session data */
export interface TabChatSession {
  messages: ChatMessage[];
  agents: AgentRun[];
  sessionId?: string;
  claudeSessionId?: string;
  agentName?: string;
  agentColor?: string;
}

export interface ChatState {
  isOpen: boolean;
  /** Chat sessions keyed by tab ID */
  tabSessions: Record<string, TabChatSession>;
  /** Active agent provider */
  activeProvider: AgentProviderId;
  inputValue: string;
  actions: ChatActions;
}

export interface ChatActions {
  toggleChat: () => void;
  setActiveProvider: (provider: AgentProviderId) => void;
  setInputValue: (value: string) => void;
  initializePreferences: () => Promise<void>;
  loadSessionForTab: (tabId: string) => Promise<void>;
  sendMessage: (content: string, tabId: string, attachments?: File[]) => Promise<void>;
  stopAgent: (tabId: string, runId: string) => Promise<void>;
  clearMessages: (tabId: string) => Promise<void>;
}

/** Detail payload for the `easel:tool-result` custom event */
export interface ToolResultEventDetail {
  toolName: string;
  toolNameFull: string;
  toolInput: Record<string, unknown>;
  resultContent: string;
  isError: boolean;
  toolUseId: string;
}

export const AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI",
    status: "connected",
    model: "claude-sonnet",
  },
  {
    id: "codex",
    name: "Codex CLI",
    description: "OpenAI GPT Codex",
    status: "not_installed",
    model: "codex",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini",
    status: "not_installed",
    model: "gemini",
  },
  {
    id: "opencode",
    name: "OpenCode CLI",
    description: "Open-source code agent",
    status: "not_installed",
    model: "opencode",
  },
  {
    id: "kiro",
    name: "Kiro CLI",
    description: "AWS Kiro agent",
    status: "not_installed",
    model: "kiro",
  },
];
