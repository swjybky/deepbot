// Explicit opt-in: calls a real ACP agent/model, rejects then approves a test file write.
// DEEPBOT_ACP_COMMAND=/path/to/codex-acp node packages/agent/test/acp-live-smoke.ts
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ACPConnector, type ACPOptions } from "../src/connectors/acp.ts";
import type { Brief, Report } from "../src/protocol.ts";
const dataDir = mkdtempSync(join(tmpdir(), "deepbot-acp-live-"));
const target = join(dataDir, "permission-proof.txt");
const command = process.env.DEEPBOT_ACP_COMMAND;
if (!command) throw new Error("DEEPBOT_ACP_COMMAND is required for this opt-in test");
const options: ACPOptions = { dataDir, id: "acp:codex", name: "Codex ACP", command, args: [], mode: "read-only", env: { INITIAL_AGENT_MODE: "read-only", CODEX_CONFIG: JSON.stringify({ model: process.env.DEEPBOT_ACP_MODEL ?? "gpt-6-astra", model_reasoning_effort: "medium" }) }, requestTimeoutMs: 60_000 };
let executor = new ACPConnector(options);
const marker = `DEEPBOT_ACP_OK_${Date.now()}`;
const brief: Brief = { workId: "live-work", botId: "live-bot", botName: "验收 Bot", threadId: "dm:live-bot", goal: `这是 DeepBot ACP 权限链路验收。请只创建文件 ${target}，内容精确为 ${marker}。请只使用 apply_patch 文件编辑工具，不要调用 shell、exec_command 或 run_command。当前是 read-only 沙箱，文件编辑需要请求单次批准。若批准被拒绝，立即停止，不要改用其他方法；只回复“已拒绝，未写入”`, criteria: ["文件内容与标记完全一致"], scope: `只允许创建 ${target}，不得修改其他文件、联网、创建子代理`, cwd: dataDir, instructions: "只完成这一项小型权限验收操作，不读取不相关文件", model: "gpt-6-astra", provider: "codex", permissions: { files: true, browser: false, confirmPublish: true, deleteFiles: false }, connectedFolders: [dataDir], context: "第一次拒绝、第二次批准，验证拒绝不写入、批准才写入" };
let cursor: string | undefined;
const collected: Report[] = [];
try {
 const ref = await executor.start({ assignmentId: `live-${Date.now()}`, brief });
 console.log(JSON.stringify({ stage: "started", dataDir }));
 async function nextReport(kinds: Report["kind"][]) {
  const deadline=Date.now()+240_000;
  while(Date.now()<deadline) {
   for await(const report of executor.events(ref,cursor)) {
    cursor=report.id;collected.push(report);
    if(kinds.includes(report.kind))return report;
    if(report.kind==='failed'||report.kind==='blocked')throw new Error(report.text);
   }
   await delay(200);
  }
  throw new Error('ACP live test timed out');
 }
 const first=await nextReport(['permission','ready']);
 assert.equal(first.kind,'permission',`Expected permission before result: ${first.text}`);
 assert.equal(existsSync(target),false);
 await executor.respondPermission(ref,first.id,false);
 const denied=await nextReport(['ready','blocked']);assert.equal(existsSync(target),false);
 console.log(JSON.stringify({stage:'rejected',reply:denied.text.slice(0,500)}));
 await executor.send(ref,{inputId:'retry-after-rejection',text:`现在重新执行刚才的同一文件写入：只用 apply_patch 文件编辑工具创建 ${target}，内容精确为 ${marker}。这次再次请求单次批准，批准通过后执行；不要使用 shell、exec_command、run_command 或其他路径绕过审批`});
 const second=await nextReport(['permission','ready']);assert.equal(second.kind,'permission',second.text);
 assert.equal(existsSync(target),false);
 await executor.respondPermission(ref,second.id,true);
 const accepted=await nextReport(['ready']);assert.equal(readFileSync(target,'utf8').trim(),marker);
 await executor.close(); executor = new ACPConnector(options);
 assert.equal(await executor.reattach(ref), 'alive');
 await executor.send(ref, {inputId:'after-restart',text:`复接验收：只回复 ${marker}_RESUMED，不执行任何工具`});
 const resumed=await nextReport(['ready']);assert.ok(resumed.text.includes(`${marker}_RESUMED`),resumed.text);
 const evidence={passed:true,verifiedAt:new Date().toISOString(),adapter:'@agentclientprotocol/codex-acp 2.6.0',command,dataDir,target,permissionRequests:2,rejectedBeforeWrite:true,approvedThenWrote:true,reattached:true,resumedReply:resumed.text,deniedReply:denied.text,acceptedReply:accepted.text,artifact:readFileSync(target,'utf8')};
 const path=join(dataDir,'acceptance.json');writeFileSync(path,JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,evidencePath:path}));
} finally { await executor.close(); }
