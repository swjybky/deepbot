import { fingerprint } from "../runtime/fingerprint.ts";
import { resolve } from "node:path";
import type { Brief, ConnectorStatus, DispatchCapabilities, Permissions, RemoteAnswers, Report, SessionRef, T3Project, T3RuntimeMode } from "../protocol.ts";
import { briefText, type Connector, type ConnectorTool, type DispatchPort } from "./port.ts";
import { writeT3Settings } from "./config.ts";
import { McpClient, McpHttpError } from "./mcp.ts";
import { DurableRecords, KeyedSerial } from "./support.ts";
import { resolveT3ApprovalCredential, resolveT3Credential, t3EnvironmentId } from "./t3-pairing.ts";
import { approvalAction, canAutoApprove, liveApprovals, T3ApprovalClient } from "./t3-approvals.ts";
import { t3Questions, validateT3Answers } from "./t3-questions.ts";
import { within } from "../policy/gate.ts";
import { arrayOf, boolean, errorMessage, isRecord, nullable, number, oneOf, requireShape, shape, string } from "../wire-values.ts";

type PendingRequest = { requestId: string; reportId: string; kind: "question" | "approval" | "external" };
type InputDelivery = "steered" | "started" | "restarted" | "queued" | "unconfirmed";
type T3Input = {
  inputId: string; text: string; state: "sending" | "sent";
  clientRequestId?: string; runId?: string; messageId?: string; delivery?: InputDelivery;
};
interface T3Record {
  assignmentId: string; brief: Brief; reports: Report[]; ref?: SessionRef;
  runId?: string; cancelled?: boolean;
  firstRunId?: string;
  runtimeMode?: T3RuntimeMode;
  projectRoot?: string;
  pendingRequests?: PendingRequest[];
  inputs: T3Input[];
  lastPollAt?: number;
}
export interface T3Options {
  remote?: { id: string; name: string; environmentId: string; enabled: boolean };
  dataDir: string; url?: string | undefined; token?: string | undefined; pollMs?: number;
  provider?: string | undefined; model?: string | undefined;
  runtimeMode?: T3RuntimeMode | undefined; approvalToken?: string | undefined;
  activePermissions?: (assignmentId: string) => Promise<Permissions | undefined>;
}

/** Tools that start, steer or stop T3 work. Only the dispatch path uses them, so every T3 thread DeepBot opens is a tracked work. */
export const T3_DISPATCH_TOOLS = ["t3_thread_launch", "t3_thread_send", "t3_thread_interrupt"];
const PROJECT_TOOL = "t3_project_list";
const REQUIRED_REMOTE_TOOLS = [...T3_DISPATCH_TOOLS, PROJECT_TOOL, "t3_thread_read"];
export const T3_DEFAULT_URL = "http://127.0.0.1:13773/mcp";
const DEFAULT_RUNTIME_MODE = "full-access";
const runtimeModeValue = oneOf("approval-required", "auto-accept-edits", "auto", "full-access");
const optionalText = nullable(string);
const threadSummary = shape({}, { threadId: optionalText, link: optionalText, status: optionalText,
  latestRunId: optionalText, activeRunId: optionalText, pendingRequestCount: number, itemCount: number });
const timelineItem = shape({ type: string }, { runId: optionalText, messageId: optionalText, text: optionalText, status: optionalText });
const threadPage = shape({}, {
  thread: nullable(threadSummary), items: arrayOf(timelineItem), recentRuns: arrayOf(shape({ runId: string, status: string }, { startedAt: optionalText })),
  hasMore: boolean, nextPosition: nullable(number),
});
const projectPage = shape({ projects: arrayOf(shape({ id: string, workspaceRoot: string }, { title: string })) }, { nextCursor: nullable(number) });
const launchedThread = shape({ threadId: string }, { runId: optionalText, latestRunId: optionalText, link: optionalText });
const sentMessage = shape({ runId: string, messageId: string, delivery: oneOf("steered", "started", "restarted", "queued") });
const failedStatus = oneOf("failed", "cancelled", "interrupted", "rolled_back");
const deliveryText: Record<InputDelivery, string> = {
  steered: "补充已送达 T3 Code 当前运行",
  started: "补充已送达 T3 Code，已安排后续执行",
  restarted: "补充已送达 T3 Code，运行已重启",
  queued: "补充在 T3 Code 排队，等待送达",
  unconfirmed: "T3 Code 补充排队已结束，送达未确认",
};
const PENDING_TOOL = "t3_pending_request";
const CAPABILITIES: DispatchCapabilities = { steer: true, cancel: true, reattach: true, permissionRelay: false, stream: false };
const internalTool = (name: string) => T3_DISPATCH_TOOLS.includes(name) || name === PENDING_TOOL;

/** T3 MCP dispatch and questions, with a separately authorized device connection for approvals. */
export class T3CodeConnector implements Connector, DispatchPort {
  get id() { return this.options.remote?.id ?? "t3code"; }
  get name() { return this.options.remote?.name ?? "T3 Code"; }
  readonly dispatch = this;
  private records: DurableRecords<T3Record>;
  private serial: KeyedSerial;
  private client: McpClient;
  private options: T3Options;
  private listed: Promise<ConnectorTool[]> | undefined;
  private approval?: T3ApprovalClient;
  private closed = false;
  constructor(options: T3Options, previous?: T3CodeConnector) {
    this.options = options;
    this.serial = previous?.serial ?? new KeyedSerial();
    if (!!options.provider !== !!options.model) throw new Error("DEEPBOT_T3_PROVIDER 和 DEEPBOT_T3_MODEL 必须同时设置");
    this.client = this.createClient(options.token);
    if (options.approvalToken && options.remote?.enabled !== false) this.approval = new T3ApprovalClient(this.endpoint, options.approvalToken);
    this.records = new DurableRecords(options.dataDir, this.id);
  }
  private get endpoint() { return this.options.url ?? T3_DEFAULT_URL; }
  private get runtimeMode() { return this.options.runtimeMode ?? DEFAULT_RUNTIME_MODE; }
  private createClient(token?: string) {
    return new McpClient(
      { url: this.endpoint, ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) },
      "T3 Code", { allowPrivateHttp: !!this.options.remote },
    );
  }
  private async checkEnvironment(signal = AbortSignal.timeout(3500)) {
    if (this.closed) throw new Error("T3 Code 连接已更新，请重试");
    const remote = this.options.remote;
    if (!remote) return;
    if (!remote.enabled) throw new Error("执行器已断开，请在连接设置中重连");
    await this.checkRemoteIdentity(remote.environmentId, signal);
    if (this.closed) throw new Error("T3 Code 连接已更新，请重试");
  }
  private async checkRemoteIdentity(environmentId: string, signal: AbortSignal) {
    if (await t3EnvironmentId(this.endpoint, signal) !== environmentId)
      throw new Error("T3 Code 环境与已配对的电脑不匹配");
  }
  private async callJson(tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    await this.checkEnvironment(signal);
    return this.client.callJson(tool, args, signal);
  }
  private async discoverDispatch(signal = AbortSignal.timeout(3500)) {
    await this.checkEnvironment(signal);
    const tools = await this.discover(this.client, signal);
    if (REQUIRED_REMOTE_TOOLS.some(name => !tools.some(tool => tool.name === name)))
      throw new Error("此 T3 Code 连接缺少派工权限或必要工具");
    this.listed = Promise.resolve(tools);
    return tools;
  }
  async validateRemote(signal: AbortSignal) {
    await this.discoverDispatch(signal);
    await this.projectPage(0, signal);
    await this.approval?.check(signal);
  }
  private async discover(client: McpClient, signal?: AbortSignal) {
    try {
      return await client.listTools(signal);
    } catch (error) {
      if (error instanceof McpHttpError) {
        if (error.status === 401) throw new Error("T3 Code MCP HTTP 401，密钥无效或缺失");
        if (error.status === 403) throw new Error("该密钥无权连接 T3 Code");
        throw error;
      }
      if (signal?.aborted) throw new Error("连接 T3 Code 超时");
      // The remote server's response can contain credential material.
      throw new Error("无法连接 T3 Code，请检查服务");
    }
  }
  async configureToken(value: unknown, signal: AbortSignal) {
    await this.configure({ token: value }, signal);
  }
  async configure(input: { token?: unknown; approvalCredential?: unknown; runtimeMode?: T3RuntimeMode }, signal: AbortSignal) {
    if (input.runtimeMode !== undefined && !runtimeModeValue(input.runtimeMode)) throw new Error("T3 Code 执行模式无效");
    const mode = input.runtimeMode ?? this.runtimeMode;
    const hasToken = input.token !== undefined;
    const hasApproval = input.approvalCredential !== undefined;
    if (!hasToken && !hasApproval && input.runtimeMode === undefined) throw new Error("请填写 T3 Code 连接配置");
    const token = hasToken ? await resolveT3Credential(input.token, this.endpoint, signal, mode) : undefined;
    const client = token ? this.createClient(token) : this.client;
    try {
      const tools = token ? await this.discover(client, signal) : undefined;
      if (tools && new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error("T3 Code 返回了重复的工具名称");
      const approvalToken = hasApproval ? await resolveT3ApprovalCredential(input.approvalCredential, this.endpoint, signal) : undefined;
      const approval = approvalToken ? new T3ApprovalClient(this.endpoint, approvalToken) : undefined;
      await approval?.check(signal);
      if (signal.aborted) throw new Error("连接 T3 Code 超时");
      writeT3Settings(this.options.dataDir, { runtimeMode: mode, ...(token ? { savedToken: token } : {}), ...(approvalToken ? { approvalToken } : {}) });
      this.options.runtimeMode = mode;
      if (approval) this.approval = approval;
      if (tools) {
        const previous = this.client;
        this.client = client;
        this.listed = Promise.resolve(tools);
        void previous.close();
      }
    } catch (error) {
      if (token) void client.close();
      throw error;
    }
  }
  capabilities(): DispatchCapabilities { return { ...CAPABILITIES, permissionRelay: !!this.approval }; }
  private all(): Promise<ConnectorTool[]> {
    const client = this.client;
    this.listed ??= this.discover(client).catch((error) => {
      if (client === this.client) this.listed = undefined;
      throw error;
    });
    return this.listed;
  }
  async tools(): Promise<ConnectorTool[]> {
    if (this.options.remote) return [];
    return (await this.all()).filter((tool) => !internalTool(tool.name));
  }
  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (this.options.remote || internalTool(name)) throw new Error("T3 Code 的线程操作要通过事项派活");
    return this.client.call(name, args, signal);
  }
  async available(): Promise<{ available: boolean; reason?: string }> {
    try {
      await (this.options.remote ? this.discoverDispatch() : this.all());
      return { available: true };
    }
    catch (error) { return { available: false, reason: errorMessage(error) }; }
  }
  async status(): Promise<ConnectorStatus> {
    const state = await this.available();
    const listed = state.available ? await this.all() : undefined;
    const remote = this.options.remote;
    const [grantedMode, approvalReason] = await Promise.all([
      listed?.some(tool => tool.name === "orchestrator_capabilities")
        ? this.callJson("orchestrator_capabilities", {}, AbortSignal.timeout(3500)).then(result =>
          isRecord(result) && runtimeModeValue(result.runtimeMode) ? result.runtimeMode : undefined, () => undefined)
        : undefined,
      !remote || state.available ? this.approval?.check(AbortSignal.timeout(3500)).then(() => undefined, errorMessage) : undefined,
    ]);
    const approvalAvailable = !!this.approval && !approvalReason && (!remote || state.available);
    return {
      id: this.id, name: this.name, transport: "mcp", builtin: !remote,
      ...(remote ? { remoteT3: { url: this.endpoint, enabled: remote.enabled, hasApprovalCredential: !!this.options.approvalToken } } : {}),
      description: "查询项目和线程，在项目里派活并处理 T3 Code 请求",
      ...state,
      ...(!remote && listed ? { tools: listed.filter(tool => !internalTool(tool.name)).length } : {}),
      ...(!listed || T3_DISPATCH_TOOLS.every(name => listed.some(tool => tool.name === name)) ? { dispatch: { ...CAPABILITIES, permissionRelay: approvalAvailable } } : {}),
      t3: { runtimeMode: this.runtimeMode, ...(grantedMode ? { grantedMode } : {}), approvalAvailable, ...(approvalReason ? { approvalReason } : {}) },
    };
  }
  async start(input: { assignmentId: string; brief: Brief }): Promise<SessionRef> {
    return this.serial.run(input.assignmentId, async () => {
      const existing = this.records.get(input.assignmentId);
      if (existing?.ref) return existing.ref;
      const record: T3Record = existing ?? { ...input, reports: [], inputs: [] };
      const runtimeMode = record.runtimeMode ??= record.brief.t3RequireApproval ? "approval-required" : this.runtimeMode;
      this.records.put(record);
      const project = await this.resolveProject(record.brief.cwd, record.brief.t3ProjectId);
      const launched = await this.callJson("t3_thread_launch", {
        projectId: project.id,
        title: `[${record.brief.botName}] ${record.brief.goal}`.slice(0, 200),
        message: briefText(input.assignmentId, this.options.remote
          ? { ...record.brief, cwd: project.workspaceRoot, connectedFolders: [] }
          : record.brief),
        // T3 deduplicates by this key, so a launch retried after a crash reuses the thread it started.
        clientRequestId: `deepbot:start:${input.assignmentId}`,
        runtimeMode,
        ...(this.options.provider ? { modelSelection: { instanceId: this.options.provider, model: this.options.model } } : {}),
      }).catch(error => {
        if (runtimeMode === "full-access" && /runtime.?mode|full-access|approval-required/i.test(errorMessage(error)))
          throw new Error(`T3 Code 无法使用完全访问模式，请在连接器设置核对配对权限和 T3 提供方支持。${errorMessage(error)}`);
        throw error;
      });
      const thread = requireShape(launched, launchedThread, "T3 Code 未返回有效 threadId");
      const runId = thread.runId ?? thread.latestRunId;
      if (runId == null) delete record.runId;
      else record.runId = runId;
      if (record.runId === undefined) delete record.firstRunId;
      else record.firstRunId = record.runId;
      record.projectRoot = project.workspaceRoot;
      record.ref = { assignee: this.id, id: input.assignmentId, conversationId: thread.threadId,
        ...(thread.link ? { url: thread.link } : {}),
        ...(this.options.remote ? { remoteCwd: project.workspaceRoot } : {}),
      };
      this.records.report(record, { kind: "progress", text: "T3 Code 已接收派工", ...(record.ref.url ? { externalUrl: record.ref.url } : {}) }, "started");
      return record.ref;
    });
  }
  async send(session: SessionRef, input: { inputId: string; text: string }): Promise<void> {
    return this.serial.run(session.id, async () => {
      const record = this.require(session);
      if (record.cancelled) throw new Error("派工已取消");
      let prior = record.inputs.find((item) => item.inputId === input.inputId);
      if (prior?.state === "sent") return;
      const threadId = record.ref!.conversationId!;
      // T3 deduplicates across threads; local effect IDs can repeat in separate databases.
      prior ??= { ...input, state: "sending", clientRequestId: `deepbot:input:${fingerprint([threadId, input.inputId], 40)}` };
      if (!record.inputs.includes(prior)) record.inputs.push(prior);
      this.records.put(record);
      // In-flight inputs from the old connector must retry with the original key.
      const clientRequestId = prior.clientRequestId ?? `deepbot:input:${input.inputId}`;
      const sent = await this.callJson("t3_thread_send", { threadId, message: prior.text, mode: "auto", clientRequestId });
      const { runId, messageId, delivery } = requireShape(sent, sentMessage, "T3 Code 返回的消息确认无效");
      Object.assign(prior, { runId, messageId, delivery, state: "sent" });
      if (delivery !== "queued") record.runId = runId;
      this.records.report(record, { kind: "progress", text: deliveryText[delivery] }, `sent:${input.inputId}`);
    });
  }
  async cancel(session: SessionRef, reason: string): Promise<void> {
    await this.serial.run(session.id, async () => {
      const record = this.require(session);
      if (record.cancelled) return;
      await this.callJson("t3_thread_interrupt", { threadId: record.ref!.conversationId, ...(record.runId ? { runId: record.runId } : {}), stop: true, reason, clientRequestId: `deepbot:cancel:${record.assignmentId}` });
      record.cancelled = true; this.records.put(record);
    });
  }
  async isSettled(session: SessionRef): Promise<boolean> {
    return this.serial.run(session.id, async () => {
      const current = await this.read(this.require(session));
      const thread = current.thread;
      if (!thread || thread.activeRunId || (thread.pendingRequestCount ?? 0) > 0) return false;
      return !!thread.status && ["idle", "completed", "failed", "cancelled", "interrupted", "rolled_back"].includes(thread.status);
    });
  }
  async respondRequest(session: SessionRef, reportId: string, input: { inputId: string; value: string; answers?: RemoteAnswers }): Promise<{ value: string } | { error: string }> {
    return this.serial.run(session.id, async () => {
      const record = this.require(session);
      if (record.cancelled) return { error: "派工已停止" };
      const pending = record.pendingRequests?.find(request => request.reportId === reportId);
      if (!pending) return { value: "T3 Code 已处理" };
      const threadId = record.ref!.conversationId!;
      try {
        await this.checkEnvironment();
        if (pending.kind === "question") {
          const requestIds = await this.questionIds(threadId);
          if (!requestIds.includes(pending.requestId)) return { value: "T3 Code 已处理" };
          const questions = await this.readQuestion(threadId, pending.requestId);
          const answers = validateT3Answers(questions, input.answers);
          const result = await this.callJson(PENDING_TOOL, { action: "respond", threadId, requestId: pending.requestId, answers });
          if (!isRecord(result) || !number(result.sequence)) throw new Error("T3 Code 未确认收到答复");
        } else if (pending.kind === "approval" && this.approval) {
          const projection = await this.approval.projection(threadId);
          const request = liveApprovals(projection, this.ownedRuns(record)).find(({ item }) => item.requestId === pending.requestId);
          if (!request) return { value: "T3 Code 已处理或请求已失效" };
          const value = input.value === "批准" ? "批准" : input.value === "拒绝" ? "拒绝" : undefined;
          if (!value || !request.options.includes(value)) return { error: "T3 Code 审批选项已变化，请打开 T3 Code 处理" };
          await this.checkEnvironment();
          await this.approval.respond(threadId, pending.requestId, `deepbot:reply:${input.inputId}`, value === "批准" ? "accept" : "decline");
        } else return { error: "请打开 T3 Code 处理此请求" };
      } catch (error) {
        return { error: errorMessage(error) };
      }
      this.records.report(record, { kind: "progress", text: "T3 Code 已收到答复", resolvedRequests: [{ reportId, value: input.value }] }, `reply:${reportId}`);
      if (record.pendingRequests) record.pendingRequests = record.pendingRequests.filter(entry => entry.reportId !== reportId);
      this.records.put(record);
      return { value: input.value };
    });
  }
  async reattach(session: SessionRef): Promise<"alive" | "lost"> {
    const record = this.records.get(session.id);
    if (!record?.ref || record.ref.assignee !== session.assignee || session.assignee !== this.id || record.ref.conversationId !== session.conversationId) return "lost";
    try { const current = await this.read(record); return current.thread?.threadId === record.ref.conversationId ? "alive" : "lost"; }
    catch (error) {
      // Transport errors are not proof the remote execution disappeared.
      if (/thread_not_found|not found|不存在|unknown thread/i.test(errorMessage(error))) return "lost";
      throw error;
    }
  }
  async *events(session: SessionRef, cursor?: string): AsyncIterable<Report> {
    const record = await this.serial.run(session.id, async () => {
      let current = this.require(session);
      if (!current.cancelled && Date.now() - (current.lastPollAt ?? 0) >= (this.options.pollMs ?? 1500)) {
        const result = await this.read(current);
        current = this.require(session);
        current.lastPollAt = Date.now();
        if (result.thread?.link && current.ref) current.ref.url = result.thread.link;
        const thread = result.thread ?? {};
        const messages = result.messages;
        const runs = result.recentRuns ?? [];
        for (const input of current.inputs) {
          if (!input.runId || input.state !== "sent") continue;
          const previousDelivery = input.delivery;
          const run = runs.find(candidate => candidate.runId === input.runId);
          if (input.delivery === "queued") {
            const message = messages.find(item => item.type === "user_message" && item.messageId === input.messageId);
            if (message?.runId && (message.runId !== input.runId || run?.status !== "queued")) {
              input.delivery = message.runId === input.runId ? "started" : "steered";
              input.runId = message.runId;
            } else if (failedStatus(run?.status)) input.delivery = "unconfirmed";
          } else if (!input.delivery && input.runId !== current.firstRunId && run?.status === "cancelled" && run.startedAt === null) {
            // Old records kept only the queued run ID, without a message identity.
            input.delivery = "unconfirmed";
          }
          if (input.delivery && input.delivery !== previousDelivery) {
            this.records.report(current, { kind: "progress", text: deliveryText[input.delivery] }, `delivery:${input.inputId}`);
          }
        }
        const owned = this.ownedRuns(current);
        const activeRunId = thread.activeRunId && owned.has(thread.activeRunId) ? thread.activeRunId : undefined;
        // recentRuns is newest first. Only runs linked to this assignment can provide its result.
        const runId = activeRunId ?? runs.find(run => owned.has(run.runId))?.runId ?? [...owned].at(-1);
        if (runId) current.runId = runId;
        const exact = messages.filter(item => !runId || item.runId === runId);
        const last = exact.findLast(item => item.type === "assistant_message");
        const run = runs.find(item => item.runId === runId);
        const status = run?.status ?? (runId && thread.latestRunId !== runId ? undefined : thread.status);
        const queued = current.inputs.some(input => input.delivery === "queued");
        const delivery = queued ? "queued" : current.inputs.at(-1)?.delivery;
        const supplement = delivery ? `${deliveryText[delivery]}\n` : "";
        const settled = !activeRunId && !queued;
        const externalUrl = current.ref?.url;
        await this.syncRequests(current, thread);
        if ((thread.pendingRequestCount ?? 0) === 0) {
          if (settled && status === "completed" && last?.text) {
            const text = delivery === "unconfirmed" ? supplement + last.text : last.text;
            this.records.report(current, { kind: "ready", text, evidence: [{ ...(externalUrl ? { url: externalUrl } : {}), text: `T3 Code 运行 ${runId ?? thread.latestRunId} 的完成汇报；尚需 Bot 验收` }], ...(externalUrl ? { externalUrl } : {}) }, `ready:${runId ?? thread.latestRunId}:${fingerprint(text, 24)}`);
          } else if (settled && failedStatus(status)) {
            this.records.report(current, { kind: "failed", text: `${supplement}T3 Code 执行结束：${status}${last?.text ? `\n${last.text}` : ""}`, ...(externalUrl ? { externalUrl } : {}) }, `ended:${runId}:${status}`);
          } else {
            const progress = last?.text ? last.text.slice(-1000) : `T3 Code：${status ?? thread.status ?? "执行中"}`;
            this.records.report(current, { kind: "progress", text: supplement + progress, ...(externalUrl ? { externalUrl } : {}) }, `progress:${fingerprint([thread.status, thread.itemCount, supplement, progress], 24)}`);
          }
        }
        this.records.put(current);
      }
      return current;
    });
    // A legacy poll may have persisted the spurious failure before the work ledger accepted it.
    const obsoleteFailures = new Set(record.inputs.filter(input => input.delivery === "unconfirmed").map(input =>
      `${record.assignmentId}:ended:${input.runId}:cancelled`));
    yield* this.records.after(record, cursor).filter(report => !obsoleteFailures.has(report.id));
  }
  async close(): Promise<void> {
    this.closed = true;
    const remote = this.options.remote;
    await this.client.close(remote ? () => this.checkRemoteIdentity(remote.environmentId, AbortSignal.timeout(1000)) : undefined);
  }
  private ownedRuns(record: T3Record) {
    const runs = new Set([record.firstRunId, record.runId, ...record.inputs.map(input => input.runId)].filter((id): id is string => !!id));
    for (const input of record.inputs) {
      if (input.runId && input.delivery === "unconfirmed") runs.delete(input.runId);
    }
    return runs;
  }
  private async questionIds(threadId: string): Promise<string[]> {
    const result = await this.callJson(PENDING_TOOL, { action: "list", threadId });
    if (!isRecord(result) || !arrayOf(string)(result.requestIds)) throw new Error("T3 Code 未返回待答复的问题");
    return result.requestIds;
  }
  private async readQuestion(threadId: string, requestId: string) {
    const result = await this.callJson(PENDING_TOOL, { action: "read", threadId, requestId });
    return isRecord(result) && result.requestId === requestId ? t3Questions(result.questions) : [];
  }
  private async syncRequests(record: T3Record, thread: { pendingRequestCount?: number; activeRunId?: string | null; latestRunId?: string | null }) {
    const waiting = (thread.pendingRequestCount ?? 0) > 0;
    const previous = record.pendingRequests ?? [];
    const runs = this.ownedRuns(record);
    const runId = thread.activeRunId ?? thread.latestRunId;
    const threadId = record.ref!.conversationId!;
    const externalUrl = record.ref!.url;
    const link = externalUrl ? { externalUrl } : {};
    const pending: PendingRequest[] = [];
    let handled = 0;
    if (waiting && runId && runs.has(runId)) {
      const supportsQuestions = (await this.all()).some(tool => tool.name === PENDING_TOOL);
      if (supportsQuestions) {
        const ids = await this.questionIds(threadId).catch(() => undefined);
        if (!ids) pending.push(...previous.filter(request => request.kind === "question"));
        else for (const requestId of ids) {
          const existing = previous.find(request => request.requestId === requestId && request.kind === "question");
          if (existing) { pending.push(existing); continue; }
          // A question can be answered in T3 between listing it and reading its content.
          const questions = await this.readQuestion(threadId, requestId).catch(() => []);
          if (!questions.length) continue;
          const report = this.records.report(record, {
            kind: "question", text: questions.length === 1 ? questions[0]!.question : "T3 Code 有几个问题要确认",
            remoteRequest: { kind: "question", questions }, ...link,
          }, `t3-question:${requestId}`);
          pending.push({ kind: "question", requestId, reportId: report.id });
        }
      }
      const approval = this.approval;
      const projection = approval && await this.checkEnvironment()
        .then(() => approval.projection(threadId)).catch(() => undefined);
      if (!projection) pending.push(...previous.filter(request => request.kind === "approval"));
      if (approval && projection) for (const request of liveApprovals(projection, runs)) {
        const requestId = request.item.requestId;
        const existing = previous.find(entry => entry.requestId === requestId && entry.kind === "approval");
        if (existing) { pending.push(existing); continue; }
        const action = approvalAction(request);
        const workspace = projection.thread.worktreePath ?? record.projectRoot;
        const permissions = workspace && !record.brief.t3RequireApproval && await this.options.activePermissions?.(record.assignmentId);
        if (workspace && permissions && await canAutoApprove(request, record.brief, workspace, permissions)) {
          const accepted = await approval.respond(threadId, requestId, `deepbot:auto:${record.assignmentId}:${requestId}`, "accept").then(() => true, () => false);
          if (accepted) {
            handled++;
            this.records.report(record, { kind: "progress", text: action.content ?? action.description, botApproved: true }, `t3-auto:${requestId}`);
            continue;
          }
        }
        const report = this.records.report(record, { kind: "permission", text: `T3 Code 请求${action.description}`, action, remoteRequest: { kind: "approval", options: request.options }, ...link }, `t3-approval:${requestId}`);
        pending.push({ kind: "approval", requestId, reportId: report.id });
      }
    }
    if (waiting && (thread.pendingRequestCount ?? 0) > pending.length + handled) {
      const existing = previous.find(request => request.kind === "external");
      if (existing) pending.push(existing);
      else {
        const activity = await this.callJson("t3_thread_read", { threadId, view: "activity", limit: 50, maxCharsPerItem: 2000 }).catch(() => undefined);
        const item = threadPage(activity) ? activity.items?.find(candidate => candidate.type === "approval_request" && candidate.status === "waiting" && candidate.runId === runId) : undefined;
        const requestId = `wait:${runId}:${record.reports.length}`;
        const report = this.records.report(record, {
          kind: "permission", text: "请在 T3 Code 处理待回复请求", remoteRequest: { kind: "external" }, ...link,
          ...(typeof item?.text === "string" && item.text ? { action: { kind: "command", description: item.text } } : {}),
        }, requestId);
        pending.push({ kind: "external", requestId, reportId: report.id });
      }
    }
    record.pendingRequests = pending;
    const resolved = previous.filter(entry => !pending.some(request => request.reportId === entry.reportId)).map(entry => entry.reportId);
    // Close the count-based cards left by older versions when a fresh poll can replace or clear them.
    for (const report of record.reports.filter(report => report.id.startsWith(`${record.assignmentId}:waiting:`))) resolved.push(report.id);
    const newResolutions = resolved.filter(reportId => !record.reports.some(report => report.resolvedRequests?.some(entry => entry.reportId === reportId)));
    if (newResolutions.length) this.records.report(record, {
      kind: "progress", text: "T3 Code 已更新待回复请求",
      resolvedRequests: newResolutions.map(reportId => ({ reportId, value: waiting ? "请查看当前 T3 Code 请求" : "T3 Code 已处理" })),
    }, `t3-resolved:${fingerprint(newResolutions, 24)}`);
  }
  private require(session: SessionRef): T3Record {
    if (session.assignee !== this.id) throw new Error("派活对象不匹配");
    const record = this.records.get(session.id);
    if (!record?.ref || record.ref.conversationId !== session.conversationId) throw new Error("T3 Code 派工记录不存在");
    return record;
  }
  private async read(record: T3Record) {
    const args = { threadId: record.ref!.conversationId, view: "messages", limit: 100, maxCharsPerItem: 20_000, runLimit: 50 };
    // Page through every timeline item; completion is matched to the launched run, not an unrelated later run.
    let afterPosition = -1;
    const messages = [];
    for (;;) {
      const page = requireShape(await this.callJson("t3_thread_read", { ...args, afterPosition }), threadPage, "T3 Code 返回的消息页无效");
      messages.push(...(page.items ?? []).filter(item => item.type === "user_message" || item.type === "assistant_message"));
      if (messages.length > 10_000) throw new Error("T3 Code 消息数量超过同步上限");
      if (!page.hasMore) return { ...page, messages };
      if (page.nextPosition == null || page.nextPosition <= afterPosition) throw new Error("T3 Code 返回的消息分页游标无效");
      afterPosition = page.nextPosition;
    }
  }
  private async projectPage(cursor: number, signal?: AbortSignal) {
    const response = await this.callJson(PROJECT_TOOL, { cursor, limit: 100 }, signal);
    return requireShape(response, projectPage, "T3 Code 返回的项目列表无效");
  }
  async projects(signal?: AbortSignal) {
    let cursor: number | null | undefined = 0;
    const seen = new Set<number>();
    const projects: T3Project[] = [];
    while (cursor != null) {
      if (seen.has(cursor) || seen.size >= 100) throw new Error("T3 Code 返回的项目分页游标无效或项目过多");
      seen.add(cursor);
      const page = await this.projectPage(cursor, signal);
      projects.push(...page.projects.map(({ id, workspaceRoot, title }) => ({ id, workspaceRoot, ...(title ? { title } : {}) })));
      cursor = page.nextCursor;
    }
    return projects;
  }
  private async resolveProject(cwd: string, projectId?: string) {
    const projects = await this.projects(this.options.remote ? AbortSignal.timeout(10_000) : undefined);
    if (projectId) {
      const project = projects.find(entry => entry.id === projectId);
      if (!project) throw new Error("所选执行器上找不到指定的 T3 Code 项目");
      return project;
    }
    const matching = projects.filter(project => within(resolve(project.workspaceRoot), resolve(cwd)));
    const result = matching.sort((left, right) => right.workspaceRoot.length - left.workspaceRoot.length)[0];
    if (!result) throw new Error(this.options.remote
      ? `所选执行器上没有匹配目录的项目：${cwd}。请先查询此执行器的项目，再指定项目派工`
      : `工作目录尚未登记为 T3 Code 项目：${cwd}。可先用 T3 的 t3_project_create 登记`);
    return result;
  }
}
