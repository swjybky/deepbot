import {
  configure,
  type LiveState,
  type EntryId,
} from "@earendil-works/pi-durable";
import type { DispatchPort } from "../connectors/port.ts";
import type { Brief, DispatchCapabilities, Report, SessionRef } from "../protocol.ts";
import type { DeepBotApp } from "../runtime/app.ts";
import { ctx, textOf } from "../runtime/conversation-values.ts";
import { changed, touchWork } from "../work/ledger.ts";

type BriefContext = {
  messages?: { id: string; author?: string; text: string }[];
  background?: string;
  memory?: { id: string; text: string }[];
  handoff?: unknown;
};

/** Format a structured, un-escaped assignment prompt without duplicating system instructions. */
export function formatBriefPrompt(brief: Brief, reused = false): string {
  const header = reused
    ? "执行派工，在当前会话上继续完成后续要求并验证（先核对相关文件最新状态，完成后登记新增或变更产物）："
    : "执行派工，直到目标全部完成并验证，若缺信息按工具提问：";
  const lines = [
    header,
    `目标：${brief.goal}`,
    `验收标准：\n${brief.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    `工作目录：${brief.cwd}`,
    `范围：${brief.scope}`,
    `权限：files=${brief.permissions.files}，browser=${brief.permissions.browser}，confirmPublish=${brief.permissions.confirmPublish}，deleteFiles=${brief.permissions.deleteFiles}`,
  ];
  if (brief.connectedFolders.length) {
    lines.push(`已连接文件夹：${brief.connectedFolders.join("、")}`);
  }
  let parsed: BriefContext | undefined;
  try {
    const raw = JSON.parse(brief.context) as unknown;
    if (raw && typeof raw === "object") parsed = raw as BriefContext;
  } catch {
    if (brief.context.trim()) lines.push(`附加上下文：\n${brief.context}`);
  }
  if (parsed?.background?.trim()) {
    lines.push(`前序讨论背景：\n${parsed.background.trim()}`);
  }
  if (parsed?.messages?.length) {
    lines.push(
      `关联对话消息：\n${parsed.messages.map((m) => `- ${m.author === "bot" ? "[Bot] " : m.author === "person" ? "[用户] " : ""}${m.text}`).join("\n")}`,
    );
  }
  if (parsed?.memory?.length) {
    lines.push(`长期记忆：\n${parsed.memory.map((m) => `- ${m.text}`).join("\n")}`);
  }
  if (parsed?.handoff) {
    lines.push(`前序交接记录：\n${JSON.stringify(parsed.handoff, null, 2)}`);
  }
  return lines.join("\n\n");
}

/** Summarize Pi Durable's live run state into a compact progress line for the activity panel. */
export function summarizeLiveState(live: LiveState): string | undefined {
  if (live.compactions?.some((c) => c.blocking)) {
    return "正在自动压缩上下文…";
  }
  if (live.generation?.retry) {
    return `模型请求等待重试（第 ${live.generation.attempt} 次）`;
  }
  const running = (live.tools ?? []).filter(
    (t) => t.status === "running" && !["report_progress", "report_question", "pass_wait"].includes(t.name),
  );
  const turn = (live.run?.turns ?? 0) + 1;
  if (running.length) {
    const labels = running.map((t) => {
      if (t.name !== "codemode") return t.name;
      const nested = (live.nestedTools ?? []).filter(
        (n) => n.parentCallId === t.callId && n.status === "running",
      );
      if (!nested.length) return "codemode";
      const names = nested.slice(0, 2).map((n) => n.name).join(",");
      return `codemode(${names}${nested.length > 2 ? ",…" : ""})`;
    });
    const bashOut = [...running]
      .reverse()
      .find((t) => t.name === "bash" && t.output?.trim())
      ?.output?.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      .replace(/\r/g, "");
    const lastLine = bashOut
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1);
    const tail = lastLine
      ? lastLine.length > 72
        ? `${lastLine.slice(0, 71)}…`
        : lastLine
      : "";
    return `第 ${turn} 轮 · 正在执行 ${labels.join("、")}${tail ? `：${tail}` : ""}`;
  }
  if ((live.run?.turns ?? 0) > 0) {
    return `第 ${turn} 轮 · 正在思考与整理下一步`;
  }
  return undefined;
}

/** The Bot's own background worker: a coding-agent conversation per assignment, in the work's folder. */
export class SelfWorker implements DispatchPort {
  readonly id = "self";
  readonly name = "Bot 自己";
  app: DeepBotApp;
  constructor(app: DeepBotApp) {
    this.app = app;
  }
  capabilities(): DispatchCapabilities {
    return { steer: true, cancel: true, reattach: true, permissionRelay: true, stream: true };
  }
  async available() {
    return { available: true };
  }
  async start(input: {
    assignmentId: string;
    brief: Brief;
  }): Promise<SessionRef> {
    const ledger = await this.app.ledger();
    const current = ledger.data.assignments.find((x) => x.id === input.assignmentId);
    const prev = current
      ? ledger.data.assignments
          .filter((x) => x.workId === current.workId && x.id !== input.assignmentId)
          .at(-1)
      : undefined;
    let reuseConversationId: string | undefined;
    if (prev?.assignee === "self" && prev.sessionRef?.conversationId) {
      const existing = await this.app.sessionConversation(prev.sessionRef.conversationId);
      if (existing) {
        const live = await this.app.sessionLive(prev.sessionRef.conversationId);
        if (live?.run) await existing.abort(ctx);
        reuseConversationId = prev.sessionRef.conversationId;
      }
    }
    const agent = await this.app.workerAgent(input.brief, ledger.data.settings.executor);
    const { ref, reused } = await this.app.mutate(async (l, tx) => {
      const a = l.data.assignments.find((a) => a.id === input.assignmentId)!;
      if (a.sessionRef) return { ref: a.sessionRef, reused: false };
      if (!a.taskId) throw new Error("后台执行必须由持久后台任务持有");
      if (reuseConversationId) {
        const ref: SessionRef = {
          assignee: this.id,
          id: a.id,
          conversationId: reuseConversationId,
        };
        a.sessionRef = ref;
        changed(l);
        return { ref, reused: true };
      }
      const c = await tx.createConversation({
        ownership: { kind: "ownerless" },
      });
      await configure(tx, c.id, agent);
      const ref: SessionRef = {
        assignee: this.id,
        id: a.id,
        conversationId: String(c.id),
      };
      a.sessionRef = ref;
      changed(l);
      return { ref, reused: false };
    });
    await this.send(ref, {
      inputId: `initial:${input.assignmentId}`,
      text: formatBriefPrompt(input.brief, reused),
    });
    return ref;
  }
  async send(
    ref: SessionRef,
    input: { inputId: string; text: string },
  ): Promise<void> {
    const c = await this.app.sessionConversation(ref.conversationId);
    if (!c) throw new Error("后台执行会话不存在");
    // A reopened or restarted work runs with the current executor settings and model alias.
    const l = await this.app.ledger();
    const brief = l.data.assignments.find((a) => a.id === ref.id)?.brief;
    if (brief) await c.configure(await this.app.workerAgent(brief, l.data.settings.executor), ctx);
    await this.app.mutate(async (l, tx) => {
      const a = l.data.assignments.find((a) => a.id === ref.id)!;
      if (a.inputIds.includes(input.inputId)) return;
      const sid = await c.submit(tx, {
        type: "input",
        content: input.text,
        requestId: input.inputId,
        whenBusy: "steer",
      });
      if (!l.selfSubmissions[a.id]) l.selfSubmissions[a.id] = [];
      l.selfSubmissions[a.id]!.push(String(sid));
      a.inputIds.push(input.inputId);
    });
  }
  async cancel(ref: SessionRef, _reason: string): Promise<void> {
    const c = await this.app.sessionConversation(ref.conversationId);
    await c?.abort(ctx);
  }
  async reattach(ref: SessionRef): Promise<"alive" | "lost"> {
    return await this.app.sessionConversation(ref.conversationId) ? "alive" : "lost";
  }
  private async syncLiveProgress(assignmentId: string, live: LiveState) {
    const status = summarizeLiveState(live);
    if (!status) return;
    const l = await this.app.ledger();
    const a = l.data.assignments.find((x) => x.id === assignmentId);
    const w = l.data.works.find((x) => x.id === a?.workId);
    if (
      !a ||
      a.state !== "running" ||
      !w ||
      w.state !== "open" ||
      w.phase !== "running" ||
      w.assignmentId !== a.id
    )
      return;
    const manual = l.reports
      .filter((r) => r.assignmentId === a.id && r.kind === "progress")
      .at(-1)?.text;
    const next = manual ? `${manual}\n${status}` : status;
    if (w.progress === next) return;
    await this.app.mutate((draft) => {
      const curA = draft.data.assignments.find((x) => x.id === assignmentId);
      const curW = draft.data.works.find((x) => x.id === curA?.workId);
      if (
        !curA ||
        curA.state !== "running" ||
        !curW ||
        curW.state !== "open" ||
        curW.phase !== "running" ||
        curW.assignmentId !== curA.id
      )
        return;
      if (curW.progress === next) return;
      curW.progress = next;
      touchWork(draft, curW.id);
      changed(draft);
    });
  }
  async *events(ref: SessionRef, _cursor?: string): AsyncIterable<Report> {
    const l = await this.app.ledger();
    const a = l.data.assignments.find((a) => a.id === ref.id);
    if (!a) return;
    const live = await this.app.sessionLive(ref.conversationId);
    if (live?.run) {
      await this.syncLiveProgress(a.id, live);
      return;
    }
    for (const sid of (l.selfSubmissions[a.id] ?? []).slice(-1)) {
      const record = await this.app.sessionSubmissionStatus(sid);
      if (!record) continue;
      if (record.status !== "done" && record.status !== "unanswered") continue;
      const id = `self:${a.id}:${sid}`;
      if (l.reports.some((r) => r.id === id) || l.selfSeen.includes(id))
        continue;
      if (record.status === "unanswered") {
        yield {
          id,
          assignmentId: a.id,
          kind: "failed",
          text: `后台执行未完成：${"reason" in record ? record.reason : "未知错误"}`,
          createdAt: Date.now(),
        };
        continue;
      }
      let text = "";
      let stopReason: string | undefined;
      if (record.type === "input" && record.status === "done") {
        const e = await this.app.sessionEntry(record.answer as EntryId);
        const m = e?.model?.[0];
        if (m?.role === "assistant") {
          stopReason = m.stopReason;
          if (!m.content.some((x) => x.type === "toolCall"))
            text = textOf(m.content);
        }
      }
      if (stopReason === "length") {
        const continues = a.inputIds.filter((x) =>
          x.startsWith("length-continue:"),
        ).length;
        if (continues < 3) {
          await this.send(ref, {
            inputId: `length-continue:${a.id}:${sid}`,
            text: "上一条回复因达到单次输出长度上限被截断，请紧接截断处继续完成派工目标并核验结果，不要重复已完成的操作。",
          });
          await this.app.mutate((draft) => {
            if (!draft.selfSeen.includes(id)) draft.selfSeen.push(id);
          });
        } else {
          yield {
            id,
            assignmentId: a.id,
            kind: "blocked",
            text: "后台执行连续触发单次输出长度上限，需要负责人检查进展后继续派工",
            createdAt: Date.now(),
          };
        }
        continue;
      }
      const work = l.data.works.find((w) => w.id === a.workId);
      const hasPendingReply = l.effects.some(
        (e) => e.assignmentId === a.id && e.kind === "send",
      );
      const waiting =
        work?.phase === "waiting" ||
        hasPendingReply ||
        l.data.attentions.some(
          (x) => x.assignmentId === a.id && x.state === "open",
        );
      if (!text.trim() || waiting) {
        if (!waiting)
          yield {
            id,
            assignmentId: a.id,
            kind: "blocked",
            text: "后台执行本轮结束但未提交结果，需要负责人检查并继续派工",
            createdAt: Date.now(),
          };
        else
          await this.app.mutate((draft) => {
            if (!draft.selfSeen.includes(id)) draft.selfSeen.push(id);
          });
        continue;
      }
      const evidence = l.data.artifacts
        .filter((x) => x.workId === a.workId)
        .map((x) => ({
          ...(x.path ? { path: x.path } : {}),
          ...(x.hash ? { hash: x.hash } : {}),
          ...(x.url ? { url: x.url } : {}),
          ...(x.text ? { text: x.text } : {}),
        }));
      yield {
        id,
        assignmentId: a.id,
        kind: "ready",
        text,
        evidence,
        createdAt: Date.now(),
      };
    }
  }
}
