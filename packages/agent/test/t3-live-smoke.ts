// Explicit opt-in: creates one read-only T3 Code thread over MCP and makes two model calls.
// DEEPBOT_T3_TOKEN=... node packages/agent/test/t3-live-smoke.ts [registered-project-directory]
// The endpoint and credential are read like the sidecar does: DEEPBOT_T3_* first, then <data root>/connectors.json.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { T3CodeConnector } from "../src/connectors/t3code.ts";
import { readConnectorsConfig } from "../src/connectors/config.ts";
import { dataDirectory } from "../src/runtime/data-directory.ts";
import type { Brief, Report } from "../src/protocol.ts";
const cwd = resolve(process.argv[2] ?? process.cwd());
const dataDir = mkdtempSync(join(tmpdir(), "deepbot-t3-live-"));
const t3 = readConnectorsConfig(dataDirectory()).t3;
const executor = new T3CodeConnector({ dataDir, url: t3.url, token: t3.token, pollMs: 1000 });
const status = await executor.status();
if (!status.available) throw new Error(status.reason);
const marker = `DEEPBOT_T3_OK_${Date.now()}`;
const brief: Brief = { workId: "live-work", botId: "live-bot", botName: "验收 Bot", threadId: "dm:live-bot", goal: `这是 DeepBot 派活连接器连通验收。只回复 ${marker}，不要使用任何工具，不要修改任何文件，不要执行任务或创建子代理`, criteria: ["回复包含指定标记"], scope: "只允许回复文本，不执行命令或文件修改", cwd, instructions: "执行这一个简短的协议连通测试", model: "project-default", provider: "project-default", permissions: { files: false, browser: false, confirmPublish: true, deleteFiles: false }, connectedFolders: [], context: "测试线程不需要读取仓库或进行开发" };
const ref = await executor.start({ assignmentId: `live-${Date.now()}`, brief });
assert.deepEqual(await executor.start({ assignmentId: ref.id, brief }), ref);
console.log(JSON.stringify({ stage: "launched", dataDir, ...(ref.url ? { link: ref.url } : {}) }));
let cursor: string | undefined;
async function waitReady(expected: string) {
 const deadline = Date.now() + 240_000;
 while (Date.now() < deadline) {
  for await (const report of executor.events(ref, cursor)) {
   cursor = report.id;
   if (report.kind === "permission") throw new Error(`T3 Code 等待批准：${report.externalUrl ?? "请打开 T3 Code"}`);
   if (report.kind === "failed") throw new Error(report.text);
   if (report.kind === "ready") { assert.ok(report.text.includes(expected), report.text); return report; }
  }
  await delay(1500);
 }
 throw new Error("T3 Code 真实执行验收超时");
}
const first = await waitReady(marker);
const reopened = new T3CodeConnector({ dataDir, url: t3.url, token: t3.token, pollMs: 0 });
assert.equal(await reopened.reattach(ref), "alive");
const secondMarker = `${marker}_SECOND`;
await reopened.send(ref, { inputId: "stable-live-input", text: `继续连通验收，只回复 ${secondMarker}，不要使用工具或修改文件` });
await reopened.send(ref, { inputId: "stable-live-input", text: `继续连通验收，只回复 ${secondMarker}，不要使用工具或修改文件` });
const second = await waitReady(secondMarker);
const evidence = { passed: true, verifiedAt: new Date().toISOString(), dataDir, link: second.externalUrl ?? first.externalUrl ?? ref.url, first: first.text, second: second.text, reattached: true, idempotentStart: true, idempotentSend: true };
const path = join(dataDir, "acceptance.json"); writeFileSync(path, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ...evidence, evidencePath: path }));
await executor.close(); await reopened.close();
