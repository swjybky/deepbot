import { fingerprint } from "../runtime/fingerprint.ts";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { resolve } from "node:path";
import type { Action, Brief, ConnectorStatus, DispatchCapabilities, Permissions, Report, SessionRef } from "../protocol.ts";
import { briefText, type Connector, type DispatchPort } from "./port.ts";
import { DurableRecords, executable, KeyedSerial, startConnectorProcess } from "./support.ts";
import { pathInRoots } from "../policy/gate.ts";
import { arrayOf, errorMessage, isArray, isRecord, jsonField, nullable, number, oneOf, shape, string } from "../wire-values.ts";

type ToolCall = { toolCallId?: string; title?: string; kind?: string; status?: string; rawInput?: unknown; locations?: unknown[]; content?: unknown[] };
type SessionModes = { currentModeId: string; availableModes: { id: string; name?: string }[] };
const sessionModes = shape({ currentModeId: string, availableModes: arrayOf(shape({ id: string }, { name: string })) });
const toolCall = shape({}, {
  toolCallId: string, title: string, kind: string, status: string, rawInput: jsonField, locations: arrayOf(jsonField), content: arrayOf(jsonField),
});
const permissionOption = shape({ optionId: string, kind: string });
const planEntry = shape({ content: string, status: string });
const rpcId = (value: unknown): value is string | number => string(value) || number(value);
const rpcFrame = shape({ jsonrpc: oneOf("2.0") },
  { id: nullable(rpcId), method: string, params: isRecord, error: shape({}, { message: string }), result: jsonField });

interface Permission { reportId: string; rpcId: string | number; generation: string; tool: ToolCall; options: { optionId: string; kind: string }[]; answered?: boolean; }
interface Input { inputId: string; text: string; state: "queued" | "running" | "done"; output: string; recovery?: boolean; lastProgressAt?: number; }
interface ACPRecord { assignmentId: string; brief: Brief; reports: Report[]; ref?: SessionRef; inputs: Input[]; permissions: Permission[]; cancelled: boolean; supportsLoad?: boolean; modes?: SessionModes; toolCalls?: Record<string, ToolCall>; }
interface RpcProcess { child: ChildProcessWithoutNullStreams; nextId: number; generation: string; pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout | undefined }>; sessionId?: string | undefined; dead: boolean; pumping: boolean; loading: boolean; }
export interface ACPOptions { dataDir: string; id: string; name: string; description?: string; command: string; args?: string[]; mode?: string; requestTimeoutMs?: number; env?: Record<string, string>; policy?: () => { permissions: Permissions; connectedFolders: string[] } | Promise<{ permissions: Permissions; connectedFolders: string[] }>; }

/** ACP approvals are raised by attempting a typed tool call, not by writing an approval request in prose. */
const ACP_EXECUTION_GUIDANCE = `DeepBot 宿主审批协议：当前 read-only / 需批准模式不等于永久禁止派工范围内的文件编辑。对于已派发的明确文件任务，请直接调用你实际提供的、包含具体路径和改动内容的文件编辑工具（例如 apply_patch / edit）。该工具调用会先触发 ACP session/request_permission，由 DeepBot 拦截并向用户展示一次性批准；只有批准后才会发生写入。工具不需要额外的“单次批准”参数，口头申请也不会生成批准卡片。不要仅凭 read-only 标签断言无法审批；应以实际工具返回的权限结果为准。若工具真实拒绝，必须遵守并如实汇报受阻。禁止以 shell、terminal、execute 或不透明 MCP 工具绕过文件、删除、网络或发布限制。完成后报告实际工具结果与产物路径；负责人会独立核验，不要把未执行的计划说成完成。`;

/** ACP v1, JSON-RPC over stdio. No client terminal/filesystem bypass is advertised. */
export class ACPConnector implements Connector, DispatchPort {
  readonly id: string;
  readonly name: string;
  readonly dispatch = this;
  private options: ACPOptions;
  private command: string;
  private args: string[];
  private records: DurableRecords<ACPRecord>;
  private processes = new Map<string, RpcProcess>();
  private serial = new KeyedSerial();
  private closing = false;
  constructor(options: ACPOptions) {
    this.options = options;
    this.id = options.id;
    this.name = options.name;
    this.command = options.command;
    this.args = options.args ?? [];
    this.records = new DurableRecords(options.dataDir, this.id);
  }
  capabilities(): DispatchCapabilities {
    return { steer: false, cancel: true, reattach: [...this.processes.keys()].some((id) => this.records.get(id)?.supportsLoad), permissionRelay: true, stream: true };
  }
  async available(): Promise<{ available: boolean; reason?: string }> {
    return executable(this.command) ? { available: true } : { available: false, reason: `未找到 ACP 程序：${this.command}，请检查 connectors.json` };
  }
  async status(): Promise<ConnectorStatus> {
    return { id: this.id, name: this.name, transport: "acp", builtin: false, description: this.options.description ?? "", ...(await this.available()), dispatch: this.capabilities() };
  }
  async start(input: { assignmentId: string; brief: Brief }): Promise<SessionRef> {
    return this.serial.run(input.assignmentId, async () => {
      let record = this.records.get(input.assignmentId);
      if (record?.ref) {
        if (!this.processes.get(input.assignmentId)?.dead && this.processes.has(input.assignmentId)) return record.ref;
        if (await this.restore(record) === "lost") throw new Error("ACP 会话不能恢复，需要携带交接包新建派工");
        return this.records.get(input.assignmentId)!.ref!;
      }
      record ??= { ...input, reports: [], inputs: [], permissions: [], cancelled: false };
      this.records.put(record);
      const process = await this.connect(record);
      const result = await this.request(process, "session/new", { cwd: resolve(input.brief.cwd), mcpServers: [] });
      if (!isRecord(result) || !string(result.sessionId)) { this.stopProcess(process); throw new Error("ACP session/new 缺少 sessionId"); }
      process.sessionId = result.sessionId;
      record = this.records.get(input.assignmentId)!;
      record.ref = { assignee: this.id, id: input.assignmentId, conversationId: result.sessionId };
      const modes = sessionModes(result.modes) ? result.modes : undefined;
      if (modes) record.modes = modes;
      this.records.put(record);
      await this.ensureApprovalMode(process, record, modes);
      record = this.records.get(input.assignmentId)!;
      if (!record.inputs.some((item) => item.inputId === `start:${input.assignmentId}`)) record.inputs.push({ inputId: `start:${input.assignmentId}`, text: briefText(input.assignmentId, input.brief), state: "queued", output: "" });
      this.records.report(record, { kind: "progress", text: "ACP 连接器已接收派工" }, "started");
      this.pump(input.assignmentId);
      return record.ref!;
    });
  }
  async send(session: SessionRef, input: { inputId: string; text: string }): Promise<void> {
    await this.serial.run(session.id, async () => {
      let record = this.require(session);
      if (record.cancelled) throw new Error("ACP 派工已取消");
      if (record.inputs.some((item) => item.inputId === input.inputId)) return;
      record.inputs.push({ ...input, state: "queued", output: "" }); this.records.put(record);
      if (!this.processes.has(session.id) || this.processes.get(session.id)?.dead) {
        if (await this.restore(record) === "lost") throw new Error("ACP 会话已丢失，需要重新派工");
      }
      this.pump(session.id);
    });
  }
  async cancel(session: SessionRef, reason: string): Promise<void> {
    await this.serial.run(session.id, async () => {
      const record = this.require(session); if (record.cancelled) return;
      record.cancelled = true;
      const process = this.processes.get(session.id);
      if (process && !process.dead) {
        for (const permission of record.permissions.filter((permission) => !permission.answered && permission.generation === process.generation)) {
          this.write(process, { jsonrpc: "2.0", id: permission.rpcId, result: { outcome: { outcome: "cancelled" } } }); permission.answered = true;
        }
        this.write(process, { jsonrpc: "2.0", method: "session/cancel", params: { sessionId: record.ref!.conversationId } });
      }
      this.records.report(record, { kind: "progress", text: `已取消：${reason}` }, "cancelled");
      if (process) this.stopProcess(process);
    });
  }
  async reattach(session: SessionRef): Promise<"alive" | "lost"> {
    return this.serial.run(session.id, async () => {
      const record = this.records.get(session.id);
      if (!record?.ref || record.ref.assignee !== this.id) return "lost";
      if (record.cancelled) return "alive";
      const process = this.processes.get(session.id);
      return process && !process.dead ? "alive" : this.restore(record);
    });
  }
  async *events(session: SessionRef, cursor?: string): AsyncIterable<Report> {
    const record = this.require(session);
    yield* this.records.after(record, cursor);
  }
  async respondPermission(session: SessionRef, reportId: string, approved: boolean): Promise<void> {
    await this.serial.run(session.id, async () => {
      let record = this.require(session);
      let permission = record.permissions.find((item) => item.reportId === reportId);
      if (!permission) throw new Error("ACP 权限请求不存在");
      if (permission.answered) return;
      const process = this.processes.get(session.id);
      if (!process || process.dead || process.generation !== permission.generation) throw new Error("ACP 权限请求已随进程失效，恢复连接后将重新提问");
      if (approved && await this.deniedByPolicy(record.brief, permission.tool)) throw new Error("该动作被 Bot 权限设置拒绝，批准不能绕过权限开关或连接目录");
      record = this.require(session); permission = record.permissions.find((item) => item.reportId === reportId)!;
      if (permission.answered) return;
      if (record.cancelled || process.dead) throw new Error("ACP 派工已停止，权限请求已失效");
      // Never choose allow_always: every grant is bound to this exact request once.
      const option = permission.options.find((option) => option.kind === (approved ? "allow_once" : "reject_once"));
      if (approved && !option) throw new Error("ACP 连接器没有提供单次批准选项，不能扩大为永久授权");
      permission.answered = true; this.records.put(record);
      this.write(process, { jsonrpc: "2.0", id: permission.rpcId, result: { outcome: option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" } } });
    });
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const process of this.processes.values()) this.stopProcess(process);
    this.processes.clear();
  }
  private require(session: SessionRef): ACPRecord {
    if (session.assignee !== this.id) throw new Error("派活对象不匹配");
    const record = this.records.get(session.id); if (!record?.ref) throw new Error("ACP 派工记录不存在"); return record;
  }
  private async restore(record: ACPRecord): Promise<"alive" | "lost"> {
    if (!record.ref || record.cancelled) return record.ref ? "alive" : "lost";
    const process = await this.connect(record);
    record = this.records.get(record.assignmentId)!;
    if (!record.supportsLoad) {
      this.stopProcess(process);
      this.records.report(record, { kind: "blocked", text: "ACP 连接器不支持 session/load，需携带已完成步骤和产物重新派工" }, `lost:${process.generation}`);
      return "lost";
    }
    process.sessionId = record.ref!.conversationId;
    process.loading = true;
    let result: unknown;
    try { result = await this.request(process, "session/load", { sessionId: process.sessionId, cwd: resolve(record.brief.cwd), mcpServers: [] }); }
    catch (error) { this.stopProcess(process); if (/unknown session|not found|不存在/i.test(errorMessage(error))) return "lost"; throw error; }
    finally { process.loading = false; }
    record = this.records.get(record.assignmentId)!;
    const modes = isRecord(result) && sessionModes(result.modes) ? result.modes : record.modes;
    await this.ensureApprovalMode(process, record, modes);
    record = this.records.get(record.assignmentId)!;
    for (const input of record.inputs) if (input.state === "running") {
      input.state = "queued"; input.recovery = true;
      input.text = `DeepBot 在执行过程中重启。先核对会话历史、文件和其他实际副作用，再继续尚未完成的步骤，不要重复已执行的发送、发布、删除或支付。上次输入：\n${input.text}\n上次已汇报：\n${input.output}`.slice(0, 100_000);
      input.output = "";
    }
    const invalidatedPermissionIds=record.permissions.filter(p=>!p.answered).map(p=>p.reportId);
    for (const permission of record.permissions) if (!permission.answered) permission.answered = true;
    this.records.report(record, { kind: "progress", text: "已重新接回 ACP 会话，先核对现场再继续", invalidatedPermissionIds }, `restored:${process.generation}`);
    this.pump(record.assignmentId);
    return "alive";
  }
  private async connect(record: ACPRecord): Promise<RpcProcess> {
    if (!executable(this.command)) throw new Error(`未找到 ACP 执行程序：${this.command}`);
    const child = startConnectorProcess(this.command, this.args, { cwd: resolve(record.brief.cwd), env: this.options.env, detached: globalThis.process.platform !== "win32" });
    const process: RpcProcess = { child, nextId: 0, generation: `${Date.now()}:${Math.random()}`, pending: new Map(), dead: false, pumping: false, loading: false };
    this.processes.set(record.assignmentId, process);
    const decoder = new StringDecoder("utf8"); let buffer = "", stderr = "";
    const fail = (error: Error) => {
      if (process.dead) return;
      process.dead = true;
      for (const pending of process.pending.values()) { if (pending.timer) clearTimeout(pending.timer); pending.reject(error); }
      process.pending.clear();
      if (!this.closing) {
        const current = this.records.get(record.assignmentId);
        if (current && !current.cancelled) this.records.report(current, { kind: "blocked", text: `${error.message}${stderr ? `\n${stderr.slice(-1000)}` : ""}` }, `disconnected:${process.generation}`);
      }
    };
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`ACP 进程已退出 (${code ?? "signal"})`)));
    child.stdin.on("error", fail);
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-2000); });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 4_000_000) { fail(new Error("ACP 消息超过 4MB 限制")); killProcessTree(child, "SIGKILL"); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { void this.receive(record.assignmentId, process, JSON.parse(line)).catch((error) => { fail(new Error(`ACP 协议错误：${errorMessage(error)}`)); killProcessTree(child, "SIGKILL"); }); }
        catch (error) { fail(new Error(`ACP 协议错误：${errorMessage(error)}`)); killProcessTree(child, "SIGKILL"); }
      }
    });
    const initialized = await this.request(process, "initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "deepbot", title: "DeepBot", version: "0.1.0" } });
    if (!isRecord(initialized) || initialized.protocolVersion !== 1) { this.stopProcess(process); throw new Error("ACP 连接器不支持协议 v1"); }
    record = this.records.get(record.assignmentId)!;
    record.supportsLoad = isRecord(initialized.agentCapabilities) && initialized.agentCapabilities.loadSession === true;
    this.records.put(record);
    return process;
  }
  private async ensureApprovalMode(process: RpcProcess, record: ACPRecord, modes: SessionModes | undefined): Promise<void> {
    const available = modes?.availableModes ?? [];
    const requested = this.options.mode;
    const current = available.find(mode => mode.id === modes?.currentModeId);
    const unsafe = (mode?: SessionModes["availableModes"][number]) => /bypass|yolo|full.?access|auto.?approve|auto.?review|unrestricted|danger/i.test(`${mode?.id ?? ""} ${mode?.name ?? ""}`);
    let target = requested ? available.find(mode => mode.id === requested) : undefined;
    if (requested && (!target || unsafe(target))) { this.stopProcess(process); throw new Error("ACP 配置的模式不存在或会绕过审批，拒绝启动"); }
    if (!target) target = available.find(mode => /^(read-only|read_only|ask|ask-every-time)$/.test(mode.id));
    if (!target && unsafe(current)) target = available.find(mode => !unsafe(mode) && /default|ask|approve|normal|safe/i.test(`${mode.id} ${mode.name ?? ""}`));
    if (!target && unsafe(current)) { this.stopProcess(process); throw new Error("ACP 默认模式绕过审批，且没有可用的审批模式"); }
    if (target && target.id !== modes?.currentModeId) await this.request(process, "session/set_mode", { sessionId: record.ref!.conversationId, modeId: target.id });
  }
  private pump(assignmentId: string): void {
    const process = this.processes.get(assignmentId);
    if (!process || process.dead || process.pumping || this.closing) return;
    process.pumping = true;
    void (async () => {
      while (!process.dead && !this.closing) {
        let record = this.records.get(assignmentId)!;
        if (record.cancelled) break;
        const input = record.inputs.find((item) => item.state === "queued"); if (!input) break;
        input.state = "running"; input.output = ""; this.records.put(record);
        let result: unknown;
        try { result = await this.request(process, "session/prompt", { sessionId: record.ref!.conversationId, prompt: [{ type: "text", text: `[DeepBot input:${input.inputId}]\n${ACP_EXECUTION_GUIDANCE}\n\n${input.text}` }] }, false); }
        catch (error) {
          record = this.records.get(assignmentId)!;
          if (!record.cancelled && !this.closing) this.records.report(record, { kind: process.dead ? "blocked" : "failed", text: `ACP 执行失败：${errorMessage(error)}` }, `failed:${input.inputId}:${process.generation}`);
          break;
        }
        record = this.records.get(assignmentId)!;
        const saved = record.inputs.find((item) => item.inputId === input.inputId)!;
        saved.state = "done";
        if (record.cancelled) { this.records.put(record); break; }
        const stopReason = isRecord(result) && string(result.stopReason) ? result.stopReason : undefined;
        if (stopReason === "end_turn") {
          const text = saved.output.trim();
          this.records.report(record, { kind: "ready", text: text || "ACP 本轮完成但未给出结果，需要验收确认", evidence: text ? [{ text }] : [] }, `ready:${input.inputId}`);
        } else this.records.report(record, { kind: "blocked", text: `ACP 停止原因：${stopReason ?? "未知"}\n${saved.output}` }, `stopped:${input.inputId}`);
      }
    })().catch((error) => {
      const record = this.records.get(assignmentId);
      if (record && !record.cancelled && !this.closing) this.records.report(record, { kind: "failed", text: errorMessage(error) });
    }).finally(() => { process.pumping = false; });
  }
  private async receive(assignmentId: string, process: RpcProcess, raw: unknown): Promise<void> {
    if (!rpcFrame(raw)) throw new Error("ACP JSON-RPC 2.0 帧无效");
    const message = raw;
    if (!message.method && typeof message.id === "number") {
      const pending = process.pending.get(message.id); if (!pending) return;
      process.pending.delete(message.id); if (pending.timer) clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(String(message.error.message ?? "ACP 调用失败")));
      else pending.resolve(message.result);
      return;
    }
    let record = this.records.get(assignmentId)!;
    if (message.method === "session/update") {
      if (process.loading) return; // loadSession replays history; it is not new work or output.
      if (message.params?.sessionId !== process.sessionId) return;
      const update = message.params?.update;
      if (!isRecord(update)) return;
      const entries = update.entries;
      const updateKind = update.sessionUpdate;
      const input = record.inputs.find((item) => item.state === "running");
      if (update.sessionUpdate === "agent_message_chunk" && isRecord(update.content) && update.content.type === "text" && string(update.content.text) && input) {
        input.output = (input.output + update.content.text).slice(-200_000);
        if (Date.now() - (input.lastProgressAt ?? 0) >= 250) {
          input.lastProgressAt = Date.now(); this.records.report(record, { kind: "progress", text: input.output.slice(-1000) });
        } else this.records.put(record);
      } else if ((update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") && toolCall(update) && update.toolCallId) {
        const id = update.toolCallId;
        const previous = record.toolCalls && Object.hasOwn(record.toolCalls, id) ? record.toolCalls[id] : undefined;
        const merged = { ...previous, ...update };
        record.toolCalls = { ...record.toolCalls, [id]: merged };
        this.records.report(record, { kind: "progress", text: `${update.title ?? id} · ${update.status ?? "执行中"}` }, `tool:${fingerprint(update, 24)}`);
        const evidence = merged.status === "completed" ? (merged.content ?? []).flatMap(item =>
          isRecord(item) && item.type === "diff" && string(item.path) ? [{ path: item.path }] : []) : [];
        if (evidence.length) this.records.report(record, { kind: "artifact", text: update.title ?? "文件改动", evidence }, `artifact:${fingerprint(evidence, 24)}`);
      } else if (updateKind === "plan" && isArray(entries)) {
        this.records.report(record, { kind: "progress", text: entries.filter(planEntry).map(entry => `${entry.content} (${entry.status})`).join("\n").slice(0, 2000) });
      }
      return;
    }
    if (message.method === "session/request_permission" && message.id != null) {
      if (message.params?.sessionId !== process.sessionId || record.cancelled) {
        this.write(process, { jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "cancelled" } } }); return;
      }
      const requestedTool: ToolCall = toolCall(message.params?.toolCall) ? message.params.toolCall : {};
      const key = requestedTool.toolCallId;
      const previous = key && record.toolCalls && Object.hasOwn(record.toolCalls, key) ? record.toolCalls[key] : undefined;
      const tool = { ...previous, ...requestedTool };
      const options = isArray(message.params?.options) ? message.params.options.filter(permissionOption) : [];
      const denied = await this.deniedByPolicy(record.brief, tool);
      if (process.dead) return;
      record = this.records.get(assignmentId)!;
      if (record.cancelled) {
        this.write(process, { jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "cancelled" } } }); return;
      }
      if (denied) {
        const reject = options.find(option => option.kind === "reject_once");
        this.write(process, { jsonrpc: "2.0", id: message.id, result: { outcome: reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" } } });
        this.records.report(record, { kind: "progress", text: `权限闸已拒绝：${denied}` }); return;
      }
      const action = actionFor(tool);
      const reportId = `${assignmentId}:permission:${process.generation}:${message.id}`;
      record.permissions.push({ reportId, rpcId: message.id, generation: process.generation, tool, options });
      this.records.report(record, { kind: "permission", text: `${tool.title ?? "ACP 请求单次操作许可"}\n${JSON.stringify({ input: tool.rawInput ?? null, locations: tool.locations ?? [], changes: tool.content ?? [] }).slice(0, 12000)}`, action }, `permission:${process.generation}:${message.id}`);
      return;
    }
    if (message.id != null) this.write(process, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "DeepBot does not provide this client capability" } });
  }
  private async deniedByPolicy(brief: Brief, tool: ToolCall): Promise<string | undefined> {
    const policy = await this.options.policy?.();
    if (policy) brief = { ...brief, permissions: policy.permissions, connectedFolders: policy.connectedFolders };
    const action = actionFor(tool);
    if (action.kind === "command") return "通用命令无法验证权限，请使用文件/浏览器专用工具或交给 Bot 自己的后台";
    if (!tool.kind || !["read", "edit", "move", "delete", "search", "fetch"].includes(tool.kind)) return "ACP 连接器未声明可验证的专用动作类型，拒绝通用权限提升";
    if (["files", "delete"].includes(action.kind) && !brief.permissions.files) return "本地文件权限已关闭";
    if (action.kind === "delete" && !brief.permissions.deleteFiles) return "删除文件权限已关闭";
    if (action.kind === "browser" && !brief.permissions.browser) return "浏览器权限已关闭";
    if (["files", "delete"].includes(action.kind)) {
      const input = isRecord(tool.rawInput) ? tool.rawInput : {};
      const paths = [
        ...(tool.locations ?? []).filter(isRecord).map(location => location.path),
        input.path, input.filePath,
        ...(tool.content ?? []).filter(isRecord).filter(item => item.type === "diff").map(item => item.path),
      ].filter(string);
      if (!paths.length) return "文件操作未声明路径，无法校验连接目录";
      try { await Promise.all(paths.map(path => pathInRoots(path, brief.cwd, brief.connectedFolders))); }
      catch { return "目标超出连接目录或符号链接指向外部"; }
    }
    return undefined;
  }
  private request(process: RpcProcess, method: string, params: unknown, timed = true): Promise<unknown> {
    if (process.dead) return Promise.reject(new Error("ACP 进程不可用"));
    const id = ++process.nextId;
    return new Promise((resolveResult, reject) => {
      const timer = timed ? setTimeout(() => { process.pending.delete(id); reject(new Error(`ACP ${method} 超时`)); }, this.options.requestTimeoutMs ?? 30_000) : undefined;
      process.pending.set(id, { resolve: resolveResult, reject, timer });
      try { this.write(process, { jsonrpc: "2.0", id, method, params }); }
      catch (error) { process.pending.delete(id); if (timer) clearTimeout(timer); reject(error); }
    });
  }
  private write(process: RpcProcess, message: unknown): void {
    if (process.dead) throw new Error("ACP 连接已关闭");
    process.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private stopProcess(process: RpcProcess): void {
    if (process.dead) return;
    process.dead = true;
    for (const pending of process.pending.values()) { if (pending.timer) clearTimeout(pending.timer); pending.reject(new Error("ACP 连接已关闭")); }
    process.pending.clear(); process.child.stdin.end(); killProcessTree(process.child, "SIGTERM");
    const kill = setTimeout(() => killProcessTree(process.child, "SIGKILL"), 1500); kill.unref();
  }
}
function actionFor(tool: ToolCall): Action {
  const deletes = (tool.content ?? []).filter(isRecord).some(item => item.type === "diff" && string(item.oldText) && item.oldText.length > 0 && !item.newText);
  const kind = tool.kind === "delete" || deletes ? "delete" : ["read", "edit", "move", "search"].includes(tool.kind ?? "") ? "files" : tool.kind === "fetch" ? "browser" : tool.kind === "execute" ? "command" : "publish";
  const path = isRecord(tool.rawInput) && string(tool.rawInput.path) ? tool.rawInput.path : undefined;
  return { kind, description: tool.title ?? tool.kind ?? "ACP 操作", ...(path === undefined ? {} : { path }),
    content: JSON.stringify({ input: tool.rawInput ?? null, locations: tool.locations ?? [], content: tool.content ?? [] }) };
}

function killProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  try {
    if (globalThis.process.platform !== "win32" && child.pid) globalThis.process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
