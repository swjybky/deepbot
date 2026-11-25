/** Opt-in real model acceptance: kill the entire sidecar during generation and a worker tool. */
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import type { HostMessage, Snapshot } from "../src/protocol.ts";
import { isAgentMessage } from "../src/wire.ts";
import { isArray, isRecord, number, oneOf, shape, string } from "../src/wire-values.ts";
const directory=mkdtempSync(join(tmpdir(),'deepbot-restart-live-'));
const dataDir=join(directory,'state'),workspace=join(directory,'workspace');mkdirSync(workspace);
const main=resolve(import.meta.dirname,'../src/main.ts');
const marker=`重启后仍记得_${Date.now()}`;
let child:ChildProcessWithoutNullStreams|undefined, snapshot:Snapshot|undefined, failure:string|undefined, exited=false;
let stderr='';const observedErrors:string[]=[];
async function eventually(check:()=>boolean, label:string, timeout=240000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(failure)throw new Error(failure);if(check())return;if(exited)throw new Error(`sidecar exited during ${label}: ${stderr.slice(-2000)}`);await delay(40);}
 throw new Error(`timeout ${label}; errors=${observedErrors.join(';')}; stderr=${stderr.slice(-1000)}`);
}
async function start(){
 snapshot=undefined;failure=undefined;exited=false;stderr='';
 child=spawn(process.execPath,[main],{cwd:resolve(import.meta.dirname,'../../..'),env:{...process.env,DEEPBOT_DATA_DIR:dataDir},stdio:['pipe','pipe','pipe']});
 child.on('exit',()=>{exited=true;});child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-10000);});
 const lines=createInterface({input:child.stdout});
 lines.on('line', line => {
  try {
   const event: unknown = JSON.parse(line);
   if (!isAgentMessage(event)) return;
   if (event.type === 'snapshot') snapshot = event.snapshot;
   if (event.type === 'fatal') failure = event.message;
   if (event.type === 'error') observedErrors.push(event.message);
  } catch {}
 });
 await eventually(()=>!!snapshot,'initial snapshot',60000);
}
function send(command:HostMessage){child!.stdin.write(JSON.stringify(command)+'\n');}
const storedRecord = shape({ record: string });
const taskInput = shape({ input: shape({ assistant: number, callId: string }) });
const toolCall = shape({ type: oneOf("toolCall"), id: string, name: string });

function activeTask(kind:string, needle?:string):boolean{
 if(!existsSync(join(dataDir,'session.sqlite')))return false;
 const db=new DatabaseSync(join(dataDir,'session.sqlite'),{readOnly:true});
 try {
  const rows = db.prepare("SELECT record FROM tasks WHERE json_extract(kind, '$')=? AND status='running'").all(kind);
  const entryById = db.prepare('SELECT record FROM entries WHERE id=?');
  return rows.some(row => {
   if (!needle) return true;
   if (!storedRecord(row)) return false;
   const task: unknown = JSON.parse(row.record);
   if (!taskInput(task)) return false;
   const source = entryById.get(task.input.assistant);
   if (!storedRecord(source)) return false;
   const entry: unknown = JSON.parse(source.record);
   return isRecord(entry) && isArray(entry.model) && entry.model.some(message =>
    isRecord(message) && isArray(message.content) &&
    message.content.some(block => toolCall(block) && block.id === task.input.callId && block.name === needle));
  });
 } finally { db.close(); }
}
async function kill(){const current=child!;await new Promise<void>(resolveDone=>{current.once('exit',()=>resolveDone());current.kill('SIGKILL');});}
async function stop(){const current=child;if(!current||exited)return;await new Promise<void>(resolveDone=>{current.once('exit',()=>resolveDone());current.stdin.end();setTimeout(()=>{if(current.exitCode===null)current.kill('SIGTERM');},5000).unref();});}
try{
 await start();
 send({type:'settings.update',requestId:'restart-settings',settings:{connectedFolders:[workspace],debounceMs:60}});
 await eventually(()=>snapshot!.settings.debounceMs===60,'settings committed');
 const greeting:HostMessage={type:'message.send',requestId:'restart-greeting',botId:'xiaocai',threadId:'dm:xiaocai',text:`请在心里核对 1453 × 287 的计算过程，但最终只回复“${marker}”，不要使用工具`};
 send(greeting);
 await eventually(()=>activeTask('pi.generation')&&!snapshot!.messages.some(m=>m.author.kind==='bot'&&m.text.includes(marker)),'persisted active model generation');
 console.log(JSON.stringify({stage:'kill-during-generation',directory}));await kill();
 await start();send(greeting);
 await eventually(()=>snapshot!.messages.some(m=>m.author.kind==='bot'&&m.text.includes(marker)),'generation resumed after SIGKILL');
 assert.equal(snapshot!.messages.filter(m=>m.requestId===greeting.requestId).length,1);
 const firstReply=snapshot!.messages.find(m=>m.author.kind==='bot'&&m.text.includes(marker))!.text;
 console.log(JSON.stringify({stage:'generation-recovered',reply:firstReply}));
 const target=join(workspace,'restart-proof.txt');const expected='DeepBot restart 恢复成功 42';
 const workMessage:HostMessage={type:'message.send',requestId:'restart-worker',botId:'xiaocai',threadId:'dm:xiaocai',text:`请你自己来开一个后台事项并完整完成：在 ${target} 写入精确内容“${expected}”。内部执行者必须首先使用 bash 运行 Python（等待 5 秒，计算 6*7，然后写文件），随后 read 读回、record_artifact 登记并验收交付。最终唯一验收标准是真实文件内容完全一致，等待 5 秒仅用于测试中断，不要求额外工具日志。如果进程中断，先核对文件，继续未完成步骤，不要创建第二个事项，也不要追加重复内容。不要在前台执行此工作。`};
 send(workMessage);
 await eventually(()=>snapshot!.works.some(w=>w.state==='open'&&w.assignmentId)&&activeTask('pi.tool','bash'),'persisted running internal command');
 const before=snapshot!.works.find(w=>w.state==='open'&&w.assignmentId)!;
 console.log(JSON.stringify({stage:'kill-during-worker',workId:before.id,assignmentId:before.assignmentId}));await kill();
 await start();send(workMessage);
 await eventually(()=>snapshot!.works.some(w=>w.id===before.id&&w.outcome==='done'),'internal worker resumed, verified, delivered',300000);
 const content=readFileSync(target,'utf8');assert.equal(content.trim(),expected);
 assert.equal(snapshot!.messages.filter(m=>m.requestId===workMessage.requestId).length,1);
 assert.equal(snapshot!.works.filter(w=>w.id===before.id).length,1);
 const after=snapshot!.works.find(w=>w.id===before.id)!;
 const assignments=snapshot!.assignments.filter(a=>a.workId===before.id);
 assert.equal(assignments.length,1,'self durable conversation should resume the same assignment');assert.equal(after.assignmentId,before.assignmentId);
 const artifact=snapshot!.artifacts.find(a=>a.workId===before.id&&a.path===target);assert.ok(artifact,'verified file artifact must persist');
 const evidence={passed:true,verifiedAt:new Date().toISOString(),directory,dataDir,model:snapshot!.modelConfigs.find(c=>c.id===snapshot!.bots[0]?.modelConfigId)?.model,firstReply,crashDuringModel:true,crashDuringInternalCommand:true,idempotentUserMessages:true,sameWorkId:before.id,sameAssignmentId:after.assignmentId,content,artifact,works:snapshot!.works,assignments:snapshot!.assignments,messages:snapshot!.messages,observedErrors};
 const path=join(directory,'acceptance.json');writeFileSync(path,JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:true,evidencePath:path,model:evidence.model,workId:before.id,content}));
}finally{await stop();}
