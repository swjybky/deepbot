import type { Brief, ConnectorStatus, DispatchCapabilities, RemoteAnswers, Report, SessionRef } from "../protocol.ts";

/**
 * Who can take dispatched work: the Bot's own background worker ("self"), or a dispatch connector
 * (the built-in T3 over MCP, user ACP agents). `events` is a finite batch; persist its last report id as the next cursor.
 */
export interface DispatchPort {
  readonly id: string;
  readonly name: string;
  capabilities(): DispatchCapabilities;
  available(): Promise<{ available: boolean; reason?: string }>;
  start(input: { assignmentId: string; brief: Brief }): Promise<SessionRef>;
  send(session: SessionRef, input: { inputId: string; text: string }): Promise<void>;
  cancel(session: SessionRef, reason: string): Promise<void>;
  reattach(session: SessionRef): Promise<"alive" | "lost">;
  events(session: SessionRef, cursor?: string): AsyncIterable<Report>;
  /** Current remote state, never inferred from historical completion reports. */
  isSettled?(session: SessionRef): Promise<boolean>;
  respondPermission?(session: SessionRef, reportId: string, approved: boolean): Promise<void>;
  respondRequest?(session: SessionRef, reportId: string, input: { inputId: string; value: string; answers?: RemoteAnswers }): Promise<{ value: string } | { error: string }>;
}

/** A tool a connector offers to code mode scripts. */
export type ConnectorTool = { name: string; description: string; inputSchema: object };

/** A connector every Bot shares. */
export interface Connector {
  readonly id: string;
  status(): Promise<ConnectorStatus>;
  /** Tools for code mode. */
  tools?(): Promise<ConnectorTool[]>;
  callTool?(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  /** Present when work can be dispatched to it. */
  readonly dispatch?: DispatchPort;
  close?(): Promise<void>;
}

export class UnsupportedCancellationError extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedCancellationError"; }
}

export function briefText(assignmentId: string, brief: Brief): string {
  return [
    `[DeepBot assignment:${assignmentId}] 由 Bot「${brief.botName}」派出`,
    `目标：${brief.goal}`,
    `验收标准：\n${brief.criteria.map((value) => `- ${value}`).join("\n")}`,
    `范围与禁区：${brief.scope}`,
    `工作目录：${brief.cwd}`,
    `负责人指令：${brief.instructions}`,
    `上下文与交接：${brief.context}`,
    `权限约束：${JSON.stringify(brief.permissions)}；连接的目录：${JSON.stringify(brief.connectedFolders)}`,
    "不要扩大任务范围。发布、发送、删除和超出连接目录的操作必须遵守上述权限。汇报完成时提供实际证据、改动路径、测试结果或产物；自称完成不等于已验收。",
  ].join("\n\n");
}
