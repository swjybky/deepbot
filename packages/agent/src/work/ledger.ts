import { defineDoc } from "@earendil-works/pi-durable";
import { randomUUID } from "node:crypto";
import { fingerprint } from "../runtime/fingerprint.ts";
import { emptySnapshot } from "../defaults.ts";
export { fingerprint } from "../runtime/fingerprint.ts";
import type { Action, McpAccess, Message, RemoteAnswers, Report, Snapshot } from "../protocol.ts";

export type McpPolicy = McpAccess & { id: string; enabled: boolean; revision?: string };

export type PendingInput = {
  id: string;
  threadId: string;
  text: string;
  messageIds: string[];
  due: number;
  workId?: string;
};
export type Effect = {
  id: string;
  kind: "send" | "cancel" | "permission" | "remote-reply";
  assignmentId: string;
  text: string;
  reportId?: string;
  approved?: boolean;
  answers?: RemoteAnswers;
  taskId?: string;
  lastError?: string;
};
export type Approval = {
  id: string;
  workId: string;
  assignmentId: string;
  fingerprint: string;
  used: boolean;
  approved: boolean;
};
export type Ledger = {
  version: 2;
  seq: number;
  data: Snapshot;
  requests: Record<string, string>;
  inbox: PendingInput[];
  effects: Effect[];
  reports: Report[];
  approvals: Approval[];
  projectedEntries: Record<string, string>;
  notifiedReports: string[];
  selfSubmissions: Record<string, string[]>;
  selfSeen: string[];
  foregroundTurnDefaultUpgraded?: true;
  foregroundBudgetTasks?: Record<string, string>;
  activeSources?: Record<string, string[]>;
  mcpPolicies?: McpPolicy[];
  pumpTaskId?: string;
};
export const LedgerDoc = defineDoc<Ledger>({
  kind: "deepbot.ledger",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({
    version: 2,
    seq: 0,
    data: emptySnapshot(),
    requests: {},
    inbox: [],
    effects: [],
    reports: [],
    approvals: [],
    projectedEntries: {},
    notifiedReports: [],
    selfSubmissions: {},
    selfSeen: [],
  }),
  checkpointWhen: () => true,
});
export const uid = (prefix: string) => `${prefix}-${randomUUID()}`;
export const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const actionKey = (action: Action) => fingerprint(action);
export function changed(ledger: Ledger) {
  ledger.seq++;
}
export function addMessage(
  ledger: Ledger,
  input: Omit<Message, "id" | "createdAt"> & { id?: string },
): Message {
  const existing = ledger.data.messages.find(
    (m) => m.requestId === input.requestId,
  );
  if (existing) return existing;
  const message: Message = {
    ...input,
    id: input.id ?? uid("msg"),
    createdAt: Date.now(),
  };
  ledger.data.messages.push(message);
  changed(ledger);
  return message;
}
export function queueInput(ledger: Ledger, input: PendingInput, merge = false) {
  if (ledger.inbox.some((i) => i.id === input.id)) return;
  const pending =
    merge &&
    ledger.inbox.find(
      (i) =>
        i.threadId === input.threadId &&
        i.workId === input.workId &&
        i.id.startsWith("batch:"),
    );
  if (pending) {
    pending.text += `\n${input.text}`;
    pending.messageIds.push(...input.messageIds);
    pending.due = input.due;
  } else ledger.inbox.push(input);
}
export function touchWork(ledger: Ledger, workId: string) {
  const work = ledger.data.works.find((w) => w.id === workId);
  if (work) {
    work.revision++;
    work.updatedAt = Date.now();
    changed(ledger);
  }
}
