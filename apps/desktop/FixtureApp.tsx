/** Deterministic protocol peer for UI tests only. Production mounts App.tsx and the Rust transport. */
import { host, mount, openUrl, Storage } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { AppShell } from "./ui/AppShell";
import { infoTab, openModal, openWorkDetail, setInfoPanel, settingsSection } from "./ui/state/ui";
import { notify, type Feedback } from "./ui/state/feedback";
import { setAgentTransport } from "./ui/services/agent";
import { setT3DesktopOpener } from "./ui/state/t3-thread";
import type { EventPayload, HostMessage, ModelConfig, Snapshot } from "../../packages/agent/src/protocol";
import { defaultSettings, emptySnapshot } from "../../packages/agent/src/defaults";
import { decodeHostMessage } from "../../packages/agent/src/wire";
import { isRecord } from "../../packages/agent/src/wire-values";

function availableConnector(connector: Snapshot["connectors"][number], details: Pick<Snapshot["connectors"][number], "t3" | "tools">) {
 const { reason: _reason, ...status } = connector;
 return { ...status, ...details, available: true };
}

const bot = { id: "xiaocai", threadId: "dm:xiaocai", name: "小菜", shape: "flower", color: "#9EC5A7", pinned: true, instructions: "协助完成任务", modelConfigId: "default", folders: ["/tmp/deepbot-project"], workspace: "/tmp/deepbot-data/bots/xiaocai/workspace" };
const settings = { ...defaultSettings(), connectedFolders: ["/tmp/deepbot-ui"] };
const { permissions } = settings;
const initial: Snapshot = {
 ...emptySnapshot(),
 modelConfigs: [{ id: "default", name: "默认模型", provider: "openai", model: "fixture", api: "openai-responses", baseUrl: "", apiKeyEnv: "", useCodexAuth: false, hasApiKey: false }, { id: "second", name: "备用模型", provider: "openai", model: "second", api: "openai-responses", baseUrl: "", apiKeyEnv: "", useCodexAuth: false, hasApiKey: false }], defaultModelConfigId: "default",
 bots: [bot, { ...bot, id: "other", threadId: "dm:other", name: "另一个 Bot", pinned: false }], threads: [],
 messages: [{ id: "m1", threadId: bot.threadId, author: { kind: "person", id: "me" }, kind: "text", text: "整理资料", createdAt: 1, requestId: "seed", workId: "w1" }],
 works: [{ id: "w1", ownerBotId: bot.id, threadId: bot.threadId, title: "整理资料", goal: "整理资料", criteria: ["有结果"], scope: "当前目录", state: "open", phase: "running", revision: 1, artifactIds: [], progress: "正在读取", createdAt: 1, updatedAt: 1, reviewAttempts: 0, sourceMessageIds: ["m1"], assignmentId: "a1", cwd: "/tmp/deepbot-project" }],
 assignments: [{ id: "a1", workId: "w1", assignee: "self", state: "running", attempt: 1, inputIds: [], createdAt: 1,
  brief: { workId: "w1", botId: bot.id, botName: bot.name, threadId: bot.threadId, goal: "整理资料", criteria: ["有结果"],
   scope: "当前目录", cwd: "/tmp/deepbot-project", instructions: "", model: "fixture", provider: "openai",
   permissions, connectedFolders: [], context: "", modelConfigId: "default" },
 }],
 attentions: [{ id: "q1", botId: bot.id, threadId: bot.threadId, workId: "w1", kind: "approval", question: "批准发送这份结果", options: ["批准", "拒绝"], state: "open", action: { kind: "publish", description: "发送结果", content: "测试内容", destination: "测试地址" }, createdAt: 1 }],
 artifacts: [], rules: [], routines: [], memories: [], typing: { [bot.threadId]: true }, errors: {},
 settings,
 connectors: [{ id: "t3code", name: "T3 Code", transport: "mcp", builtin: true, description: "本机 T3 Code", available: false, reason: "T3 Code MCP HTTP 401，密钥无效或缺失", dispatch: { steer: false, cancel: true, reattach: true, permissionRelay: false, stream: false } }, { id: "github", name: "GitHub", transport: "mcp", builtin: false, description: "", available: true, tools: 42, mcp: { kind: "http", enabled: true, hasCredential: false, botIds: ["xiaocai"], allowNewBots: false } }],
 sharedFolder: "/tmp/deepbot-data/shared"
};
let snapshot = initial;
if (host.params.longCards) snapshot = { ...snapshot,
 works: snapshot.works.map(w => ({ ...w, title: "整理资料：用于检查长文卡片标题截断与展开的完整标题", goal: "目标第一段：整理公开资料\n目标第二段：核对关键结论\n目标第三段：保留完整原文\n目标第四段：不要遗漏结尾", criteria: ["完整验收标准"], progress: "进度第一行：已开始\n进度第二行：正在整理\n进度第三行：已核对来源\n进度第四行：完整进度结尾" })),
 artifacts: [{ id: "long-artifact", workId: "w1", name: "资料产物", text: "产物第一行\n产物第二行\n产物第三行\n产物第四行：完整产物结尾", createdAt: 1 }],
 attentions: snapshot.attentions.map(a => ({ ...a, question: "提问第一行：请确认整理方案\n提问第二行：需要核对来源\n提问第三行：请查看动作全文", action: { kind: "publish", description: "发布资料", destination: "测试位置", content: "动作第一行\n动作第二行\n动作第三行：完整动作结尾" } }))
};
if (typeof host.params.botColor === "string") snapshot = { ...snapshot, bots: snapshot.bots.map((b) => ({ ...b, color: host.params.botColor as string })) };
if (host.params.choiceCards) snapshot = { ...snapshot, typing: {}, attentions: [...snapshot.attentions, { id: "q2", botId: bot.id, threadId: bot.threadId, kind: "decision", question: "你现在还在推进水产设计和智能体迁移吗？", options: ["是，正在推进", "已完成", "遇到卡点", "已转做其他任务"], state: "open", createdAt: 2 }] };
if (host.params.t3Cards) {
 const base = { botId: bot.id, threadId: bot.threadId, workId: "w1", assignmentId: "a1", state: "open" as const, createdAt: 2 };
 snapshot = { ...snapshot, typing: {}, attentions: host.params.t3Cards === "before"
   ? [1, 2, 3, 4].map(index => ({ ...base, id: `t3-legacy-${index}`, kind: "external", question: "等你 · 去 T3 Code 回答或批准", options: ["已在对方那边确认"] }))
   : [
     { ...base, id: "t3-approval", kind: "approval", question: "T3 Code 请求执行命令", options: ["批准", "拒绝"],
       action: { kind: "command", description: "执行命令", content: "git push origin release" }, remoteRequest: { kind: "approval", options: ["批准", "拒绝"] } },
     { ...base, id: "t3-question", kind: "decision", question: "T3 Code 有几个问题要确认", options: [], remoteRequest: { kind: "question", questions: [
       { id: "branch", question: "本次验收用哪个分支？", options: [{label: "开发分支", value: "dev"}, {label: "发布分支", value: "release"}], allowCustomAnswer: false },
       { id: "tests", question: "要运行哪些本地检查？", options: [{label: "类型检查", value: "check"}, {label: "界面测试", value: "ui"}], multiSelect: true, allowCustomAnswer: false },
     ] } },
   ] };
}
if (host.params.t3ThreadLink === true || typeof host.params.t3ThreadLink === "string") {
 const url = typeof host.params.t3ThreadLink === "string" ? host.params.t3ThreadLink : "https://app.t3.codes/threads/test-environment/mcp%3Atest-thread";
 const assignee = host.params.t3RemoteLink ? "t3-remote-test" : "t3code";
 const sessionRef = { id: "a1", assignee, url, conversationId: typeof host.params.t3ThreadId === "string" ? host.params.t3ThreadId : "mcp:test-thread" };
 snapshot = { ...snapshot, typing: {}, connectors: snapshot.connectors.map(connector => connector.id === "t3code"
   ? { ...connector, t3: { runtimeMode: "full-access", approvalAvailable: false, desktopLocal: !host.params.t3NonlocalEndpoint } } : connector),
   assignments: snapshot.assignments.map(assignment => ({
   ...assignment, assignee, ...(!host.params.t3UnmappedLink ? { sessionRef } : {}),
 })), attentions: [{ id: "t3-link", botId: bot.id, threadId: bot.threadId, workId: "w1", assignmentId: "a1",
   question: "请在 T3 Code 处理待回复请求", kind: "external", state: "open", options: [], createdAt: 2,
   remoteRequest: { kind: "external" }, externalUrl: url,
 }, { id: "ordinary-link", botId: bot.id, threadId: bot.threadId, question: "查看外部页面", kind: "external",
   state: "open", options: [], createdAt: 3, externalUrl: "https://example.com/article",
 }] };
}
if (host.params.t3Connections) snapshot = { ...snapshot, typing: {}, connectors: snapshot.connectors.map(connector => connector.id === "t3code"
 ? availableConnector(connector, { t3: { runtimeMode: "full-access", grantedMode: "full-access", approvalAvailable: true } }) : connector) };
if (host.params.floatingHeader) snapshot = { ...snapshot, attentions: [], typing: {}, messages: Array.from({ length: 14 }, (_, index) => ({ id: `floating-${index}`, threadId: bot.threadId, author: { kind: "bot" as const, id: bot.id }, kind: "text" as const, text: `第 ${index + 1} 条对话\n这是用于核对悬浮效果的对话文本。滚动时，消息从 Bot 胶囊下方经过，图标和名称保持在顶部。\n\n页面优化完成后，检查胶囊周围仍能看到消息内容。`, createdAt: index + 1, requestId: `floating-${index}` })) };
if (host.params.botConfiguration) snapshot = { ...snapshot, modelConfigs: snapshot.modelConfigs.map(c => c.id === "default" ? { ...c, name: "deepseek/deepseek-flash · 专用模型配置" } : c) };
if (host.params.panelActions) snapshot = { ...snapshot,
 artifacts: [{ id: "file-artifact", workId: "w1", name: "资料汇总.md", path: "/tmp/deepbot-project/资料汇总.md", createdAt: 1 }, { id: "link-artifact", workId: "w1", name: "参考链接", url: "https://nsh.dev", createdAt: 2 }],
 routines: [{ id: "r1", botId: bot.id, name: "每日整理", prompt: "整理资料", enabled: true, nextRunAt: 0 }],
 memories: [{ id: "mem1", botId: bot.id, text: "用中文回复", sourceMessageIds: [], revision: 1 }, { id: "mem-other", botId: "other", text: "另一个 Bot 的记忆", sourceMessageIds: [], revision: 1 }]
};
if (typeof host.params.previewImage === "string") snapshot = { ...snapshot, artifacts: [
 ...snapshot.artifacts,
 { id: "image-artifact", workId: "w1", name: "封面.png", path: "/tmp/deepbot-project/封面.png", createdAt: 3 },
] };
if (host.params.singleModel) snapshot = { ...snapshot, modelConfigs: snapshot.modelConfigs.slice(0, 1) };
if (host.params.modelInUse) snapshot = { ...snapshot, assignments: snapshot.assignments.map(a => ({ ...a, brief: { ...a.brief, modelConfigId: "second" } })) };
let seq = 0;
const queue: (string | null)[] = [];
let receive: ((line: string | null) => void) | undefined;
function pushLine(line: string | null) {
 if (receive) { const next = receive; receive = undefined; next(line); } else queue.push(line);
}
function push(event: EventPayload | null) {
 pushLine(event === null ? null : JSON.stringify({ ...event, seq: ++seq }));
}
const commands: HostMessage[] = [];
let failNext = false;
let failModel = false;
host.on("info-panel", (open) => setInfoPanel(Boolean(open)));
host.on("fail-model", () => { failModel = true; });
host.on("feedback", (value) => { const entry = value as Feedback; notify(entry.level, entry.message); });
host.on("fail-next", () => { failNext = true; });
host.on("agent", (event) => { if (isRecord(event)) pushLine(JSON.stringify({ ...event, seq: ++seq })); });
host.on("refresh-snapshot", () => push({ type: "snapshot", snapshot }));
host.on("disconnect", () => push(null));
host.on("fatal", () => push({ type: "fatal", message: "后台进程已退出，请重新连接" }));
setAgentTransport({
 start() { if (!host.params.noReady) { push({ type: "ready", version: 2, storage: "fixture" }); push({ type: "snapshot", snapshot }); } },
 next() { return queue.length ? Promise.resolve(queue.shift()!) : new Promise((resolve) => { receive = resolve; }); },
 send(line) {
  const command = decodeHostMessage(JSON.parse(line)); commands.push(command); void Storage.setItem("commands", JSON.stringify(commands));
  if (command.type === "message.open-file") {
   push({ type: "ack", requestId: command.requestId });
   return;
  }
  if (command.type === "artifact.preview") {
   const { requestId } = command;
   if (command.artifactId === "image-artifact" && typeof host.params.previewImage === "string") {
    push({ type: "artifact.previewed", requestId, file: { kind: "image", image: host.params.previewImage } });
   } else if (command.artifactId === "file-artifact" && typeof host.params.previewText === "string") {
    push({ type: "artifact.previewed", requestId, file: { kind: "text", text: host.params.previewText, truncated: false } });
   } else {
    push({ type: "error", requestId, message: "找不到文件" });
   }
   return;
  }
  if (command.type === "model.list" || command.type === "model.test") {
   if (failModel) { failModel = false; push({ type: "model.result", requestId: command.requestId, ok: false, message: "拉取失败，可手动填写模型 ID" }); push({ type: "ack", requestId: command.requestId }); return; }
   push({ type: "model.result", requestId: command.requestId, ok: true, message: command.type === "model.list" ? "已拉取 2 个模型" : "连接成功，模型已返回响应", ...(command.type === "model.list" ? { models: ["remote-first", "remote-second"] } : {}) });
   push({ type: "ack", requestId: command.requestId }); return;
  }
  if (command.type === "message.send" && failNext) { failNext = false; throw new Error("test transport disconnected"); }
  if (command.type === "message.send") snapshot = { ...snapshot, messages: [...snapshot.messages, {
   id: command.requestId, threadId: command.threadId, author: { kind: "person", id: "me" },
   kind: "text", text: command.text, createdAt: Date.now(), requestId: command.requestId,
   ...(command.replyTo === undefined ? {} : { replyTo: command.replyTo }),
   ...(command.workId === undefined ? {} : { workId: command.workId }),
  }] };
  if (command.type === "bot.upsert") snapshot = { ...snapshot, bots: [...snapshot.bots.filter((b) => b.id !== command.bot.id), { ...bot, pinned: false, createdAt: Date.now(), ...snapshot.bots.find((b) => b.id === command.bot.id), ...command.bot, threadId: `dm:${command.bot.id}` }] };
  if (command.type === "bot.delete") snapshot = { ...snapshot, bots: snapshot.bots.filter((b) => b.id !== command.botId), messages: snapshot.messages.filter((m) => m.threadId !== `dm:${command.botId}`) };
  if (command.type === "model.default") snapshot = { ...snapshot, defaultModelConfigId: command.modelConfigId };
  if (command.type === "model.upsert") snapshot = { ...snapshot, modelConfigs: [...snapshot.modelConfigs.filter(c => c.id !== command.config.id), { ...snapshot.modelConfigs.find(c => c.id === command.config.id), ...command.config, hasApiKey: !!command.apiKey || !!snapshot.modelConfigs.find(c => c.id === command.config.id)?.hasApiKey } as ModelConfig] };
  if (command.type === "model.add-many") snapshot = { ...snapshot, modelConfigs: [...snapshot.modelConfigs, ...command.models.map((model, i) => ({ ...command.config, id: `${command.config.id}-${i + 1}`, name: model, model, hasApiKey: !!command.apiKey }))] };
  if (command.type === "model.delete") snapshot = { ...snapshot, modelConfigs: snapshot.modelConfigs.filter(c => c.id !== command.modelConfigId) };
  if (command.type === "connector.t3.configure") {
   if (command.token !== "http://localhost:13773/pair#token=ABCD2345WXYZ") {
    const message = command.token === "old-sidecar" ? "未知的协议命令" : "T3 Code MCP HTTP 401，密钥无效或缺失";
    push({ type: "error", requestId: command.requestId, message });
    return;
   }
   snapshot = { ...snapshot, connectors: snapshot.connectors.map(c => c.id === "t3code" ? availableConnector(c, { tools: 3 }) : c) };
  }
  if (command.type === "attention.reply") {
   snapshot = { ...snapshot, attentions: snapshot.attentions.map((a) => a.id === command.attentionId ? a.remoteRequest ? { ...a, replyPending: true } : { ...a, state: "resolved", value: command.value } : a) };
   if (host.params.t3Cards === "after") setTimeout(() => {
    const value = command.answers ? "开发分支 / 类型检查 / 界面测试" : command.value;
    snapshot = { ...snapshot, attentions: snapshot.attentions.map(a => a.id === command.attentionId ? { ...a, state: "resolved", replyPending: false, value } : a) };
    push({ type: "snapshot", snapshot });
   }, 800);
  }
  if (command.type === "settings.update") snapshot = { ...snapshot, settings: { ...snapshot.settings, ...command.settings } };
  if (command.type === "rule.upsert") snapshot = { ...snapshot, rules: [...snapshot.rules.filter(r => r.id !== command.rule.id), command.rule] };
  if (command.type === "routine.upsert") snapshot = { ...snapshot, routines: [...snapshot.routines.filter(r => r.id !== command.routine.id), command.routine] };
  if (command.type === "memory.upsert") snapshot = { ...snapshot, memories: [...snapshot.memories.filter((m) => m.id !== command.memory.id), command.memory] };
  if (command.type === "memory.delete") snapshot = { ...snapshot, memories: snapshot.memories.filter((m) => m.id !== command.memoryId) };
  if (command.type === "work.cancel") snapshot = { ...snapshot, works: snapshot.works.map((w) => w.id === command.workId ? { ...w, state: "ended", phase: "cancelled", outcome: "cancelled" } : w) };
  push({ type: "snapshot", snapshot }); push({ type: "ack", requestId: command.requestId });
 }
});
if (isAvailable) {
 Window.setTitle("DeepBot UI tests");
 Window.setTitleBar({ style: "hidden", height: 64 });
 Window.setFrame({ size: { width: 1280, height: 800 } });
 Window.orderFront();
}
if (host.params.permissionPage) { settingsSection.set("permissions"); openModal("settings"); }
if (host.params.modelPage) { settingsSection.set("models"); openModal("settings"); }
if (host.params.emptyMcp) snapshot = { ...snapshot, connectors: snapshot.connectors.filter(connector => !connector.mcp) };
if (host.params.executorPage) { settingsSection.set("connections"); openModal("settings"); }
if (host.params.t3Connections) { settingsSection.set("connections"); openModal("settings"); }
if (host.params.botConfiguration) { infoTab.set("configuration"); setInfoPanel(true); }
if (host.params.routinePanel || host.params.panelActions) setInfoPanel(true);
if (host.params.infoTab === "library" || host.params.infoTab === "configuration") infoTab.set(host.params.infoTab);
if (host.params.workDetail) { openWorkDetail("w1"); setInfoPanel(true); }
setT3DesktopOpener(async url => (await openUrl(url)).opened);
mount(AppShell);

// Timed toggles keep the test driver from fast-forwarding between animation frames.
if (host.params.panelMotion) {
 Window.setTitle("DeepBot Panel Motion Capture");
 setTimeout(() => setInfoPanel(true), 4000);
 setTimeout(() => setInfoPanel(false), 7000);
 setTimeout(() => setInfoPanel(true), 10000);
}
