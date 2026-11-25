import { computed, effect, signal } from "nsh";
import { boolean, number, recordOf, shape } from "../../../../packages/agent/src/wire-values";
import { bots, currentBot } from "./bots";
import { hydrated, runtime } from "./runtime";
import type { Bot } from "./types";
import { readLocalJson, writeLocalJson } from "./local-json";

/**
 * Sidebar read state, local to this desktop (NSH Storage). A Bot is unread when a Bot message
 * arrived after `readAt`, or the user marked it unread; opening the Bot reads it.
 */
type ReadState = { readAt: Record<string, number>; marked: Record<string, boolean> };
const empty: ReadState = { readAt: {}, marked: {} };
/** null until Storage has loaded, so nothing is seeded over saved state. */
const readState = signal<ReadState | null>(null);
const savedReadState = shape({}, { readAt: recordOf(number), marked: recordOf(boolean) });
void readLocalJson("readState", savedReadState).then(saved => {
  readState.set({ readAt: saved?.readAt ?? empty.readAt, marked: saved?.marked ?? empty.marked });
});

function save(next: ReadState) {
  readState.set(next);
  writeLocalJson("readState", next);
}

/** Latest message from the Bot side (not the user) per thread. */
const lastIncoming = computed(() => {
  const times: Record<string, number> = {};
  for (const m of runtime().messages) if (m.author.kind !== "person") times[m.threadId] = Math.max(times[m.threadId] ?? 0, m.createdAt);
  return times;
});
const latest = (bot: Bot) => lastIncoming()[bot.threadId ?? ""] ?? 0;

// Bots seen for the first time start read; the open Bot stays read as messages arrive; deleted Bots are forgotten.
effect(() => {
  const state = readState();
  if (!state || !hydrated()) return;
  const ids = new Set(bots().map((b) => b.id));
  const readAt: Record<string, number> = {};
  for (const bot of bots()) readAt[bot.id] = state.readAt[bot.id] === undefined || bot.id === currentBot().id ? Math.max(state.readAt[bot.id] ?? 0, latest(bot)) : state.readAt[bot.id]!;
  const marked = Object.fromEntries(Object.entries(state.marked).filter(([id]) => ids.has(id)));
  if (JSON.stringify({ readAt, marked }) !== JSON.stringify(state)) save({ readAt, marked });
});

export function isUnread(bot: Bot) {
  const state = readState();
  return !!state && (!!state.marked[bot.id] || latest(bot) > (state.readAt[bot.id] ?? Infinity));
}
export function markUnread(id: string) {
  const state = readState();
  if (state) save({ ...state, marked: { ...state.marked, [id]: true } });
}
export function markRead(id: string) {
  const state = readState(); const bot = bots().find((b) => b.id === id);
  if (!state || !bot) return;
  const { [id]: _, ...marked } = state.marked;
  save({ readAt: { ...state.readAt, [id]: Math.max(state.readAt[id] ?? 0, latest(bot)) }, marked });
}
