import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { readHttpText, requestHttp } from "../runtime/http.ts";
import { isRecord } from "../wire-values.ts";
import { within } from "../policy/gate.ts";
import { t3ApprovalEndpoint } from "./t3-pairing.ts";
import type { Action, Brief, Permissions } from "../protocol.ts";

type NativeItemRef = { driver: string; nativeId: string };
type ApprovalItem = {
  id: string;
  runId: string;
  type: "approval_request";
  requestId: string;
  requestKind: string;
  prompt?: string;
  reason?: string;
  fullAccessOverride?: string;
  nativeItemRef?: NativeItemRef;
  providerTurnId?: string;
  options?: { decision: string }[];
};
type ToolItem = {
  runId: string;
  type: "command_execution" | "file_change";
  nativeItemRef?: NativeItemRef;
  providerTurnId?: string;
  input?: string;
  changes?: { operation: string; path: string; oldPath?: string }[];
};
type RuntimeRequest = {
  id: string;
  kind: string;
  status: string;
  responseCapability?: { type: string };
  decision?: string;
};
type Projection = {
  thread: { id: string; worktreePath?: string | null };
  runtimeRequests: RuntimeRequest[];
  turnItems: Array<ApprovalItem | ToolItem>;
};

const SCOPES = ["orchestration:read", "orchestration:operate"];
const APPROVAL_REQUIRED = "请在连接器设置中连接 T3 Code 审批";

/** T3's device session authorizes these two RPCs independently of the MCP credential. */
export class T3ApprovalClient {
  private readonly origin: string;
  private readonly token: string;

  constructor(endpoint: string, token: string) {
    this.origin = t3ApprovalEndpoint(endpoint).origin;
    this.token = token;
  }

  async check(signal: AbortSignal) {
    const result = await this.http("/api/auth/session", "GET", signal);
    const scopes = result.permissions ?? result.scopes;
    if (!result.authenticated || !Array.isArray(scopes) || !SCOPES.every(scope => scopes.includes(scope)))
      throw new Error(APPROVAL_REQUIRED);
  }

  async projection(threadId: string): Promise<Projection> {
    const result = await this.rpc<Projection>("orchestration.getThreadProjection", { threadId });
    if (result.thread?.id !== threadId || !Array.isArray(result.runtimeRequests) || !Array.isArray(result.turnItems))
      throw new Error("T3 Code 未返回此线程的审批状态");
    return result;
  }

  async respond(threadId: string, requestId: string, commandId: string, decision: "accept" | "decline") {
    await this.rpc("orchestration.dispatchCommand", { type: "runtime-request.respond", commandId, threadId, requestId, decision });
  }

  private async http(path: string, method: "GET" | "POST", signal: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await requestHttp(new URL(path, this.origin), { method, headers: { authorization: `Bearer ${this.token}` }, signal });
    } catch {
      throw new Error("T3 Code 审批连接暂时不可用");
    }
    if (!response.ok) await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) throw new Error(APPROVAL_REQUIRED);
    if (!response.ok) throw new Error(`T3 Code 审批连接返回 HTTP ${response.status}`);
    try {
      const result: unknown = JSON.parse(await readHttpText(response, 256 * 1024, "T3 Code 审批响应过大"));
      if (isRecord(result)) return result;
    } catch {}
    throw new Error("T3 Code 审批响应无效");
  }

  private async rpc<T>(method: string, payload: object): Promise<T> {
    const signal = AbortSignal.timeout(6_000);
    const { ticket } = await this.http("/api/auth/websocket-ticket/rpc", "POST", signal);
    if (typeof ticket !== "string" || !ticket) throw new Error("T3 Code 未返回审批连接票据");
    const url = new URL("/ws", this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("orchestrationProtocol", "2");
    url.searchParams.set("wsTicket", ticket);

    const socket = new WebSocket(url);
    let timeout: () => void;
    return new Promise<T>((resolveResult, reject) => {
      const fail = (message: string) => reject(new Error(message));
      timeout = () => fail("T3 Code 审批操作超时");
      if (signal.aborted) return timeout();
      signal.addEventListener("abort", timeout, { once: true });
      socket.onopen = () => socket.send(JSON.stringify({ _tag: "Request", id: "1", tag: method, payload, headers: [] }));
      socket.onerror = () => fail("无法打开 T3 Code 审批通道");
      socket.onclose = () => fail(signal.aborted ? "T3 Code 审批操作超时" : "T3 Code 审批通道已断开");
      socket.onmessage = ({ data }) => {
        if (typeof data !== "string" || data.length > 16_000_000) return fail("T3 Code 审批响应无效");
        let frame;
        try { frame = JSON.parse(data); } catch { return fail("T3 Code 审批响应无效"); }
        if (frame?._tag === "Ping") { socket.send(JSON.stringify({ _tag: "Pong" })); return; }
        if (frame?._tag === "Defect") return fail("T3 Code 审批通道返回错误");
        if (frame?._tag !== "Exit" || frame.requestId !== "1") return;
        if (frame.exit?._tag === "Success") resolveResult(frame.exit.value as T);
        else fail("T3 Code 拒绝了审批操作，请检查请求是否仍待处理");
      };
    }).finally(() => { signal.removeEventListener("abort", timeout); socket.close(); });
  }
}

export function liveApprovals(projection: Projection, ownedRuns: ReadonlySet<string>) {
  return projection.turnItems.flatMap(item => {
    if (item.type !== "approval_request" || !ownedRuns.has(item.runId)) return [];
    const request = projection.runtimeRequests.find(candidate => candidate.id === item.requestId);
    if (request?.status !== "pending" || request.responseCapability?.type !== "live" || request.kind !== item.requestKind) return [];
    const decisions = item.options?.map(choice => choice.decision) ?? ["accept", "decline"];
    const options: ("批准" | "拒绝")[] = [];
    if (decisions.includes("accept")) options.push("批准");
    if (decisions.includes("decline")) options.push("拒绝");
    if (!options.length) return [];
    const tool = item.nativeItemRef && projection.turnItems.find((candidate): candidate is ToolItem =>
      (candidate.type === "command_execution" || candidate.type === "file_change") &&
      candidate.runId === item.runId && candidate.providerTurnId === item.providerTurnId &&
      candidate.nativeItemRef?.nativeId === item.nativeItemRef?.nativeId && candidate.nativeItemRef?.driver === item.nativeItemRef?.driver);
    return [{ item, options, tool }];
  });
}

export type T3Approval = ReturnType<typeof liveApprovals>[number];

export function approvalAction({ item, tool }: T3Approval): Action {
  const label = item.requestKind === "command" ? "执行命令" : item.requestKind === "file-change" ? "修改文件" : item.requestKind === "file-read" ? "读取文件" : "操作授权";
  const body = [tool?.input ?? tool?.changes?.map(change => change.path).join("\n"), item.prompt, item.reason]
    .filter((value, index, all): value is string => !!value && all.indexOf(value) === index).join("\n").slice(0, 8000);
  return { kind: item.requestKind === "command" ? "command" : "files", description: label, ...(body ? { content: body } : {}) };
}

// Check the provider's correlated tool item. Approval reasons may contain arbitrary text.
export async function canAutoApprove(approval: T3Approval, brief: Brief, workspace: string, permissions: Permissions): Promise<boolean> {
  const { item, tool, options } = approval;
  if (!permissions.files || !brief.permissions.files || !tool || item.fullAccessOverride || !options.includes("批准")) return false;
  try {
    const root = await realpath(workspace);
    if (await realpath(brief.cwd) !== root) return false;
    if (item.requestKind === "command" && tool.type === "command_execution" && typeof tool.input === "string") {
      const input = tool.input.trim();
      const command = /^\/bin\/(?:bash|sh) -l?c '([^']+)'$/.exec(input)?.[1] ?? input;
      return /^(git status(?: --short| -sb)?|git diff --(?:stat|check|name-only)|pnpm (?:check|test|run (?:build|test|lint))|npm (?:test|run (?:build|lint))|cargo (?:check|test))$/.test(command);
    }
    if (item.requestKind !== "file-change" || tool.type !== "file_change" || !tool.changes?.length) return false;
    for (const change of tool.changes) {
      if (change.operation !== "update" || change.oldPath) return false;
      if (!within(root, await realpath(resolve(root, change.path)))) return false;
    }
    return true;
  } catch { return false; }
}
