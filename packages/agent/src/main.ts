/** Desktop-owned protocol v2 sidecar; stdout is JSON-lines only. */
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { DeepBotApp } from "./runtime/app.ts";
import { createConfiguredModelRuntime } from "./runtime/model-config.ts";
import { dataDirectory, prepareDataDirectory } from "./runtime/data-directory.ts";
import { T3CodeConnector } from "./connectors/t3code.ts";
import { ACPConnector } from "./connectors/acp.ts";
import { readConnectorsConfig } from "./connectors/config.ts";
import { CHAT_IMAGE_TOTAL_BYTES, type AgentMessage } from "./protocol.ts";
import { errorMessage, isRecord } from "./wire-values.ts";
import { staleProcessLock } from "./runtime/process-id.ts";

const dataDir = dataDirectory();
function emit(event: AgentMessage) {
  process.stdout.write(JSON.stringify(event) + "\n");
}
function lock() {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "agent.lock");
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      const fd = openSync(path, "wx", 0o600);
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return () => {
        try {
          if (readFileSync(path, "utf8") === String(process.pid))
            unlinkSync(path);
        } catch {}
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(readFileSync(path, "utf8"));
      if (!staleProcessLock(pid, statSync(path).mtimeMs))
        throw new Error("已有 DeepBot sidecar 正在使用此数据目录");
      unlinkSync(path);
    }
  throw new Error("无法取得 DeepBot 数据目录锁");
}
async function main() {
  prepareDataDirectory();
  const unlock = lock();
  let app: DeepBotApp | undefined;
  try {
    const runtime = await createConfiguredModelRuntime();
    const config = readConnectorsConfig(dataDir);
    // Codex model mode defaults T3 to its own codex provider with the same model.
    const t3Model = config.t3.provider
      ? { provider: config.t3.provider, model: config.t3.model }
      : runtime.provider === "openai-codex"
        ? { provider: "codex", model: runtime.modelId }
        : {};
    app = await DeepBotApp.open({
      dataDir,
      ...runtime,
      emit,
      mcp: config.mcp,
      connectors: [
        new T3CodeConnector({
          dataDir, url: config.t3.url, token: config.t3.token, runtimeMode: config.t3.runtimeMode, approvalToken: config.t3.approvalToken, ...t3Model,
          activePermissions: async assignmentId => app?.activeAssignmentPermissions(assignmentId),
        }),
        ...config.acp.map((entry) => new ACPConnector({ dataDir, ...entry, policy: () => app!.connectorPolicy() })),
      ],
    });
    const lines = createInterface({ input: process.stdin });
    let stopping = false;
    const stop = () => {
      if (!stopping) {
        stopping = true;
        lines.close();
      }
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    for await (const line of lines) {
      if (!line.trim()) continue;
      let raw: unknown;
      try {
        const commandLimit = 1024 * 1024;
        if (line.length > commandLimit + Math.ceil(CHAT_IMAGE_TOTAL_BYTES / 3) * 4 + 12)
          throw new Error("图片消息超过大小上限");
        raw = JSON.parse(line);
        if (line.length > commandLimit && (!isRecord(raw) || raw.type !== "message.send-images"))
          throw new Error("命令超过 1 MB");
        await app.command(raw);
      } catch (error) {
        emit({
          type: "error",
          seq: await app.sequence(),
          ...(isRecord(raw) && typeof raw.requestId === "string"
            ? { requestId: raw.requestId }
            : {}),
          message: errorMessage(error),
        });
      }
    }
  } finally {
    await app?.close();
    unlock();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    emit({
      type: "fatal",
      seq: 0,
      message: errorMessage(error),
    });
    process.exit(1);
  });
