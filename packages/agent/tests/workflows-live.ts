/** Opt-in integration acceptance: real models, T3 Code, and ACP. Never part of unit tests. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeepBotApp } from "../src/runtime/app.ts";
import { createConfiguredModelRuntime } from "../src/runtime/model-config.ts";
import { T3CodeConnector } from "../src/connectors/t3code.ts";
import { ACPConnector } from "../src/connectors/acp.ts";
import { readConnectorsConfig } from "../src/connectors/config.ts";
import type { Attention, Work } from "../src/protocol.ts";

const workspace=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const directory=await mkdtemp(join(tmpdir(),"deepbot-workflows-live-"));
const dataDir=join(directory,"state");const evidencePath=join(directory,"acceptance.json");
const runtime=await createConfiguredModelRuntime();
const scenarios=new Set((process.env.DEEPBOT_LIVE_SCENARIOS??"t3,rules,routine,acp").split(","));
const results:Record<string,unknown>={directory,provider:runtime.provider,model:runtime.modelId,startedAt:new Date().toISOString()};
let app:DeepBotApp|undefined;let phase="opening";
const printed=new Map<string,string>();let counter=0;
function log(value:unknown){console.log(JSON.stringify({time:new Date().toISOString(),phase,...value as object}));}
process.once("SIGTERM",()=>{void (async()=>{await app?.close();process.exit(143);})();});
async function checkpoint(){if(app){const l=await app.ledger();await writeFile(evidencePath,JSON.stringify({...results,phase,data:l.data,reports:l.reports},null,2));}}
async function waitFor<T>(get:()=>Promise<T|undefined|false>,label:string,timeout=240000):Promise<T>{const until=Date.now()+timeout;let lastLog=0;while(Date.now()<until){const result=await get();if(result)return result;if(Date.now()-lastLog>15000){log({waiting:label});lastLog=Date.now();await checkpoint();}await new Promise(r=>setTimeout(r,250));}throw new Error(`Timeout: ${label}`);}
async function send(botId:string,text:string){await app!.command({type:"message.send",requestId:`live:${++counter}`,botId,threadId:`dm:${botId}`,text});}
async function createBot(id:string,name:string,folder:string){await app!.command({type:"bot.upsert",requestId:`bot:${id}`,bot:{id,name,folders:[folder]}});}
async function workFor(botId:string):Promise<Work>{return waitFor(async()=>{const l=await app!.ledger();const w=l.data.works.find(w=>w.ownerBotId===botId);return w;},`work for ${botId}`);}
async function delivered(workId:string){return waitFor(async()=>{const w=(await app!.ledger()).data.works.find(w=>w.id===workId)!;if(w.phase==="failed"||w.phase==="cancelled")throw new Error(`${workId}: ${w.phase}: ${w.progress}`);return w.phase==="done"?w:undefined;},`delivery ${workId}`,360000);}
async function attentionFor(workId:string){return waitFor(async()=> {const l=await app!.ledger();const work=l.data.works.find(w=>w.id===workId);if(work?.phase==="failed"||work?.phase==="cancelled")throw new Error(work.progress);return l.data.attentions.find(a=>a.workId===workId&&a.state==="open");},`attention ${workId}`);}
async function answer(attention:Attention,value:string){await app!.command({type:"attention.reply",requestId:`answer:${attention.id}`,attentionId:attention.id,value});}
try{
 const acpCommand=join(homedir(),".local/share/deepbot/tools/codex-acp/node_modules/.bin/codex-acp");
 const policy=async()=>{const settings=(await app!.ledger()).data.settings;return{permissions:settings.permissions,connectedFolders:settings.connectedFolders};};
 const t3=readConnectorsConfig(dataDir).t3;
 app=await DeepBotApp.open({dataDir,...runtime,debounceMs:100,tickMs:100,connectors:[new T3CodeConnector({dataDir,url:t3.url,token:t3.token,provider:"codex",model:runtime.modelId,pollMs:1500}),new ACPConnector({dataDir,id:"acp:codex",name:"Codex ACP",command:acpCommand,args:[],mode:"read-only",env:{INITIAL_AGENT_MODE:"read-only",CODEX_CONFIG:JSON.stringify({model:runtime.modelId,model_reasoning_effort:"medium"})},policy})],emit:event=>{if(event.type!=="snapshot")return;for(const w of event.snapshot.works){const key=`${w.phase}:${w.progress.slice(0,150)}`;if(printed.get(w.id)!==key){printed.set(w.id,key);log({work:w.id,stage:w.phase,progress:w.progress.slice(0,220)});}}}});
 await app.command({type:"settings.update",requestId:"settings",settings:{connectedFolders:[workspace,directory],permissions:{files:true,browser:true,confirmPublish:true,deleteFiles:false}}});
 const statuses=(await app.ledger()).data.connectors;for(const id of ["t3code","acp:codex"]){const status=statuses.find(e=>e.id===id);assert.ok(status?.available,`${id}: ${status?.reason}`);}
 if(scenarios.has("t3")) {
 phase="t3 explicit routing";
 await createBot("t3-live","T3 验收",workspace);
 await send("t3-live",`用 T3 Code 做一个后台只读验收：读取 ${join(workspace,"README.md")} 的第一行并原样返回，只读这个文件，不修改文件，不创建分支，不提交代码。必须交给 T3 Code，拿到实际读取结果后你验收并交付。`);
 const t3Work=await workFor("t3-live");assert.equal((await app.ledger()).data.assignments.find(a=>a.id===t3Work.assignmentId)?.assignee,"t3code");
 await delivered(t3Work.id);const t3Assignment=(await app.ledger()).data.assignments.find(a=>a.workId===t3Work.id)!;
 results.t3={workId:t3Work.id,session:t3Assignment.sessionRef,delivered:true};await checkpoint();
 }
 if(scenarios.has("rules")) {
 phase="confirmed rule routing";
 await createBot("rule-live","规矩验收",workspace);
 await send("rule-live","以后任务包含「只读验收」这个关键词时，都交给 T3 Code，不需要每次先问我。请先把这条规矩发给我确认。");
 const ruleQuestion=await waitFor(async()=> (await app!.ledger()).data.attentions.find(a=>a.botId==="rule-live"&&a.kind==="rule"&&a.state==="open"),"rule confirmation");
 assert.equal((await app.ledger()).data.rules.filter(r=>r.botId==="rule-live").length,0);await answer(ruleQuestion,"确认");
 await send("rule-live",`只读验收：请开后台事项读取 ${join(workspace,"README.md")} 的第一行，返回实际读取结果即可，不修改任何文件。按刚确认的规矩执行，完成后验收交付。`);
 const ruleWork=await workFor("rule-live");assert.equal((await app.ledger()).data.assignments.find(a=>a.id===ruleWork.assignmentId)?.assignee,"t3code");await delivered(ruleWork.id);
 const rule=(await app.ledger()).data.rules.find(r=>r.botId==="rule-live")!;await app.command({type:"rule.upsert",requestId:"disable-rule",rule:{...rule,enabled:false}});assert.equal((await app.ledger()).data.rules.find(r=>r.id===rule.id)?.enabled,false);
 results.rules={ruleId:rule.id,confirmed:true,automaticAssignee:"t3code",disabled:true,workId:ruleWork.id};await checkpoint();
 }
 if(scenarios.has("routine")) {
 phase="natural routine proactive delivery";
 await createBot("routine-live","例行验收",directory);
 await send("routine-live","请创建一个一次性例行：从当前时间起 5 秒后，开一个后台事项计算 6×7，产物是一段文字‘例行验证完成：42’，核对计算后主动向我交付。只触发一次，不需要再向我确认，也不读写文件。");
 const routine=await waitFor(async()=> (await app!.ledger()).data.routines.find(r=>r.botId==="routine-live"),"natural routine registration");
 const routineWork=await workFor("routine-live");await delivered(routineWork.id);assert.equal((await app.ledger()).data.routines.find(r=>r.id===routine.id)?.enabled,false);
 results.routine={routineId:routine.id,workId:routineWork.id,proactive:true,oneShot:true};await checkpoint();
 }
 if(scenarios.has("acp")) {
 phase="ACP permission relay";
 await createBot("acp-live","ACP 验收",directory);const acpTarget=join(directory,"acp-approval-proof.txt"),acpToken=`DEEPBOT_ACP_INTEGRATED_${Date.now()}`;
 await send("acp-live",`交给 Codex ACP（assignee 为 acp:codex）开后台事项：用有明确文件路径和差异内容的 apply_patch/edit 文件工具创建文件 ${acpTarget}，内容精确为 ${acpToken} 加一个末尾换行。必须向我请求单次批准再写入，不要绕过 read-only 模式；获批后写入并如实报告文件工具结果。禁止调用 shell、terminal 或通用命令工具，不修改其他文件。ACP 负责创建文件；负责人用内部 read_file 读取实际文件、核对路径及完整内容后验收交付。`);
 const acpWork=await workFor("acp-live");assert.equal((await app.ledger()).data.assignments.find(a=>a.id===acpWork.assignmentId)?.assignee,"acp:codex");
 const acpAttention=await attentionFor(acpWork.id);assert.equal(acpAttention.kind,"approval");assert.equal(acpAttention.action?.kind,"files","ACP must request a typed file edit");const approvedDiff=JSON.parse(acpAttention.action?.content??"{}").content;assert.ok(Array.isArray(approvedDiff)&&approvedDiff.some((change:{type?:string;path?:string;newText?:string})=>change.type==="diff"&&change.path===acpTarget&&change.newText===acpToken+"\n"),"approval must bind the exact file path and content");await assert.rejects(readFile(acpTarget),/ENOENT/);await answer(acpAttention,"批准");
 await waitFor(async()=>{const l=await app!.ledger();const extraAttention=l.data.attentions.find(a=>a.workId===acpWork.id&&a.state==="open");if(extraAttention)throw new Error(`Unexpected additional ACP attention: ${extraAttention.question}`);const w=l.data.works.find(w=>w.id===acpWork.id)!;if(w.phase==="failed"||w.phase==="cancelled")throw new Error(`${w.phase}: ${w.progress}`);return w.phase==="done"?w:undefined;},"ACP approved typed-file write and delivery",360000);
 assert.equal(await readFile(acpTarget,"utf8"),acpToken+"\n");results.acp={workId:acpWork.id,attentionId:acpAttention.id,file:acpTarget,content:acpToken+"\n",approvedBeforeWrite:true};
 }
 phase="complete";results.passed=true;results.finishedAt=new Date().toISOString();await checkpoint();log({passed:true,evidencePath});
}catch(error){results.passed=false;results.error=error instanceof Error?error.message:String(error);await checkpoint();log({passed:false,error:results.error,evidencePath});process.exitCode=1;}
finally{await app?.close();}
process.exit(process.exitCode??0);
