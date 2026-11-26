import type {
  Action, AgentMessage, Artifact, Assignment, Attention, Bot, Brief, Command, ConnectorStatus,
  EventPayload, ExecutorSettings, FilePreview, HostMessage, Memory, Message, ModelConfig, Permissions,
  RemoteQuestion, RemoteRequest, RouteRule, Routine, Settings, Snapshot, Thread, Work,
} from "./protocol.ts";
import { CHAT_ACTIVITIES, MODEL_INPUT_MODES } from "./protocol.ts";
import { arrayOf, boolean, hasKey, isRecord, number, oneOf, recordOf, shape, string, type Guard } from "./wire-values.ts";

const strings = arrayOf(string);
const mode = oneOf("approval-required", "auto-accept-edits", "auto", "full-access");
const permissions: Guard<Permissions> = shape({ files: boolean, browser: boolean, confirmPublish: boolean, deleteFiles: boolean });
const executor: Guard<ExecutorSettings> = shape({
  thinkingLevel: oneOf("off", "minimal", "low", "medium", "high", "xhigh", "max"),
  contextWindow: number, images: boolean, projectInstructions: boolean,
});
const settingFields = {
  permissions, executor, connectedFolders: strings, debounceMs: number, foregroundMaxTurns: number, maxConcurrent: number,
};
const settings: Guard<Settings> = shape(settingFields);
const modelFields = { name: string, provider: string, model: string, api: string, baseUrl: string, apiKeyEnv: string, useCodexAuth: boolean };
const modelExtras = { inputMode: oneOf(...MODEL_INPUT_MODES) };
const modelConfig: Guard<ModelConfig> = shape({ id: string, ...modelFields, hasApiKey: boolean }, modelExtras);
const botFields = { threadId: string, shape: string, color: string, instructions: string, modelConfigId: string, folders: strings, workspace: string };
const botExtras = { pinned: boolean, pinnedAt: number, hidden: boolean, createdAt: number, maxConcurrent: number };
const bot: Guard<Bot> = shape({ id: string, name: string, ...botFields }, botExtras);
const thread: Guard<Thread> = shape({
  id: string, kind: oneOf("dm"), members: arrayOf(shape({ kind: oneOf("person", "bot"), id: string })), conversationId: string,
});
const chatImage = shape({ id: string, name: string, mimeType: oneOf("image/png", "image/jpeg", "image/webp") });
const message: Guard<Message> = shape({
  id: string, threadId: string, author: shape({ kind: oneOf("person", "bot", "system"), id: string }),
  kind: oneOf("text", "ask", "result", "notice", "work"), text: string, createdAt: number, requestId: string,
}, { replyTo: string, workId: string, workTitle: string, attentionId: string, reactions: strings, images: arrayOf(chatImage) });
const work: Guard<Work> = shape({
  id: string, ownerBotId: string, threadId: string, title: string, goal: string, criteria: strings, scope: string,
  state: oneOf("open", "ended"), phase: oneOf("queued", "running", "waiting", "review", "done", "failed", "cancelled"),
  revision: number, artifactIds: strings, progress: string, createdAt: number, updatedAt: number, reviewAttempts: number,
  sourceMessageIds: strings, cwd: string,
}, { outcome: oneOf("done", "failed", "cancelled"), parentWorkId: string, assignmentId: string, botApprovals: strings, t3RequireApproval: boolean,
  t3Project: shape({ assignee: string, id: string }), context: string });
const brief: Guard<Brief> = shape({
  workId: string, botId: string, botName: string, threadId: string, goal: string, criteria: strings, scope: string,
  cwd: string, instructions: string, model: string, provider: string, permissions, connectedFolders: strings, context: string,
}, { modelConfigId: string, t3RequireApproval: boolean, t3ProjectId: string });
const assignment: Guard<Assignment> = shape({
  id: string, workId: string, assignee: string, brief, state: oneOf("pending", "running", "ended"),
  attempt: number, inputIds: strings, createdAt: number,
}, {
  outcome: oneOf("completed", "failed", "cancelled", "interrupted"),
  sessionRef: shape({ assignee: string, id: string }, { url: string, conversationId: string, remoteCwd: string }),
  taskId: string, cursor: string,
});
const artifact: Guard<Artifact> = shape({ id: string, workId: string, name: string, createdAt: number },
  { path: string, url: string, hash: string, text: string });
const action: Guard<Action> = shape({ kind: oneOf("files", "browser", "publish", "delete", "command"), description: string },
  { path: string, content: string, destination: string });
const question: Guard<RemoteQuestion> = shape({
  id: string, question: string, options: arrayOf(shape({ label: string, value: string }, { description: string })),
}, { multiSelect: boolean, allowCustomAnswer: boolean, required: boolean, initialAnswer: string });
const questions = shape({ kind: oneOf("question"), questions: arrayOf(question) });
const approval = shape({ kind: oneOf("approval"), options: arrayOf(oneOf("批准", "拒绝")) });
const external = shape({ kind: oneOf("external") });
const remoteRequest: Guard<RemoteRequest> = (value): value is RemoteRequest =>
  questions(value) || approval(value) || external(value);
const rule: Guard<RouteRule> = shape({
  id: string, botId: string, name: string, match: shape({}, { keywords: strings, directory: string, category: string }),
  assignee: string, askFirst: boolean, enabled: boolean, confirmed: boolean,
}, { sourceMessageId: string });
const attention: Guard<Attention> = shape({
  id: string, botId: string, threadId: string, kind: oneOf("decision", "approval", "external", "rule"),
  question: string, options: strings, state: oneOf("open", "resolved"), createdAt: number,
}, { workId: string, assignmentId: string, value: string, action, rule, externalUrl: string, remoteRequest, replyPending: boolean });
const routine: Guard<Routine> = shape({ id: string, botId: string, name: string, prompt: string, enabled: boolean, nextRunAt: number },
  { intervalMs: number, lastRunAt: number });
const memory: Guard<Memory> = shape({ id: string, botId: string, text: string, sourceMessageIds: strings, revision: number });
const mcpAccessFields = { botIds: strings, allowNewBots: boolean };
const connector: Guard<ConnectorStatus> = shape({
  id: string, name: string, transport: oneOf("mcp", "acp"), builtin: boolean, description: string, available: boolean,
}, {
  reason: string, tools: number,
  dispatch: shape({ steer: boolean, cancel: boolean, reattach: boolean, permissionRelay: boolean, stream: boolean }),
  t3: shape({ runtimeMode: mode, approvalAvailable: boolean }, { grantedMode: mode, approvalReason: string, desktopLocal: boolean }),
  remoteT3: shape({ url: string, enabled: boolean, hasApprovalCredential: boolean }),
  mcp: shape({ ...mcpAccessFields, kind: oneOf("http", "stdio"), enabled: boolean, hasCredential: boolean }),
});
const chatActivity = oneOf(...CHAT_ACTIVITIES);
const snapshot: Guard<Snapshot> = shape({
  modelConfigs: arrayOf(modelConfig), defaultModelConfigId: string, bots: arrayOf(bot), threads: arrayOf(thread),
  messages: arrayOf(message), works: arrayOf(work), assignments: arrayOf(assignment), attentions: arrayOf(attention),
  artifacts: arrayOf(artifact), rules: arrayOf(rule), routines: arrayOf(routine), memories: arrayOf(memory),
  settings, connectors: arrayOf(connector), sharedFolder: string, typing: recordOf(boolean), errors: recordOf(string),
}, { chatActivity: recordOf(chatActivity) });
const textPreview = shape({ kind: oneOf("text"), text: string, truncated: boolean });
const imagePreview = shape({ kind: oneOf("image"), image: string });
const file: Guard<FilePreview> = (value): value is FilePreview => textPreview(value) || imagePreview(value);

type TaggedFields<Message extends { type: string }> = {
  [Type in Message["type"]]: Guard<Message extends infer Variant
    ? Variant extends { type: string }
      ? Type extends Variant["type"] ? Omit<Variant, "type"> : never
      : never
    : never>;
};

const modelQuery = shape({ config: shape({ id: string }, { ...modelFields, ...modelExtras }) }, { apiKey: string });
const sendFields = { botId: string, threadId: string, text: string };
const sendExtras = { replyTo: string, workId: string };
const commandFields = {
  "message.send": shape(sendFields, sendExtras),
  "message.send-images": shape({ ...sendFields, images: arrayOf(shape({ name: string, data: string })) }, sendExtras),
  "message.image": shape({ messageId: string, imageId: string }),
  "message.open-file": shape({ messageId: string, path: string }),
  "attention.reply": shape({ attentionId: string, value: string }, { answers: recordOf(strings) }),
  "work.cancel": shape({ workId: string }),
  "work.reassign": shape({ workId: string, assignee: string }, { t3ProjectId: string }),
  "artifact.preview": shape({ artifactId: string }),
  "artifact.open": shape({ artifactId: string }),
  "bot.upsert": shape({ bot: shape({ id: string, name: string }, { ...botFields, ...botExtras }) }),
  "bot.delete": shape({ botId: string }),
  "model.upsert": modelQuery,
  "model.add-many": shape({
    config: shape({ id: string, provider: string, api: string, baseUrl: string, apiKeyEnv: string, useCodexAuth: boolean }, modelExtras), models: strings,
  }, { apiKey: string }),
  "model.list": modelQuery,
  "model.test": modelQuery,
  "model.default": shape({ modelConfigId: string }),
  "model.delete": shape({ modelConfigId: string }),
  "connector.t3.configure": shape({}, { token: string, approvalCredential: string, runtimeMode: mode }),
  "connector.t3.save": shape({ name: string, runtimeMode: mode }, { connectorId: string, url: string, token: string, approvalCredential: string }),
  "connector.t3.connect": shape({ connectorId: string, enabled: boolean }),
  "connector.t3.projects": shape({ connectorId: string }),
  "connector.mcp.save": shape({ name: string, access: shape(mcpAccessFields) }, { connectorId: string, url: string, token: string }),
  "connector.mcp.connect": shape({ connectorId: string, enabled: boolean }),
  "settings.update": shape({ settings: shape({}, settingFields) }),
  "rule.upsert": shape({ rule }),
  "routine.upsert": shape({ routine }),
  "memory.upsert": shape({ memory }),
  "memory.delete": shape({ memoryId: string }),
  sync: shape({}, { threadId: string, afterSeq: number }),
} satisfies TaggedFields<Command>;

const eventFields = {
  "model.result": shape({ requestId: string, ok: boolean, message: string }, { models: strings }),
  "connector.t3.project-list": shape({ requestId: string, projects: arrayOf(shape({ id: string, workspaceRoot: string }, { title: string })) }),
  "artifact.previewed": shape({ requestId: string, file }),
  "message.image.loaded": shape({ requestId: string, file: imagePreview }),
  ready: shape({ version: (value: unknown): value is 2 => value === 2, storage: string }),
  snapshot: shape({ snapshot }),
  "thread.delta": shape({ threadId: string, messages: arrayOf(message), typing: boolean }, { error: string, chatActivity }),
  "work.updated": shape({ work }),
  "attention.opened": shape({ attention }),
  "attention.resolved": shape({ attentionId: string }),
  ack: shape({ requestId: string }),
  error: shape({ message: string }, { requestId: string }),
  fatal: shape({ message: string }),
} satisfies TaggedFields<EventPayload>;

function validCommand(value: Record<string, unknown>): value is Record<string, unknown> & HostMessage {
  return string(value.type) && hasKey(commandFields, value.type) && commandFields[value.type](value);
}

export function decodeHostMessage(value: unknown): HostMessage {
  if (!isRecord(value) || !string(value.type) || !string(value.requestId) || !value.requestId.trim() || value.requestId.length > 256) {
    throw new Error("协议 v2 要求有效 type 和 requestId");
  }
  if (!hasKey(commandFields, value.type)) throw new Error("未知的协议命令");
  if (validCommand(value)) return value;
  if (value.type === "settings.update" && isRecord(value.settings)) {
    if (value.settings.permissions !== undefined && !permissions(value.settings.permissions)) throw new Error("权限开关无效");
    if (value.settings.executor !== undefined && !executor(value.settings.executor)) throw new Error("执行器配置无效");
  }
  throw new Error(`协议命令参数无效：${value.type}`);
}

export function isAgentMessage(value: unknown): value is AgentMessage {
  return isRecord(value) && string(value.type) && number(value.seq) && Number.isSafeInteger(value.seq) &&
    value.seq >= 0 && hasKey(eventFields, value.type) && eventFields[value.type](value);
}
