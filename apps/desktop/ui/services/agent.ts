import type { AgentMessage, Command, FilePreview, HostMessage, ReadonlyDeep } from "../../../../packages/agent/src/protocol";
import { isAgentMessage } from "../../../../packages/agent/src/wire";
import { errorMessage } from "../../../../packages/agent/src/wire-values";

/** Wire only. Domain state lives in state/runtime.ts. Injectable transport is also used by headless tests. */
export interface AgentTransport { start(): void; send(line: string): void; next(): Promise<string | null> }
let transport: AgentTransport;
let consuming = false;
let resumeAfterEof: (() => void) | undefined;
let sequence = 0;
let listener: (event: AgentMessage) => void = () => {};
let connection: (ready: boolean, error: string) => void = () => {};
const pending = new Map<string, string>();
type FileResponse = Extract<AgentMessage, { type: "ack" | "error" | "artifact.previewed" | "message.image.loaded" }>;
type FileCommand = Extract<Command, { type: "artifact.preview" | "artifact.open" | "message.image" | "message.open-file" }>;
const fileRequests = new Map<string, { receive: (event: FileResponse) => void; fail: (reason: string) => void }>();
let serial = 0;
export function requestId() { return `desktop-${Date.now()}-${++serial}-${Math.random().toString(36).slice(2, 9)}`; }
export function setAgentTransport(value: AgentTransport) { transport = value; }
export function subscribeAgent(onEvent: typeof listener, onConnection: typeof connection) { listener = onEvent; connection = onConnection; }
export function sendCommand(command: ReadonlyDeep<Command>, id = requestId()): string {
  const message: ReadonlyDeep<HostMessage> = { ...command, requestId: id };
  const line = JSON.stringify(message);
  pending.set(id, line);
  try { transport.send(line); }
  catch (error) { disconnect(`发送失败，重连后将重试：${errorMessage(error)}`); }
  return id;
}
function synchronize() {
  transport.send(JSON.stringify({ type: "sync", requestId: requestId(), afterSeq: sequence }));
  for (const line of pending.values()) transport.send(line);
}

function disconnect(reason: string) {
  for (const request of fileRequests.values()) request.fail(reason);
  connection(false, reason);
}

export async function startAgent() {
  if (consuming) {
    try {
      transport.start();
      synchronize();
      resumeAfterEof?.();
      resumeAfterEof = undefined;
    } catch (error) { disconnect(errorMessage(error)); }
    return;
  }
  consuming = true;
  connection(false, "正在连接");
  try {
    transport.start();
    // The Rust host may already own a running sidecar (e.g. a UI hot reload).
    // Request a snapshot immediately; a new process will also announce ready.
    synchronize();
    for (;;) {
      const line = await transport.next();
      if (line === null) {
        disconnect("本机服务已退出，请重新连接");
        // A closed transport must not spin. Keep this consumer's lifetime and
        // wait until an explicit reconnect starts the next transport session.
        await new Promise<void>((resolve) => { resumeAfterEof = resolve; });
        continue;
      }
      let raw: unknown;
      try { raw = JSON.parse(line); } catch { continue; }
      if (!isAgentMessage(raw)) continue;
      let event = raw;
      if (event.type === "ready") {
        connection(true, "");
        synchronize();
      }
      if (event.type === "snapshot") connection(true, "");
      if (event.type === "artifact.previewed" || event.type === "message.image.loaded" || event.type === "ack" || event.type === "error") {
        const fileRequest = event.requestId ? fileRequests.get(event.requestId) : undefined;
        if (fileRequest) {
          sequence = Math.max(sequence, event.seq);
          fileRequest.receive(event);
          continue;
        }
      }
      if (event.type === "ack") pending.delete(event.requestId);
      if (event.type === "error") {
        if (event.message === "未知的协议命令") event = { ...event, message: "DeepBot 后台尚未加载此操作，请重启应用后重试" };
        if (event.requestId) pending.delete(event.requestId);
        connection(true, event.message);
      }
      if (event.type === "fatal") {
        // The Rust queue survives Node generations. Its EOF notification is a
        // disconnect, not the end of this desktop consumer: keep next() active
        // so a reconnect can deliver the replacement process's ready/snapshot.
        disconnect(event.message);
        continue;
      }
      sequence = Math.max(sequence, event.seq ?? 0);
      listener(event);
    }
  } catch (error) { disconnect(errorMessage(error)); }
  finally { consuming = false; }
}

function requestFile(command: FileCommand): Promise<FilePreview | undefined> {
  const id = requestId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail("后台没有返回文件结果，请重试"), 15000);
    const finish = () => { clearTimeout(timer); fileRequests.delete(id); };
    const fail = (reason: string) => { finish(); reject(new Error(reason)); };
    fileRequests.set(id, {
      fail,
      receive(event) {
        if (event.type === "error") { fail(event.message); return; }
        if (event.type === "ack" && (command.type === "artifact.preview" || command.type === "message.image")) return;
        finish();
        resolve(event.type === "ack" ? undefined : event.file);
      },
    });
    // Opening a file should only happen in response to the original click.
    try { transport.send(JSON.stringify({ ...command, requestId: id })); }
    catch (error) { fail(errorMessage(error)); }
  });
}

export async function openArtifactFile(artifactId: string) {
  await requestFile({ type: "artifact.open", artifactId });
}

export async function openMessageFile(messageId: string, path: string) {
  await requestFile({ type: "message.open-file", messageId, path });
}

export async function readArtifactPreview(artifactId: string): Promise<FilePreview> {
  const file = await requestFile({ type: "artifact.preview", artifactId });
  if (!file) throw new Error("后台没有返回可预览的文件");
  return file;
}

export async function readMessageImage(messageId: string, imageId: string): Promise<string> {
  const file = await requestFile({ type: "message.image", messageId, imageId });
  if (file?.kind !== "image") throw new Error("无法读取消息图片");
  return file.image;
}
