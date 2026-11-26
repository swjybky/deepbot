import { stat } from "node:fs/promises";
import {
  GenerationTask,
  configure,
  defineExtension,
  defineTool,
  hook,
  section,
  ToolTask,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import { obj, str, arr, bool, num, opt } from "@earendil-works/pi-schema";
import { allowedPath } from "../policy/gate.ts";
import type { DeepBotApp } from "../runtime/app.ts";
import { textOf } from "../runtime/conversation-values.ts";
import { addMessage, changed, copy, touchWork } from "../work/ledger.ts";
import type { RouteRule, Routine } from "../protocol.ts";
import { toolOutput as out } from "./tool-output.ts";
import { errorMessage } from "../wire-values.ts";
import { mcpAllowed } from "../connectors/managed-mcp.ts";
const bot = (app: DeepBotApp, api: ToolExecutionApi) =>
  app.botForConversation(String(api.conversationId));
async function ownWork(app: DeepBotApp, api: ToolExecutionApi, id: string) {
  const b = await bot(app, api);
  const l = await app.ledger();
  const w = l.data.works.find((w) => w.id === id && w.ownerBotId === b.id);
  if (!w) throw new Error("事项不属于当前 Bot");
  return w;
}
export function createFrontExtension(app: DeepBotApp) {
  return defineExtension({
    name: "deepbot.front",
    hooks: [
      hook(GenerationTask, {
        beforeRequest: async (_request, api) => {
          await app.applyForegroundTurnLimit(api.conversationId, api.taskId);
          return undefined;
        },
      }),
    ],
    sections: [
      section("deepbot_state", async (input, context) => {
        const l = await app.readLedger(input.read, context);
        if (!l) return undefined;
        const thread = l.data.threads.find(
          (t) => t.conversationId === String(input.conversationId),
        );
        const b = l.data.bots.find((x) => x.threadId === thread?.id);
        if (!b) return undefined;
        return [
          `essential 记忆：${JSON.stringify(l.data.memories.filter((m) => m.botId === b.id))}`,
          `关联文件夹：${JSON.stringify(b.folders)}`,
          `派活对象：${JSON.stringify([
            { id: "self", name: "Bot 自己的后台分身", available: true },
            ...l.data.connectors
              .filter((c) => c.dispatch)
              .map((c) => ({
                id: c.id,
                name: c.name,
                available: c.available,
                reason: c.reason,
                ...(c.remoteT3 ? { remoteT3: true } : {}),
              })),
          ])}`,
          `工具连接器（codemode 的 tools 里）：${JSON.stringify(
            l.data.connectors
              .filter((c) => c.tools !== undefined && mcpAllowed(c, b.id))
              .map((c) => ({ id: c.id, name: c.name, tools: c.tools })),
          )}`,
          `已确认规矩：${JSON.stringify(
            l.data.rules.filter(
              (r) => r.botId === b.id && r.enabled && r.confirmed,
            ),
          )}`,
        ].join("\n");
      }),
    ],
    tools: [
      defineTool({
        name: "say",
        description: "立即发出一条消息；汇报某件事项时必须传对应 workId，系统会显示事项标题。普通回执不传。验收交付用 work_review，已发的消息无需在最终回答中重复",
        parameters: obj({ text: str(), workId: opt(str()) }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          const work = args.workId ? await ownWork(app, api, args.workId) : undefined;
          await app.mutate((l) =>
            addMessage(l, {
              threadId: b.threadId,
              author: { kind: "bot", id: b.id },
              kind: "text",
              text: args.text,
              requestId: `say:${api.taskId}`,
              ...(work ? { workId: work.id, workTitle: work.title } : {}),
            }),
          );
          return out("消息已送达");
        },
      }),
      defineTool({
        name: "pass",
        description:
          "本轮无需回复，安静结束；say 或交付工具已经发过消息时也可以使用",
        parameters: obj({}),
        replay: "safe",
        execute: async () => ({
          ...out("本轮不回复"),
          control: { terminate: true },
        }),
      }),
      defineTool({
        name: "react",
        description: "给一条用户消息添加表情回执，不另发消息",
        parameters: obj({ messageId: str(), emoji: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          await app.mutate((l) => {
            const m = l.data.messages.find(
              (m) => m.id === args.messageId && m.threadId === b.threadId,
            );
            if (!m) throw new Error("消息不存在");
            m.reactions = [...new Set([...(m.reactions ?? []), args.emoji])];
            changed(l);
          });
          return { ...out("已回执"), control: { terminate: true } };
        },
      }),
      defineTool({
        name: "work_projects",
        description: "查询指定 T3 Code 执行器上的项目。远端派活前先按目标实例的 ID 查询，用返回的项目 ID 填 work_start 或 work_reassign 的 t3ProjectId",
        parameters: obj({ assignee: str() }),
        replay: "safe",
        execute: async ({ assignee }) => out(await app.t3Projects(assignee)),
      }),
      defineTool({
        name: "work_start",
        description:
          "开事项交给后台；前台立即返回，长任务、代码与文件工作使用这个工具。负责人保持不变。reply 是发给用户的回执，用自己的话说明发起了什么事、完成后会告知。assignee：self（你的后台分身）或派活连接器的 id，见系统提示里的派活对象。folder：事情和某个关联文件夹有关时填它的路径；和项目无关不填，在你的 workspace 里做。跨轮讨论后的事项，可用 context 或 sourceMessageIds（支持附带当前单聊里你之前的方案回复和用户原话）将前序背景带给后台",
        parameters: obj({
          reply: str(),
          title: str(),
          goal: str(),
          criteria: arr(str()),
          scope: opt(str()),
          assignee: opt(str()),
          t3ProjectId: opt(str({ description: "从所选 T3 Code 实例查询到的项目 ID。另行使用 assignee 指定该实例" })),
          t3RequireApproval: opt(bool({ description: "仅在用户明确要求此事项的 T3 操作都由本人审批时设为 true" })),
          folder: opt(str()),
          parentWorkId: opt(str()),
          sourceMessageIds: opt(arr(str())),
          context: opt(
            str({
              description:
                "前序对话中已确认的背景、方案细节或约束（如昨天讨论的结论），直接传给后台执行者",
            }),
          ),
        }),
        replay: "safe",
        execute: async (args, api) =>
          out(
            await app.createWork(
              (await bot(app, api)).id,
              args,
              `tool:${api.taskId}`,
            ),
          ),
      }),
      defineTool({
        name: "work_detail",
        description: "读取事项派工、汇报和实际产物证据，验收前必读",
        parameters: obj({ workId: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const w = await ownWork(app, api, args.workId);
          const l = await app.ledger();
          return out({
            work: w,
            executionLog: await app.executionLog(w.id),
            assignments: l.data.assignments.filter((a) => a.workId === w.id),
            reports: l.reports
              .filter(
                (r) =>
                  r.kind !== "progress" &&
                  l.data.assignments.some(
                    (a) => a.id === r.assignmentId && a.workId === w.id,
                  ),
              )
              .slice(-25),
            artifacts: l.data.artifacts.filter((a) => a.workId === w.id),
            attentions: l.data.attentions.filter((a) => a.workId === w.id),
          });
        },
      }),
      defineTool({
        name: "work_log",
        description:
          "分页读取后台分身 self 的真实工具调用和命令结果，before 为上一页游标，验收不能只信口头总结",
        parameters: obj({ workId: str(), before: opt(num()) }),
        replay: "safe",
        execute: async (args, api) => {
          await ownWork(app, api, args.workId);
          return out(await app.executionLog(args.workId, args.before));
        },
      }),
      defineTool({
        name: "work_send",
        description:
          "向当前派活对象转达补充、回答问题或要求返工；T3 Code 的投递结果在事项进度中更新。事项已结束时带着新要求重新打开并派给原来的对象。不能代替用户批准权限",
        parameters: obj({ workId: str(), text: str() }),
        replay: "safe",
        execute: async (args, api) => {
          await ownWork(app, api, args.workId);
          const receipt = await app.mutate(async (l, tx) => {
            const w = l.data.works.find((w) => w.id === args.workId)!;
            if (w.state === "ended") {
              if (l.data.assignments.some((a) => a.id === `assignment:reopen:${api.taskId}`)) return "事项已带新要求重新打开";
              const previous = l.data.assignments.find((a) => a.id === w.assignmentId);
              w.goal += `\n后续要求：${args.text}`;
              w.sourceMessageIds.push(
                ...(l.activeSources?.[w.threadId] ?? []).filter((id) => !w.sourceMessageIds.includes(id)),
              );
              await app.assign(l, tx, w, previous?.assignee ?? "self", `reopen:${api.taskId}`);
              return "事项已带新要求重新打开";
            }
            if (!w.assignmentId) throw new Error("没有活动派工");
            const assignee = l.data.assignments.find(a => a.id === w.assignmentId)?.assignee;
            const t3 = l.data.connectors.some(c => c.id === assignee && c.t3);
            const queued = t3 ? "补充在 DeepBot 排队，等待 T3 Code 接收" : "补充已持久入队";
            if (!l.effects.some((e) => e.id === `tool-send:${api.taskId}`))
              l.effects.push({
                id: `tool-send:${api.taskId}`,
                kind: "send",
                assignmentId: w.assignmentId,
                text: args.text,
              });
            if (
              !l.data.attentions.some(
                (a) => a.workId === w.id && a.state === "open",
              )
            ) {
              w.phase = "running";
              if (t3) w.progress = queued;
              touchWork(l, w.id);
            }
            return queued;
          });
          return out(receipt);
        },
      }),
      defineTool({
        name: "work_cancel",
        description: "定向取消一件事，其余后台工作继续；用户确认要停止后才调用",
        parameters: obj({ workId: str() }),
        replay: "safe",
        execute: async (args, api) => {
          await ownWork(app, api, args.workId);
          await app.mutate((l) => app.cancelWork(l, args.workId));
          return out("已取消");
        },
      }),
      defineTool({
        name: "work_reassign",
        description:
          "中途改派给 self 或另一个派活连接器，保留事项编号、产物、交接记录",
        parameters: obj({ workId: str(), assignee: str(), t3ProjectId: opt(str()) }),
        replay: "safe",
        execute: async (args, api) => {
          const w = await ownWork(app, api, args.workId);
          await app.mutate((l, tx) =>
            app.reassign(l, tx, w.id, args.assignee, `reassign:${api.taskId}`, args.t3ProjectId),
          );
          return out("已改派，事项会在侧栏继续更新");
        },
      }),
      defineTool({
        name: "work_review",
        description:
          "按验收标准逐条核对实际证据后验收。accepted=true 时 reply 必填：读完结果后用自己的话回答用户原本的目标（答案、结论或产物位置），作为交付消息发出，随后 pass；false 时 feedback 写返工要求，最多两次",
        parameters: obj({
          workId: str(),
          accepted: bool(),
          checks: arr(str()),
          reply: opt(str()),
          feedback: opt(str()),
        }),
        replay: "safe",
        execute: async (args, api) => {
          await ownWork(app, api, args.workId);
          await app.reviewWork(
            args.workId,
            args.accepted,
            args.checks,
            (args.accepted ? args.reply : args.feedback) ?? "",
            `review:${api.taskId}`,
          );
          return out(
            args.accepted
              ? "已验收并向用户交付，不要重复发送"
              : "已退回或标记失败",
          );
        },
      }),
      defineTool({
        name: "ask",
        description:
          "向用户提问，只有不能自行判断时使用；关联事项进入等你。不能自行批准提问",
        parameters: obj({
          question: str(),
          options: opt(arr(str())),
          workId: opt(str()),
        }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          if (args.workId) await ownWork(app, api, args.workId);
          await app.mutate((l) => {
            const w = l.data.works.find((w) => w.id === args.workId);
            app.openAttention(l, {
              id: `ask-tool:${api.taskId}`,
              botId: b.id,
              threadId: b.threadId,
              kind: "decision",
              question: args.question,
              options: args.options ?? [],
              ...(w
                ? {
                    workId: w.id,
                    ...(w.assignmentId ? { assignmentId: w.assignmentId } : {}),
                  }
                : {}),
            });
          });
          return {
            ...out("提问已送达，等待用户"),
            control: { terminate: true },
          };
        },
      }),
      defineTool({
        name: "route_propose",
        description: "将用户提出的以后规矩复述为可确认卡片，用户确认后才生效",
        parameters: obj({
          name: str(),
          keywords: arr(str()),
          assignee: str(),
          askFirst: bool(),
          directory: opt(str()),
          category: opt(str()),
          sourceMessageId: opt(str()),
        }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          await app.mutate((l) => {
            const sourceMessageId = args.sourceMessageId ?? l.data.messages
              .findLast((m) => m.threadId === b.threadId && m.author.kind === "person")?.id;
            const r: RouteRule = {
              id: `rule:${api.taskId}`,
              botId: b.id,
              name: args.name,
              match: {
                keywords: args.keywords,
                ...(args.directory ? { directory: args.directory } : {}),
                ...(args.category ? { category: args.category } : {}),
              },
              assignee: args.assignee,
              askFirst: args.askFirst,
              enabled: false,
              confirmed: false,
              ...(sourceMessageId !== undefined ? { sourceMessageId } : {}),
            };
            app.validateRule(l, r);
            app.openAttention(l, {
              id: `rule-confirm:${api.taskId}`,
              botId: b.id,
              threadId: b.threadId,
              kind: "rule",
              question: `确认新规矩：${r.name}\n匹配 ${args.keywords.join("、")} → ${app.assigneeName(l, r.assignee)}${r.askFirst ? "，每次先问你" : ""}`,
              options: ["确认", "取消"],
              rule: r,
            });
          });
          return {
            ...out("已提出规矩，等用户确认"),
            control: { terminate: true },
          };
        },
      }),
      defineTool({
        name: "folder_remember",
        description:
          "用户让你记住一个工作文件夹（项目目录）时调用；之后和它有关的事项在那里做",
        parameters: obj({ path: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          return out(`已记住文件夹：${await app.setFolder(b.id, args.path, true)}`);
        },
      }),
      defineTool({
        name: "folder_forget",
        description: "用户不再需要某个关联文件夹时调用",
        parameters: obj({ path: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          return out(`已不再关联：${await app.setFolder(b.id, args.path, false)}`);
        },
      }),
      defineTool({
        name: "memory_set",
        description:
          "保存或更新有用户消息依据的 essential 长期事实；同类事实变更时传入原 id 覆盖更新而非重复新增；不要记录凭据",
        parameters: obj({
          id: opt(str()),
          text: str(),
          sourceMessageIds: arr(str()),
        }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          await app.mutate((l) => {
            if (
              !args.sourceMessageIds.length ||
              args.sourceMessageIds.some(
                (id) =>
                  !l.data.messages.some(
                    (m) =>
                      m.id === id &&
                      m.threadId === b.threadId &&
                      m.author.kind === "person",
                  ),
              )
            )
              throw new Error("记忆必须引用当前会话的真实用户消息");
            app.saveMemory(l, {
              id: args.id ?? `memory:${api.taskId}`,
              botId: b.id,
              text: args.text,
              sourceMessageIds: args.sourceMessageIds,
            });
          });
          return out("记忆已保存");
        },
      }),
      defineTool({
        name: "memory_forget",
        description: "删除已过时、错误或用户要求忘掉的长期记忆",
        parameters: obj({ id: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          await app.mutate(l => app.forgetMemory(l, args.id, b.id));
          return out("记忆已删除");
        },
      }),
      defineTool({
        name: "routine_set",
        description:
          "创建/更新例行，nextRunAt 用 ISO 日期（含时区）或毫秒时间戳字符串；每次触发开事项，桌面关掉后重启补跑一次",
        parameters: obj({
          id: opt(str()),
          name: str(),
          prompt: str(),
          nextRunAt: str(),
          intervalMs: opt(num()),
          enabled: bool(),
        }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          const r: Routine = {
            id: args.id ?? `routine:${api.taskId}`,
            botId: b.id,
            name: args.name,
            prompt: args.prompt,
            nextRunAt: /^\d+$/.test(args.nextRunAt)
              ? Number(args.nextRunAt)
              : Date.parse(args.nextRunAt),
            enabled: args.enabled,
            ...(args.intervalMs ? { intervalMs: args.intervalMs } : {}),
          };
          await app.mutate(l => app.saveRoutine(l, r));
          return out(r);
        },
      }),
      defineTool({
        name: "history_search",
        description:
          "检索当前 Bot 的历史聊天原文和历史事项（含自动压缩前的早期对话细节、messageId、旧事项 workId 与产物路径）",
        parameters: obj({
          query: opt(
            str({
              description:
                "检索关键词，多个词以空格分隔（任一命中即返回），留空返回最近记录",
            }),
          ),
          scope: opt(
            str({
              description: "检索范围：all（默认）、messages 或 works",
            }),
          ),
          limit: opt(
            num({
              description: "每类最多返回条数，默认 10，最大 30",
            }),
          ),
        }),
        replay: "safe",
        execute: async (args, api) => {
          const b = await bot(app, api);
          const l = await app.ledger();
          const scope =
            args.scope === "messages" || args.scope === "works"
              ? args.scope
              : "all";
          const limit = Math.min(30, Math.max(1, Math.trunc(args.limit ?? 10)));
          const terms = (args.query ?? "")
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
          const match = (text: string) =>
            !terms.length || terms.some((t) => text.toLowerCase().includes(t));
          const messages =
            scope === "works"
              ? undefined
              : l.data.messages
                  .filter((m) => m.threadId === b.threadId && match(m.text))
                  .slice(-limit)
                  .reverse()
                  .map((m) => ({
                    id: m.id,
                    author: m.author.kind,
                    createdAt: new Date(m.createdAt).toISOString(),
                    text: m.text.slice(0, 600),
                    ...(m.workId ? { workId: m.workId } : {}),
                    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
                  }));
          const works =
            scope === "messages"
              ? undefined
              : l.data.works
                  .filter((w) => {
                    if (w.ownerBotId !== b.id) return false;
                    const artifacts = l.data.artifacts.filter(
                      (a) => a.workId === w.id,
                    );
                    const haystack = [
                      w.title,
                      w.goal,
                      w.progress,
                      w.cwd,
                      ...artifacts.flatMap((a) => [
                        a.name,
                        a.path ?? "",
                        a.url ?? "",
                        a.text ?? "",
                      ]),
                    ].join("\n");
                    return match(haystack);
                  })
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .slice(0, limit)
                  .map((w) => ({
                    id: w.id,
                    title: w.title,
                    state: w.state,
                    outcome: w.outcome ?? w.phase,
                    folder: w.cwd,
                    updatedAt: new Date(w.updatedAt).toISOString(),
                    artifacts: l.data.artifacts
                      .filter((a) => a.workId === w.id)
                      .map((a) => ({
                        name: a.name,
                        ...(a.path ? { path: a.path } : {}),
                        ...(a.url ? { url: a.url } : {}),
                      })),
                  }));
          return out({
            ...(messages ? { messages } : {}),
            ...(works ? { works } : {}),
          });
        },
      }),
      defineTool({
        name: "current_time",
        description: "读取本机当前时间，设置例行时使用",
        parameters: obj({}),
        replay: "safe",
        execute: async () =>
          out({
            iso: new Date().toISOString(),
            local: new Date().toString(),
            now: Date.now(),
          }),
      }),
    ].map((tool) => ({ ...tool, executionMode: "sequential" as const })),
  });
}
export function createWorkerExtension(app: DeepBotApp) {
  async function assignment(api: ToolExecutionApi) {
    const l = await app.ledger();
    const a = l.data.assignments.find(
      (a) =>
        a.sessionRef?.conversationId === String(api.conversationId) &&
        a.state !== "ended",
    );
    if (!a) throw new Error("派工已结束");
    return a;
  }
  return defineExtension({
    name: "deepbot.worker",
    hooks: [
      hook(ToolTask, {
        beforeTool: async (call, api) => {
          if (call.name !== "write" && call.name !== "edit") return undefined;
          const rawPath = typeof call.arguments?.path === "string" ? call.arguments.path : "";
          try {
            const wctx = await app.workingContext(String(api.conversationId));
            const safePath = await allowedPath(
              { ...wctx, roots: [...wctx.roots, app.tmpFolder()] },
              rawPath,
            );
            return { arguments: { ...call.arguments, path: safePath } };
          } catch (error) {
            return { block: errorMessage(error) };
          }
        },
      }),
    ],
    tools: [
      defineTool({
        name: "report_progress",
        description: "更新事项进度，不向用户刷消息",
        parameters: obj({ text: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const a = await assignment(api);
          await app.acceptReport({
            id: `worker-progress:${api.taskId}`,
            assignmentId: a.id,
            kind: "progress",
            text: args.text,
            createdAt: Date.now(),
          });
          return out("进度已更新");
        },
      }),
      defineTool({
        name: "report_question",
        description:
          "向负责人询问，负责人能回答时自行回复，否则问用户。本轮暂停，收到回答继续",
        parameters: obj({ question: str() }),
        replay: "safe",
        execute: async (args, api) => {
          const a = await assignment(api);
          await app.acceptReport({
            id: `worker-question:${api.taskId}`,
            assignmentId: a.id,
            kind: "question",
            text: args.question,
            createdAt: Date.now(),
          });
          return { ...out("等待负责人答复"), control: { terminate: true } };
        },
      }),
      defineTool({
        name: "record_artifact",
        description:
          "登记已经生成的真实文件/链接/文字产物，文件会计算 hash，负责人验收时复核",
        parameters: obj({
          path: opt(str()),
          url: opt(str()),
          text: opt(str()),
        }),
        replay: "safe",
        execute: async (args, api) =>
          out(
            await app.addArtifact(
              (await assignment(api)).id,
              args,
              String(api.taskId),
            ),
          ),
      }),
      defineTool({
        name: "pass_wait",
        description: "已有待答问题或待批准动作时结束本轮等待，收到答复自动继续",
        parameters: obj({}),
        replay: "safe",
        execute: async (_args, api) => {
          const a = await assignment(api);
          const l = await app.ledger();
          const work = l.data.works.find((w) => w.id === a.workId);
          if (
            work?.phase !== "waiting" &&
            !l.data.attentions.some(
              (q) => q.assignmentId === a.id && q.state === "open",
            )
          )
            throw new Error("没有待答问题或待批准动作，请继续执行或提交结果");
          return { ...out("等待答复"), control: { terminate: true } };
        },
      }),
      defineTool({
        name: "handoff",
        description:
          "长任务跨阶段时归档当前上下文并携带交接摘要重新开始，保留已确认的关键结论与文件路径",
        parameters: obj({
          summary: str({
            description: "下一阶段继续执行所需的经过核实的事实、已完成改动、文件路径与下一步计划",
          }),
        }),
        executionMode: "sequential",
        replay: "safe",
        execute: async (args, api) => {
          await assignment(api);
          const summary = args.summary.trim();
          if (!summary) throw new Error("交接摘要不能为空");
          return {
            ...out("已归档当前阶段上下文，携带交接摘要继续执行"),
            control: {
              handoff: `阶段交接摘要（前序探索细节已归档，请基于以下经过核实的结论继续完成剩余目标）：\n${summary}`,
            },
          };
        },
      }),
      defineTool({
        name: "explore",
        description:
          "启动只读探索子代理检索分析大型代码库或目录，保持主上下文精简；子代理只能读取文件与运行只读查找命令，不能修改文件",
        parameters: obj({
          task: str({
            description: "需要探索的具体问题、检索目标与期望返回的信息（如文件路径、行号、调用链）",
          }),
          cwd: opt(
            str({
              description: "可选的探索起始目录，必须在已允许的工作目录内；默认事项目录",
            }),
          ),
        }),
        replay: "safe",
        execute: async (args, api, context) => {
          const a = await assignment(api);
          const wctx = await app.workingContext(String(api.conversationId));
          let targetCwd = a.brief.cwd;
          if (args.cwd?.trim()) {
            targetCwd = await allowedPath(wctx, args.cwd.trim());
            if (!(await stat(targetCwd)).isDirectory()) {
              throw new Error(`探索目录不是文件夹：${args.cwd}`);
            }
          }
          const l = await app.ledger();
          const executor = l.data.settings.executor;
          const childId = await api.commit(async (tx) => {
            const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
            if (existing !== undefined) return existing.id;
            const created = await tx.createConversation({
              ownership: { kind: "task", taskId: api.taskId },
            });
            await configure(tx, created.id, {
              model: app.executorModel(a.brief, executor),
              thinkingLevel: executor.thinkingLevel === "off" ? "off" : "low",
              cwd: targetCwd,
              maxTurns: 24,
              extensions: [app.codingTools],
              tools: (app.codingTools.tools ?? []).filter(
                (t) => t.name === "read" || t.name === "bash",
              ),
              instructions:
                "你是只读代码探索子代理。只使用 read 和只读 bash 命令（如 rg、fd、find、ls、git status/diff/log）快速定位信息。" +
                "严禁修改、创建或删除任何文件，也不要运行安装或有副作用的命令。完成后直接给出精炼准确的结论、文件路径和关键行号。",
            });
            return created.id;
          }, context);
          await api.details({ conversationId: String(childId), cwd: targetCwd }, context);
          const child = (await api.conversation(childId, context))!;
          const settled = await (
            await child.submit(
              { type: "input", content: args.task, requestId: `explore:${api.taskId}` },
              context,
            )
          ).wait(context);
          if (settled.status !== "done" || settled.type !== "input") {
            const reason = "reason" in settled ? settled.reason : settled.status;
            throw new Error(`探索子代理未完成：${reason}`);
          }
          const entry = await api.commit((tx) => tx.entry(settled.answer), context);
          const msg = entry?.model?.[0];
          const summary = msg?.role === "assistant" ? textOf(msg.content).trim() : "";
          if (!summary) throw new Error("探索子代理未返回有效结论");
          return out(summary);
        },
      }),
    ],
  });
}
