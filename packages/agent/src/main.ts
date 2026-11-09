// DeepBot agent sidecar. Runs a Pi Durable Harness on SQLite and speaks the
// JSON-lines protocol in ./protocol.ts over stdio. The desktop app spawns it.
//
// Env:
//   ANTHROPIC_API_KEY  provider credential (read by pi-ai)
//   DEEPBOT_MODEL      model id (default claude-sonnet-5-5)
//   DEEPBOT_DATA_DIR   where session.sqlite lives (default ~/.local/share/deepbot)

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type ConversationView, createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import type { AgentMessage, ChatMessage, HostMessage } from "./protocol.ts";

const context = BACKGROUND_CONTEXT;
const modelId = process.env.DEEPBOT_MODEL ?? "claude-sonnet-5-5";
const dataDir = process.env.DEEPBOT_DATA_DIR ?? join(homedir(), ".local", "share", "deepbot");
const storagePath = join(dataDir, "session.sqlite");

function emit(message: AgentMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** Concatenated text blocks of a pi-ai message's content. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function snapshot(view: ConversationView): AgentMessage {
  const messages: ChatMessage[] = [];
  for (const entry of view.entries) {
    for (const message of entry.model ?? []) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = textOf(message.content);
      if (text) messages.push({ id: `${entry.id}:${messages.length}`, role: message.role, text });
    }
  }
  const live = view.docs["pi.live"] as
    | { run?: unknown; generation?: { message?: { content?: unknown } }; runFailure?: { reason?: string; detail?: string } }
    | undefined;
  const partial = live?.generation?.message ? textOf(live.generation.message.content) : null;
  const failure = live?.runFailure;
  return {
    type: "snapshot",
    messages,
    partial: partial || null,
    busy: live?.run !== undefined,
    error: failure ? [failure.reason, failure.detail].filter(Boolean).join(": ") : null,
  };
}

async function main(): Promise<void> {
  mkdirSync(dataDir, { recursive: true });

  const models = createModels();
  models.setProvider(anthropicProvider());

  const harness = await Harness.open(
    await openNodeSqliteStorage(storagePath),
    { models, registry: createRegistry(), identity: { attribution: null } },
    context,
  );
  const root = await harness.root(context, { agent: { model: { provider: "anthropic", modelId } } });
  harness.resume(); // continue a run the last process left unfinished

  const watch = await root.watch(context);
  emit({ type: "ready", model: modelId, storage: storagePath });
  emit(snapshot(watch.value));
  watch.start(async (call) => {
    if (call.kind === "value") emit(snapshot(call.value));
  });

  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message: HostMessage;
    try {
      message = JSON.parse(line) as HostMessage;
    } catch {
      console.error(`deepbot-agent: ignoring malformed line: ${line}`);
      continue;
    }
    try {
      if (message.type === "input") {
        await root.submit({ type: "input", content: message.content, requestId: message.requestId }, context);
      } else if (message.type === "abort") {
        await root.abort(context);
      }
    } catch (error) {
      console.error("deepbot-agent:", error);
    }
  }

  // stdin closed: the host is gone.
  await watch.stop();
  await harness.close(context);
}

main().catch((error: unknown) => {
  emit({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
  console.error(error);
  process.exit(1);
});
