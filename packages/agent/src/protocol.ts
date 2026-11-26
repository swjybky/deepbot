/** Protocol v2. JSON-only domain contracts shared by Node and the NSH projection. */
export type ReadonlyDeep<T> = T extends object ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> } : T;

export type Bot = {
  id: string;
  threadId: string;
  name: string;
  shape: string;
  color: string;
  /** Sidebar state: pinned Bots sit on top (oldest pin first); hidden ones fold into their own section. */
  pinned?: boolean;
  pinnedAt?: number;
  hidden?: boolean;
  createdAt?: number;
  instructions: string;
  modelConfigId: string;
  /** Simultaneous assignments owned by this Bot. Older snapshots may omit it. */
  maxConcurrent?: number;
  /** Project folders the Bot remembers; work about one of them runs there. */
  folders: string[];
  /** The Bot's own folder under the data root, set by the sidecar; work unrelated to a project runs here. */
  workspace: string;
};
export type Thread = {
  id: string;
  kind: "dm";
  members: { kind: "person" | "bot"; id: string }[];
  conversationId: string;
};
/** Public model settings. API keys never enter snapshots or the ledger. */
export const MODEL_API_IDS = ["openai-responses", "openai-completions", "anthropic-messages", "openai-codex-responses"] as const;
export const MODEL_INPUT_MODES = ["auto", "text", "image"] as const;
export type ModelInputMode = typeof MODEL_INPUT_MODES[number];
export type ModelConfig = {
  id: string;
  name: string;
  provider: string;
  model: string;
  api: string;
  baseUrl: string;
  apiKeyEnv: string;
  useCodexAuth: boolean;
  inputMode?: ModelInputMode;
  hasApiKey: boolean;
};
export type ModelDraft = Partial<Omit<ModelConfig, "hasApiKey">> & { id: string };
export type ModelResult = { ok: boolean; message: string; models?: string[] };
export const CHAT_IMAGE_LIMIT = 3;
export const CHAT_IMAGE_BYTES = 6 * 1024 * 1024;
export const CHAT_IMAGE_TOTAL_BYTES = 12 * 1024 * 1024;
export const CHAT_IMAGE_PIXELS = 36_000_000;
export type ChatImageUpload = { name: string; data: string };
export type ChatImage = { id: string; name: string; mimeType: string };
export type Message = {
  id: string;
  threadId: string;
  author: { kind: "person" | "bot" | "system"; id: string };
  kind: "text" | "ask" | "result" | "notice" | "work";
  text: string;
  createdAt: number;
  requestId: string;
  replyTo?: string;
  workId?: string;
  /** Title captured when the Bot sends a work delivery or a work-linked report. */
  workTitle?: string;
  attentionId?: string;
  reactions?: string[];
  images?: ChatImage[];
};
export type WorkPhase =
  | "queued"
  | "running"
  | "waiting"
  | "review"
  | "done"
  | "failed"
  | "cancelled";
export type Work = {
  id: string;
  ownerBotId: string;
  threadId: string;
  title: string;
  goal: string;
  criteria: string[];
  scope: string;
  state: "open" | "ended";
  outcome?: "done" | "failed" | "cancelled";
  phase: WorkPhase;
  revision: number;
  parentWorkId?: string;
  assignmentId?: string;
  artifactIds: string[];
  progress: string;
  botApprovals?: string[];
  t3RequireApproval?: boolean;
  t3Project?: { assignee: string; id: string };
  createdAt: number;
  updatedAt: number;
  reviewAttempts: number;
  sourceMessageIds: string[];
  /** Prior discussion context passed to the background worker. */
  context?: string;
  /** Where the work runs: a project folder of the Bot, or its workspace. */
  cwd: string;
};
export type Brief = {
  modelConfigId?: string;
  workId: string;
  botId: string;
  botName: string;
  threadId: string;
  goal: string;
  criteria: string[];
  scope: string;
  cwd: string;
  instructions: string;
  model: string;
  provider: string;
  permissions: Permissions;
  t3RequireApproval?: boolean;
  t3ProjectId?: string;
  connectedFolders: string[];
  context: string;
};
export type SessionRef = {
  assignee: string;
  id: string;
  url?: string;
  conversationId?: string;
  remoteCwd?: string;
};
export type Assignment = {
  id: string;
  workId: string;
  /** Who does the work: "self" (the Bot's own background worker) or a dispatch connector id. */
  assignee: string;
  brief: Brief;
  state: "pending" | "running" | "ended";
  outcome?: "completed" | "failed" | "cancelled" | "interrupted";
  attempt: number;
  sessionRef?: SessionRef;
  taskId?: string;
  cursor?: string;
  inputIds: string[];
  createdAt: number;
};
export type Artifact = {
  id: string;
  workId: string;
  name: string;
  path?: string;
  url?: string;
  hash?: string;
  text?: string;
  createdAt: number;
};
export type FilePreview =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "image"; image: string };
export type Report = {
  id: string;
  assignmentId: string;
  kind:
    | "progress"
    | "question"
    | "permission"
    | "artifact"
    | "ready"
    | "blocked"
    | "failed";
  text: string;
  evidence?: { path?: string; hash?: string; url?: string; text?: string }[];
  action?: Action;
  externalUrl?: string;
  remoteRequest?: RemoteRequest;
  botApproved?: boolean;
  resolvedRequests?: { reportId: string; value: string }[];
  invalidatedPermissionIds?: string[];
  createdAt: number;
};
export type Action = {
  kind: "files" | "browser" | "publish" | "delete" | "command";
  description: string;
  path?: string;
  content?: string;
  destination?: string;
};
export type RemoteQuestion = {
  id: string;
  question: string;
  options: { label: string; value: string; description?: string }[];
  multiSelect?: boolean;
  allowCustomAnswer?: boolean;
  required?: boolean;
  initialAnswer?: string;
};
export type RemoteAnswers = Record<string, string[]>;
export type RemoteRequest =
  | { kind: "question"; questions: RemoteQuestion[] }
  | { kind: "approval"; options: ("批准" | "拒绝")[] }
  | { kind: "external" };
export type Attention = {
  id: string;
  botId: string;
  threadId: string;
  workId?: string;
  assignmentId?: string;
  kind: "decision" | "approval" | "external" | "rule";
  question: string;
  options: string[];
  state: "open" | "resolved";
  value?: string;
  action?: Action;
  rule?: RouteRule;
  externalUrl?: string;
  remoteRequest?: RemoteRequest;
  replyPending?: boolean;
  createdAt: number;
};
export type RouteRule = {
  id: string;
  botId: string;
  name: string;
  match: { keywords?: string[]; directory?: string; category?: string };
  assignee: string;
  askFirst: boolean;
  enabled: boolean;
  confirmed: boolean;
  sourceMessageId?: string;
};
export type Routine = {
  id: string;
  botId: string;
  name: string;
  prompt: string;
  enabled: boolean;
  nextRunAt: number;
  intervalMs?: number;
  lastRunAt?: number;
};
export type Memory = {
  id: string;
  botId: string;
  text: string;
  sourceMessageIds: string[];
  revision: number;
};
export type Permissions = {
  files: boolean;
  browser: boolean;
  confirmPublish: boolean;
  deleteFiles: boolean;
};
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
/** How the Bot's own background worker (self) runs; T3 / ACP manage their own models. */
export type ExecutorSettings = {
  thinkingLevel: ThinkingLevel;
  /** Tokens before automatic compaction plans around; 0 follows the model. */
  contextWindow: number;
  /** Images self reads with `read` go to the model. */
  images: boolean;
  /** AGENTS.md (or CLAUDE.md) in the work folder and its parents join the instructions. */
  projectInstructions: boolean;
};
export type Settings = {
  permissions: Permissions;
  executor: ExecutorSettings;
  connectedFolders: string[];
  debounceMs: number;
  foregroundMaxTurns: number;
  /** Legacy global setting retained for protocol compatibility. Dispatch uses the Bot's limit. */
  maxConcurrent: number;
};
export type DispatchCapabilities = {
  steer: boolean;
  cancel: boolean;
  reattach: boolean;
  permissionRelay: boolean;
  stream: boolean;
};
export type T3RuntimeMode = "approval-required" | "auto-accept-edits" | "auto" | "full-access";
export type T3Project = { id: string; workspaceRoot: string; title?: string };
export type McpAccess = { botIds: string[]; allowNewBots: boolean };
/** Executors are shared. Ordinary MCP tools require a per-Bot grant. */
export type ConnectorStatus = {
  id: string;
  name: string;
  transport: "mcp" | "acp";
  builtin: boolean;
  description: string;
  available: boolean;
  reason?: string;
  /** Tools scripts can call through code mode; absent for ACP. */
  tools?: number;
  /** Present when work can be dispatched to it. */
  dispatch?: DispatchCapabilities;
  t3?: { runtimeMode: T3RuntimeMode; grantedMode?: T3RuntimeMode; approvalAvailable: boolean; approvalReason?: string; desktopLocal?: boolean };
  remoteT3?: { url: string; enabled: boolean; hasApprovalCredential: boolean };
  mcp?: McpAccess & { kind: "http" | "stdio"; enabled: boolean; hasCredential: boolean };
};
export const CHAT_ACTIVITIES = ["processing", "thinking", "tool", "dispatch", "reply"] as const;
export type ChatActivity = typeof CHAT_ACTIVITIES[number];

export type Snapshot = {
  modelConfigs: ModelConfig[];
  defaultModelConfigId: string;
  bots: Bot[];
  threads: Thread[];
  messages: Message[];
  works: Work[];
  assignments: Assignment[];
  attentions: Attention[];
  artifacts: Artifact[];
  rules: RouteRule[];
  routines: Routine[];
  memories: Memory[];
  settings: Settings;
  connectors: ConnectorStatus[];
  /** Folder every Bot shares, under the data root. */
  sharedFolder: string;
  typing: Record<string, boolean>;
  /** Present on new sidecars. A missing thread entry means the chat is idle. */
  chatActivity?: Record<string, ChatActivity>;
  errors: Record<string, string>;
};
export type Command =
  | ({
      botId: string;
      threadId: string;
      text: string;
      replyTo?: string;
      workId?: string;
    } & ({ type: "message.send" } | { type: "message.send-images"; images: ChatImageUpload[] }))
  | { type: "message.image"; messageId: string; imageId: string }
  | { type: "message.open-file"; messageId: string; path: string }
  | { type: "attention.reply"; attentionId: string; value: string; answers?: RemoteAnswers }
  | { type: "work.cancel"; workId: string }
  | { type: "work.reassign"; workId: string; assignee: string; t3ProjectId?: string }
  | { type: "artifact.preview"; artifactId: string }
  | { type: "artifact.open"; artifactId: string }
  | { type: "bot.upsert"; bot: Partial<Bot> & { id: string; name: string } }
  | { type: "bot.delete"; botId: string }
  | { type: "model.upsert"; config: ModelDraft; apiKey?: string }
  | { type: "model.add-many"; config: Omit<ModelConfig, "hasApiKey" | "name" | "model">; models: string[]; apiKey?: string }
  | { type: "model.list" | "model.test"; config: ModelDraft; apiKey?: string }
  | { type: "model.default"; modelConfigId: string }
  | { type: "model.delete"; modelConfigId: string }
  | { type: "connector.t3.configure"; token?: string; approvalCredential?: string; runtimeMode?: T3RuntimeMode }
  | { type: "connector.t3.save"; connectorId?: string; name: string; url?: string; token?: string; approvalCredential?: string; runtimeMode: T3RuntimeMode }
  | { type: "connector.t3.connect"; connectorId: string; enabled: boolean }
  | { type: "connector.t3.projects"; connectorId: string }
  | { type: "connector.mcp.save"; connectorId?: string; name: string; url?: string; token?: string; access: McpAccess }
  | { type: "connector.mcp.connect"; connectorId: string; enabled: boolean }
  | { type: "settings.update"; settings: Partial<Settings> }
  | { type: "rule.upsert"; rule: RouteRule }
  | { type: "routine.upsert"; routine: Routine }
  | { type: "memory.upsert"; memory: Memory }
  | { type: "memory.delete"; memoryId: string }
  | { type: "sync"; threadId?: string; afterSeq?: number };
export type HostMessage = Command & { requestId: string };
export type EventPayload =
  | ({ type: "model.result"; requestId: string } & ModelResult)
  | { type: "connector.t3.project-list"; requestId: string; projects: T3Project[] }
  | { type: "artifact.previewed"; requestId: string; file: FilePreview }
  | { type: "message.image.loaded"; requestId: string; file: Extract<FilePreview, { kind: "image" }> }
  | { type: "ready"; version: 2; storage: string }
  | { type: "snapshot"; snapshot: Snapshot }
  | {
      type: "thread.delta";
      threadId: string;
      messages: Message[];
      typing: boolean;
      chatActivity?: ChatActivity;
      error?: string;
    }
  | { type: "work.updated"; work: Work }
  | { type: "attention.opened"; attention: Attention }
  | { type: "attention.resolved"; attentionId: string }
  | { type: "ack"; requestId: string }
  | { type: "error"; requestId?: string; message: string }
  | { type: "fatal"; message: string };
export type AgentMessage = EventPayload & { seq: number };
