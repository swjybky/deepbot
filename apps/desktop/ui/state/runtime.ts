import { computed, signal, openUrl } from "nsh";
import { dismissFeedback, notify } from "./feedback";
import type { AgentMessage, ChatActivity, Command, Snapshot, WorkPhase, ModelResult, RemoteAnswers, ReadonlyDeep, RemoteQuestion as ProtocolQuestion, T3Project } from "../../../../packages/agent/src/protocol";
import { emptySnapshot } from "../../../../packages/agent/src/defaults";
import { errorMessage } from "../../../../packages/agent/src/wire-values";
import { sendCommand, startAgent, subscribeAgent, openArtifactFile, openMessageFile, requestId } from "../services/agent";
export { readArtifactPreview, readMessageImage, requestId } from "../services/agent";
export type { RemoteAnswers, T3RuntimeMode } from "../../../../packages/agent/src/protocol";

type SnapshotView = ReadonlyDeep<Snapshot>;
export type RuntimeBot = SnapshotView["bots"][number];
export type ModelConfig = SnapshotView["modelConfigs"][number];
export type Message = SnapshotView["messages"][number];
export type Work = SnapshotView["works"][number];
export type Attention = SnapshotView["attentions"][number];
export type RouteRule = SnapshotView["rules"][number];
export type Routine = SnapshotView["routines"][number];
export type Memory = SnapshotView["memories"][number];
export type Artifact = SnapshotView["artifacts"][number];
export type ConnectorStatus = SnapshotView["connectors"][number];
export type RemoteQuestion = ReadonlyDeep<ProtocolQuestion>;

const snapshot = signal<Snapshot>(emptySnapshot());
const connectionReady = signal(false);
const connectionMessage = signal("");
const snapshotReceived = signal(false);
export const runtime = (): SnapshotView => snapshot();
export function conversationActivity(threadId: string): ChatActivity | undefined {
  if (!connected()) return undefined;
  const { chatActivity, typing } = runtime();
  return chatActivity ? chatActivity[threadId] : typing[threadId] ? "processing" : undefined;
}
export const connected = () => connectionReady();
export const connectionError = () => connectionMessage();
export const hydrated = () => snapshotReceived();
type RequestStatus =
  | { status: "pending" }
  | { status: "succeeded"; result?: ModelResult; projects?: T3Project[] }
  | { status: "failed"; message: string };
const requests = signal<Record<string, RequestStatus>>({});
export const requestStatus = (id: string): ReadonlyDeep<RequestStatus> | undefined => requests()[id];
export const requestPending = (id: string) => requestStatus(id)?.status === "pending";
export function modelRequestResult(id: string): ReadonlyDeep<ModelResult> | undefined {
  const request = requestStatus(id);
  if (request?.status === "failed") return { ok: false, message: request.message };
  return request?.status === "succeeded" ? request.result : undefined;
}
function finishRequest(id: string, value: RequestStatus) {
  const current = requests();
  if (!Object.hasOwn(current, id)) return;
  const completed = Object.entries(current).filter(([key, request]) => key !== id && request.status !== "pending");
  const next = { ...current, [id]: value };
  for (const [key] of completed.slice(0, Math.max(0, completed.length - 255))) delete next[key];
  requests.set(next);
}
export const replyTarget = signal<{ messageId?: string; workId?: string; text: string; threadId: string } | null>(null);
export const phaseLabels: Record<WorkPhase, string> = { queued: "排队", running: "执行中", waiting: "等你", review: "验收中", done: "已交付", failed: "失败", cancelled: "已取消" };
function replace<T extends { id: string }>(items: T[], item: T): T[] { return items.some((v) => v.id === item.id) ? items.map((v) => v.id === item.id ? item : v) : [...items, item]; }
function receiveAgentEvent(event: AgentMessage) {
  if (event.type === "ack" && requestPending(event.requestId)) finishRequest(event.requestId, { status: "succeeded" });
  if (event.type === "connector.t3.project-list")
    finishRequest(event.requestId, { status: "succeeded", projects: event.projects });
  if (event.type === "model.result") {
    notify(event.ok ? "success" : "error", event.message, event.requestId);
    finishRequest(event.requestId, event.ok
      ? { status: "succeeded", result: { ok: event.ok, message: event.message, ...(event.models ? { models: event.models } : {}) } }
      : { status: "failed", message: event.message });
  }
  if (event.type === "error") notify("error", event.message, event.requestId);
  if (event.type === "error" && event.requestId) finishRequest(event.requestId, { status: "failed", message: event.message });
  if (event.type === "snapshot") {
    for (const [threadId, error] of Object.entries(event.snapshot.errors)) {
      if (error && error !== snapshot().errors[threadId]) notify("error", error, `thread-error:${threadId}`);
    }
    snapshot.set(event.snapshot);
    snapshotReceived.set(true);
  }
  if (event.type === "thread.delta" && event.error && event.error !== snapshot().errors[event.threadId]) notify("error", event.error, `thread-error:${event.threadId}`);
  if (event.type === "thread.delta") {
    const { threadId, typing, messages, error } = event;
    const current = snapshot();
    const chatActivity = { ...(current.chatActivity ?? Object.fromEntries(
      Object.keys(current.typing).filter(id => current.typing[id]).map(id => [id, "processing" as const]),
    )) };
    if (typing) chatActivity[threadId] = event.chatActivity ?? "processing";
    else delete chatActivity[threadId];
    snapshot.set({
      ...current,
      messages: messages.reduce((all, item) => replace(all, item), current.messages),
      typing: { ...current.typing, [threadId]: typing },
      chatActivity,
      errors: { ...current.errors, [threadId]: error ?? "" },
    });
  }
  if (event.type === "work.updated") snapshot.set({ ...snapshot(), works: replace(snapshot().works, event.work) });
  if (event.type === "attention.opened") snapshot.set({ ...snapshot(), attentions: replace(snapshot().attentions, event.attention) });
  if (event.type === "attention.resolved") snapshot.set({ ...snapshot(), attentions: snapshot().attentions.map((a) => a.id === event.attentionId ? { ...a, state: "resolved" } : a) });
}
subscribeAgent(receiveAgentEvent, (ready, error) => {
  if (!ready && connected()) snapshot.set({ ...snapshot(), typing: {}, chatActivity: {} });
  connectionReady.set(ready);
  if (ready) dismissFeedback("connection-error");
  else if (error && error !== "正在连接" && error !== connectionError()) notify("error", error, "connection-error");
  connectionMessage.set(error);
});
export function command(value: ReadonlyDeep<Command>) {
  const id = requestId();
  requests.set({ ...requests(), [id]: { status: "pending" } });
  return sendCommand(value, id);
}
export function connectAgent() { void startAgent(); }
export const canSend = computed(() => connected() && hydrated());
export function respond(attentionId: string, value: string, answers?: RemoteAnswers) {
  const text = value.trim();
  if (!text) return undefined;
  return command({ type: "attention.reply", attentionId, value: text, ...(answers ? { answers } : {}) });
}
export function cancelWork(workId: string) { command({ type: "work.cancel", workId }); }
export function reassignWork(workId: string, assignee: string, t3ProjectId?: string) {
  return command({ type: "work.reassign", workId, assignee, ...(t3ProjectId ? { t3ProjectId } : {}) });
}
export function queryT3Projects(connectorId: string) { return command({ type: "connector.t3.projects", connectorId }); }
/** Who can take work: the Bot's own background worker, then every connector that takes dispatched work. */
export const assigneeOptions = computed(() => [{ value: "self", title: "Bot 自己", disabled: false }, ...runtime().connectors.filter((c) => c.dispatch).map((c) => ({ value: c.id, title: c.name, disabled: !c.available }))]);

export async function openArtifact(artifactId: string) {
  try { await openArtifactFile(artifactId); }
  catch (error) { notify("error", `无法打开文件：${errorMessage(error)}`); }
}

export async function openMessageLink(messageId: string, url: string) {
  if (!/^(?:\/(?!\/)|[a-z]:[/\\]|\\\\)/i.test(url)) return openExternal(url);
  // Delivery links can end in :line or :line:column. The system opener takes a filename.
  let path = url.replace(/(?::[0-9]+){1,2}$/, "");
  try { path = decodeURIComponent(path); } catch { /* A literal percent can be part of a filename. */ }
  try { await openMessageFile(messageId, path); }
  catch (error) { notify("error", `无法打开文件：${errorMessage(error)}`); }
}

export async function openExternal(url: string) {
  try { const result = await openUrl(url); if (!result.opened) notify("error", "没有可打开此链接的应用"); }
  catch (error) { notify("error", `无法打开链接：${errorMessage(error)}`); }
}
