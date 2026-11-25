import { computed, signal } from "nsh";
import { avatarShapes, botColors, type AvatarShapeId } from "../theme/avatar";
import type { Bot } from "./types";
import { command, requestId, runtime, type Message, type Work } from "./runtime";
import { formatRoutineTime } from "./routine-time";

/** Empty connection placeholder contains no fabricated conversation or execution state. */
const placeholder: Bot = { id: "", name: "DeepBot", shape: "flower", color: botColors[2].hex, messages: [], tasks: [], library: [] };
function messageWorkTitle(message: Message, works: readonly Work[]) {
  if (message.author.kind !== "bot" || !message.workId) return undefined;
  if (message.workTitle?.trim()) return message.workTitle;
  // Older deliveries and linked say messages already have the association in the ledger.
  if (message.kind === "result" || (message.kind === "text" && message.requestId.startsWith("say:"))) {
    const work = works.find((work) => work.id === message.workId && work.threadId === message.threadId &&
      work.ownerBotId === message.author.id);
    return work?.title.trim() || work?.goal.trim().slice(0, 40);
  }
  return undefined;
}
export const bots = computed<Bot[]>(() => runtime().bots.map((bot) => ({ ...bot,
  shape: (avatarShapes.some((s) => s.id === bot.shape) ? bot.shape : "flower") as AvatarShapeId,
  messages: runtime().messages.filter((m) => m.threadId === bot.threadId).map((m) => {
    const workTitle = messageWorkTitle(m, runtime().works);
    return {
      id: m.id, role: m.author.kind === "person" ? "user" as const : "assistant" as const, kind: "text" as const, text: m.text,
      ...(m.workId === undefined ? {} : { workId: m.workId }),
      ...(workTitle?.trim() ? { workTitle } : {}),
      ...(m.attentionId === undefined ? {} : { attentionId: m.attentionId }),
      ...(m.replyTo === undefined ? {} : { replyTo: m.replyTo }),
      ...(m.reactions === undefined ? {} : { reactions: m.reactions }),
      ...(m.images === undefined ? {} : { images: m.images }),
    };
  }),
  tasks: runtime().routines.filter((r) => r.botId === bot.id).map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, schedule: formatRoutineTime(r.nextRunAt) })),
  library: runtime().artifacts.filter((a) => runtime().works.some((w) => w.id === a.workId && w.ownerBotId === bot.id)).map((a) => ({ name: a.name, meta: a.path ?? a.url ?? a.text ?? "" }))
})));
/** Sidebar order: pinned (oldest pin first), then the rest by latest activity, hidden Bots folded at the bottom. */
const lastActivity = computed(() => {
  const times: Record<string, number> = {};
  for (const m of runtime().messages) times[m.threadId] = Math.max(times[m.threadId] ?? 0, m.createdAt);
  return times;
});
const byActivity = (a: Bot, b: Bot) => Math.max(b.createdAt ?? 0, lastActivity()[b.threadId ?? ""] ?? 0) - Math.max(a.createdAt ?? 0, lastActivity()[a.threadId ?? ""] ?? 0);
export const pinnedBots = computed(() => bots().filter((b) => b.pinned).sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0)));
export const otherBots = computed(() => bots().filter((b) => !b.pinned && !b.hidden).sort(byActivity));
export const hiddenBots = computed(() => bots().filter((b) => !b.pinned && b.hidden).sort(byActivity));
export const currentBotId = signal("xiaocai");
export const currentBot = computed<Bot>(() => bots().find((b) => b.id === currentBotId()) ?? [...pinnedBots(), ...otherBots(), ...hiddenBots()][0] ?? placeholder);
export const currentRuntimeBot = computed(() => runtime().bots.find((b) => b.id === currentBot().id));
export const accentColor = computed(() => currentBot().color);
export const currentWorks = computed(() => runtime().works.filter((w) => w.threadId === currentBot().threadId));
export const currentAttentions = computed(() => runtime().attentions.filter((a) => a.threadId === currentBot().threadId));
export function lastLine(bot: Bot) { const last = bot.messages[bot.messages.length - 1]; return last ? last.kind === "text" ? last.text || (last.images?.length ? "图片" : "") : last.url : "打个招呼，或交代一件事"; }
export function createBot(input: { name: string; shape: AvatarShapeId; color: string; instructions?: string; modelConfigId?: string }) {
  const id = `bot-${requestId()}`;
  command({ type: "bot.upsert", bot: { ...input, id } });
  currentBotId.set(id);
  return id;
}
/** Sidebar actions re-send the Bot's current name so `bot.upsert` stays a whole-Bot update. */
function updateBot(id: string, patch: { name?: string; pinned?: boolean; hidden?: boolean }) {
  const bot = runtime().bots.find((b) => b.id === id);
  if (bot) command({ type: "bot.upsert", bot: { id, name: bot.name, ...patch } });
}
export function setBotPinned(id: string, pinned: boolean) { updateBot(id, pinned ? { pinned, hidden: false } : { pinned }); }
export function setBotHidden(id: string, hidden: boolean) { updateBot(id, hidden ? { hidden, pinned: false } : { hidden }); }
export function renameBot(id: string, name: string) { if (name.trim()) updateBot(id, { name: name.trim() }); }
export function deleteBot(id: string) { command({ type: "bot.delete", botId: id }); }
export function setTaskEnabled(_botId: string, taskId: string, enabled: boolean) {
  const routine = runtime().routines.find((r) => r.id === taskId);
  if (routine) command({ type: "routine.upsert", routine: { ...routine, enabled } });
}

/** Messages and question cards in order. Works live in the info panel; the Bot acknowledges them in a message. */
export const conversationItems = computed(() => {
  const state = runtime(); const threadId = currentBot().threadId;
  const messages = state.messages.filter((m) => m.threadId === threadId);
  const textItems = currentBot().messages.filter((m) => !messages.some((source) => source.id === m.id && (source.kind === "work" || source.kind === "ask"))).map((message) => ({ id: `message:${message.id}`, time: messages.find((m) => m.id === message.id)?.createdAt ?? 0, message }));
  const attentionItems = currentAttentions().map((attention) => ({ id: `attention:${attention.id}`, time: messages.find((m) => m.attentionId === attention.id)?.createdAt ?? attention.createdAt, attention }));
  const items: { id: string; time: number; message?: Bot["messages"][number]; attention?: typeof attentionItems[number]["attention"] }[] = [...textItems, ...attentionItems];
  return items.sort((a, b) => a.time - b.time);
});
