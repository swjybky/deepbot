import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { ConnectorTool } from "./port.ts";
import { startConnectorProcess } from "./support.ts";
import { arrayOf, boolean, isRecord, jsonField, number, shape, string } from "../wire-values.ts";
import { isLoopbackHost, isPrivateIpHost, readHttpText, requestHttp } from "../runtime/http.ts";

export type McpEndpoint =
  | { url: string; headers?: Record<string, string> }
  | { command: string; args?: string[]; env?: Record<string, string>; cwd?: string };

const PROTOCOL_VERSION = "2025-03-26";
const CLIENT = { name: "deepbot", version: "0.1.0" };
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE = 4_000_000;

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string } };
const rpcResponse = shape({}, { id: number, result: jsonField, error: shape({}, { message: string }) });
const listPage = shape({ tools: arrayOf(jsonField) }, { nextCursor: string });
const toolInfo = shape({ name: string }, { description: string, inputSchema: jsonField });
const toolResult = shape({}, { content: arrayOf(jsonField), isError: boolean, structuredContent: jsonField });
const textPart = shape({ type: string, text: string });

/**
 * One long-lived MCP session per connector, over Streamable HTTP or stdio. The session is set up once and reused;
 * an expired HTTP session or an exited stdio server is set up again on the next call.
 */
export class McpClient {
  private nextId = 0;
  private ready: Promise<void> | undefined;
  private session: string | undefined;
  private version = PROTOCOL_VERSION;
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<number, { resolve: (value: RpcResponse) => void; reject: (error: Error) => void }>();
  private closed = false;
  readonly endpoint: McpEndpoint;
  readonly label: string;
  constructor(endpoint: McpEndpoint, label: string, { allowPrivateHttp = false } = {}) {
    this.endpoint = endpoint;
    this.label = label;
    if ("url" in endpoint) {
      const url = new URL(endpoint.url);
      const httpAllowed = url.protocol === "http:" &&
        (isLoopbackHost(url.hostname) || (allowPrivateHttp && isPrivateIpHost(url.hostname)));
      if (url.protocol !== "https:" && !httpAllowed)
        throw new Error(`${label} 的远程 MCP 必须使用 HTTPS`);
    }
  }
  async listTools(signal?: AbortSignal): Promise<ConnectorTool[]> {
    const tools: ConnectorTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request("tools/list", cursor ? { cursor } : {}, signal);
      if (!listPage(page)) throw new Error(`${this.label} MCP 返回的工具列表无效`);
      for (const tool of page.tools)
        if (toolInfo(tool)) tools.push({ name: tool.name, description: tool.description ?? "", inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object" } });
      cursor = page.nextCursor || undefined;
    } while (cursor);
    return tools;
  }
  /** The tool's structured result, else its text; a tool error rejects with the tool's own message. */
  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal, beforeSend?: () => Promise<void>): Promise<unknown> {
    const result = await this.request("tools/call", { name, arguments: args }, signal, beforeSend);
    if (!toolResult(result)) throw new Error(`${this.label} MCP 返回的工具结果无效`);
    const text = (result.content ?? []).filter(textPart).filter(part => part.type === "text").map(part => part.text).join("\n");
    if (result.isError) throw new Error(`${this.label} 拒绝操作：${(text || "未知错误").slice(0, 800)}`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    return text;
  }
  /** For tools that answer with JSON: the structured result, or the text parsed as JSON. */
  async callJson(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const value = await this.call(name, args, signal);
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { throw new Error(`${this.label} 缺少结构化结果`); }
  }
  async close(beforeNotify?: () => Promise<void>): Promise<void> {
    this.closed = true;
    if (this.child) { this.child.kill(); this.child = undefined; }
    if (this.session && "url" in this.endpoint) {
      try {
        await beforeNotify?.();
        const response = await requestHttp(this.endpoint.url, { method: "DELETE", headers: this.headers() }, 5000);
        await response.body?.cancel();
      } catch {}
    }
    this.session = undefined;
    this.ready = undefined;
  }
  private async request(method: string, params: Record<string, unknown>, signal?: AbortSignal, beforeSend?: () => Promise<void>): Promise<unknown> {
    if (this.closed) throw new Error(`${this.label} 已关闭`);
    const connectSignal = method === "tools/list" ? signal : undefined;
    const send = async () => {
      await this.connect(connectSignal);
      if (beforeSend) await beforeSend();
      signal?.throwIfAborted();
      return this.send(method, params, signal);
    };
    let response: RpcResponse;
    try { response = await send(); }
    catch (error) {
      if (!(error instanceof SessionLost)) throw error;
      this.ready = undefined;
      response = await send();
    }
    if (response.error) throw new Error(`${this.label} MCP：${response.error.message ?? "未知错误"}`);
    return response.result;
  }
  private connect(signal?: AbortSignal): Promise<void> {
    this.ready ??= (async () => {
      this.session = undefined;
      if ("command" in this.endpoint) this.spawn();
      const initialized = await this.send("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT }, signal);
      if (initialized.error) throw new Error(`${this.label} MCP 初始化失败：${initialized.error.message}`);
      const result = initialized.result;
      this.version = isRecord(result) && string(result.protocolVersion) ? result.protocolVersion : PROTOCOL_VERSION;
      await this.notify("notifications/initialized", signal);
    })().catch((error) => { this.ready = undefined; throw error; });
    return this.ready;
  }
  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": this.version,
      ...(this.session ? { "mcp-session-id": this.session } : {}),
      ...("url" in this.endpoint ? this.endpoint.headers : {}),
    };
  }
  private async send(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<RpcResponse> {
    const id = ++this.nextId;
    const body = { jsonrpc: "2.0", id, method, params };
    if ("command" in this.endpoint) return this.sendStdio(id, body, signal);
    const response = await requestHttp(this.endpoint.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) await response.body?.cancel().catch(() => {});
    if (response.status === 404 && this.session && method !== "initialize") throw new SessionLost();
    if (!response.ok) throw new McpHttpError(this.label, response.status);
    const session = response.headers.get("mcp-session-id");
    if (session) this.session = session;
    const raw = await readHttpText(response, MAX_RESPONSE, `${this.label} MCP 响应过大`);
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const values: unknown[] = raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => { try { return JSON.parse(line.slice(5)); } catch { return null; } });
      const found = values.filter(rpcResponse).findLast(value => value.id === id);
      if (!found) throw new Error(`${this.label} MCP 没有返回结果`);
      return found;
    }
    const result: unknown = raw ? JSON.parse(raw) : {};
    if (!rpcResponse(result) || result.id !== id) throw new Error(`${this.label} MCP 返回了无效的请求结果`);
    return result;
  }
  private async notify(method: string, signal?: AbortSignal): Promise<void> {
    const body = { jsonrpc: "2.0", method };
    if ("command" in this.endpoint) { this.child?.stdin.write(`${JSON.stringify(body)}\n`); return; }
    const response = await requestHttp(this.endpoint.url, {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }, REQUEST_TIMEOUT_MS);
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new McpHttpError(this.label, response.status);
  }
  private spawn() {
    const endpoint = this.endpoint;
    if (!("command" in endpoint)) throw new Error("MCP 未设置本地执行程序");
    const child = startConnectorProcess(endpoint.command, endpoint.args ?? [], endpoint);
    this.child = child;
    child.stderr.resume();
    child.stdin.on("error", () => {});
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (line.length > MAX_RESPONSE) return;
      let message: unknown;
      try { message = JSON.parse(line); } catch { return; }
      if (!rpcResponse(message) || typeof message.id !== "number") return;
      const waiter = this.pending.get(message.id);
      if (waiter) { this.pending.delete(message.id); waiter.resolve(message); }
    });
    const fail = (error: Error) => {
      if (this.child === child) { this.child = undefined; this.ready = undefined; }
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    };
    child.on("error", (error) => fail(new Error(`${this.label} MCP 无法启动：${error.message}`)));
    child.on("exit", () => fail(new SessionLost()));
  }
  private sendStdio(id: number, body: object, signal?: AbortSignal): Promise<RpcResponse> {
    const child = this.child;
    if (!child) return Promise.reject(new SessionLost());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error(`${this.label} MCP 请求超时`)), REQUEST_TIMEOUT_MS);
      const abort = () => done(new Error("已取消"));
      const done = (error?: Error, value?: RpcResponse) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
        if (error) reject(error); else resolve(value!);
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, { resolve: (value) => done(undefined, value), reject: (error) => done(error) });
      child.stdin.write(`${JSON.stringify(body)}\n`);
    });
  }
}

export class McpHttpError extends Error {
  readonly status: number;
  constructor(label: string, status: number) {
    super(`${label} MCP HTTP ${status}${status === 401 ? "，凭据无效或缺失" : ""}`);
    this.status = status;
  }
}

class SessionLost extends Error {
  constructor() { super("MCP 会话已断开"); this.name = "SessionLost"; }
}
