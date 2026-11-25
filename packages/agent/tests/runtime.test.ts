import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readdir, readFile, writeFile, rm, realpath, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { AssistantMessage, Message as ModelMessage, Model, Api, TranscriptContext, StreamOptions, ToolCall } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { DeepBotApp } from "../src/runtime/app.ts";
import { ctx } from "../src/runtime/conversation-values.ts";
import { readConnectorsConfig } from "../src/connectors/config.ts";
import { T3CodeConnector } from "../src/connectors/t3code.ts";
import type { Connector, DispatchPort } from "../src/connectors/port.ts";
import type { AgentMessage, Brief, ConnectorStatus, DispatchCapabilities, Report, SessionRef } from "../src/protocol.ts";
import { startManagedMcpFixture } from "../test/fixtures/managed-mcp.ts";
import { startT3Fixture } from "../test/fixtures/t3-mcp.mjs";

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function eventually(check: () => unknown | Promise<unknown>, label: string, timeout = 7000) {
 const deadline = Date.now() + timeout; let error: unknown;
 while (Date.now() < deadline) { try { if (await check()) return; } catch (e) { error=e; } await sleep(15); }
 throw new Error(`Timeout: ${label}${error ? ` (${String(error)})` : ""}`);
}
const content = (m: ModelMessage | undefined) => !m ? "" : typeof m.content === "string" ? m.content : m.content.filter(x=>x.type==="text").map(x=>x.text).join("");
const activeStateSection = (messages: ModelMessage[]) => {
 let value = "";
 for (const m of messages) {
  if (m.role === "system" && m.sections && "deepbot_state" in m.sections) {
   value = m.sections.deepbot_state ?? "";
  }
 }
 return value;
};
const text = (value: string): AssistantMessage["content"] => [{type:"text",text:value}];
const call = (name: string, args: ToolCall["arguments"] = {}): AssistantMessage["content"] => [{type:"toolCall",id:`call-${Math.random().toString(36).slice(2)}`,name,arguments:args}];
type ScriptResult = AssistantMessage["content"] | { content: AssistantMessage["content"]; stopReason?: "stop" | "length" | "toolUse" };
type Script = (messages: ModelMessage[], signal?: AbortSignal) => ScriptResult | Promise<ScriptResult>;
function mockModels(script: Script = messages => {
 const last = messages.filter(m=>m.role!=="system").at(-1), prompt = content(messages.filter(m=>m.role==="user").at(-1));
 if(last?.role==="toolResult") return call("pass");
 if(prompt.includes("派活结构化汇报")) return call("pass");
 if(prompt.includes("执行派工")) return text("执行已完成，待负责人验收");
 return text(`收到：${prompt.split("\n\n当前事项看板")[0]}`);
}, vision = false) {
 const requests: ModelMessage[][] = [];
 /** What each request was sent with: the resolved model, its messages (instructions are a system message) and the reasoning option. */
 const calls: { model: Model<Api>; reasoning?: unknown; messages: ModelMessage[] }[] = [];
 const model: Model<Api> = { id:"test-model",name:"Deterministic test model",api:"test",provider:"test",baseUrl:"http://test.invalid",reasoning:false,input:vision ? ["text", "image"] : ["text"],contextWindow:128000,maxTokens:1000,cost:{input:0,output:0,cacheRead:0,cacheWrite:0} };
 const stream = (_model: Model<Api>, context: TranscriptContext, options?: StreamOptions) => {
  const events = new AssistantMessageEventStream(); const messages = structuredClone(context.messages);requests.push(messages);
  calls.push({ model: _model, reasoning: (options as { reasoning?: unknown } | undefined)?.reasoning, messages });
  const result: AssistantMessage = { role:"assistant",content:[],api:"test",provider:"test",model:"test-model",stopReason:"stop",timestamp:Date.now(),usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}} };
  queueMicrotask(async()=>{
   events.push({type:"start",partial:result});
   try { const out = await script(messages,options?.signal); const reply = Array.isArray(out) ? { content: out } : out; result.content = reply.content; if(options?.signal?.aborted) throw new Error("aborted"); const reason = reply.stopReason ?? (result.content.some(c=>c.type==="toolCall")?"toolUse":"stop"); result.stopReason=reason; events.push({type:"done",reason,message:result}); }
   catch(e) { result.stopReason=options?.signal?.aborted?"aborted":"error";result.errorMessage=String(e);events.push({type:"error",reason:result.stopReason,error:result}); }
  });
  return events;
 };
 const models=createModels();
 models.setProvider(createProvider({
  id:"test", models:[model], api:{stream,streamSimple:stream},
  auth:{apiKey:{name:"test",login:async()=>({type:"api_key",key:"test"}),resolve:async()=>({auth:{apiKey:"test"}})}}
 }));
 return { models, requests, calls };
}
/** A dispatch connector that records what DeepBot asks of it. */
class FixtureConnector implements Connector, DispatchPort {
 readonly id: string; readonly name: string; readonly dispatch=this; records = new Map<string,{brief:Brief;reports:Report[];cancelled:boolean;inputs:{inputId:string;text:string}[]}>(); starts=0;
 constructor(id="fixture",name=id){this.id=id;this.name=name;}
 capabilities():DispatchCapabilities{return{steer:true,cancel:true,reattach:true,permissionRelay:true,stream:true};}
 async available():Promise<{available:boolean;reason?:string}>{return{available:true};}
 async status():Promise<ConnectorStatus>{return{id:this.id,name:this.name,transport:"acp",builtin:false,description:"",...(await this.available()),dispatch:this.capabilities()};}
 async start(input:{assignmentId:string;brief:Brief}):Promise<SessionRef>{if(!this.records.has(input.assignmentId)){this.starts++;this.records.set(input.assignmentId,{brief:input.brief,reports:[],cancelled:false,inputs:[]});}return{assignee:this.id,id:input.assignmentId};}
 async send(ref:SessionRef,input:{inputId:string;text:string}){const r=this.records.get(ref.id)!;if(!r.inputs.some(i=>i.inputId===input.inputId))r.inputs.push(input);}
 async cancel(ref:SessionRef){const r=this.records.get(ref.id);if(r)r.cancelled=true;}
 async reattach(ref:SessionRef):Promise<"alive"|"lost">{return this.records.has(ref.id)?"alive":"lost";}
 async *events(ref:SessionRef,cursor?:string){const reports=this.records.get(ref.id)?.reports??[];const i=cursor?reports.findIndex(r=>r.id===cursor):-1;yield*reports.slice(i+1);}
}
async function fixture(options:{script?:Script;connectors?:Connector[];persistent?:boolean;debounceMs?:number;vision?:boolean;openArtifact?:(path:string)=>Promise<void>}={}) {
 const dataDir=await mkdtemp(join(tmpdir(),"deepbot-runtime-test-"));const mock=mockModels(options.script, options.vision);const events:AgentMessage[]=[];
 const open=()=>DeepBotApp.open({dataDir,...mock,provider:"test",modelId:"test-model",tickMs:20,debounceMs:options.debounceMs??10,...(options.persistent?{}:{storage:new MemoryStorage()}),...(options.connectors?{connectors:options.connectors}:{}),...(options.openArtifact?{openArtifact:options.openArtifact}:{}),emit:e=>events.push(e)});
 const app=await open();await app.command({type:"settings.update",requestId:"folders",settings:{connectedFolders:[dataDir]}});
 return {app,dataDir,mock,events,open,cleanup:async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});}};
}
const send=(app:DeepBotApp,id:string,value:string,botId="xiaocai")=>app.command({type:"message.send",requestId:id,botId,threadId:`dm:${botId}`,text:value});
const openWork=(app:DeepBotApp,key:string,assignee="fixture")=>app.createWork("xiaocai",{title:key,goal:key,criteria:["提供实际结果"],assignee},key);

test("invalid connected folders report targeted Chinese errors and preserve the existing settings", async () => {
 const f = await fixture();
 try {
  const missing = join(f.dataDir, "missing");
  const file = join(f.dataDir, "file.txt");
  await writeFile(file, "not a directory");
  await assert.rejects(f.app.command({
   type: "settings.update", requestId: "missing-folder", settings: { connectedFolders: [missing] },
  }), { message: `文件夹不存在：${missing}` });
  await assert.rejects(f.app.command({
   type: "settings.update", requestId: "file-as-folder", settings: { connectedFolders: [file] },
  }), { message: "连接路径必须是文件夹" });
  assert.deepEqual((await f.app.ledger()).data.settings.connectedFolders, [await realpath(f.dataDir)]);
 } finally { await f.cleanup(); }
});

test("remote T3 question stays open until its structured reply succeeds", async () => {
 const receipt=Promise.withResolvers<{ value: string }>();
 const received: unknown[]=[];
 class RemoteConnector extends FixtureConnector {
  respondRequest(_ref:SessionRef, reportId:string, input:unknown) { received.push({reportId,input});return receipt.promise; }
 }
 const f=await fixture({connectors:[new RemoteConnector("t3code")]});
 try {
  const work=await openWork(f.app,"wait-t3","t3code");const assignmentId=work.assignmentId!;
  await eventually(async()=> (await f.app.ledger()).data.assignments.find(assignment=>assignment.id===assignmentId)?.state==="running","T3 assignment running");
  const requestId="remote-question";
  await f.app.acceptReport({id:requestId,assignmentId,kind:"question",text:"使用哪个分支？",createdAt:Date.now(),remoteRequest:{kind:"question",questions:[
   {id:"branch",question:"使用哪个分支？",options:[{label:"开发",value:"dev"}],allowCustomAnswer:false},
  ]}});
  const attentionId=`report-attention:${requestId}`;
  const reply={type:"attention.reply" as const,attentionId,requestId:"t3-answer",value:"开发",answers:{branch:["dev"]}};
  await assert.rejects(f.app.command({...reply,requestId:"invalid-t3-answer",answers:{branch:["unknown"]}}),/有效选项/);
  await f.app.command(reply);await f.app.command(reply);
  await eventually(()=>received.length===1,"only one structured reply delivered");
  const pending=await f.app.ledger();
  assert.deepEqual(received,[{reportId:requestId,input:{inputId:"t3-answer",value:"开发",answers:{branch:["dev"]}}}]);
  assert.equal(pending.data.attentions.find(entry=>entry.id===attentionId)?.replyPending,true);
  assert.equal(pending.data.attentions.find(entry=>entry.id===attentionId)?.state,"open");
  assert.equal(pending.data.works.find(entry=>entry.id===work.id)?.phase,"waiting");
  receipt.resolve({value:"开发"});
  await eventually(async()=> (await f.app.ledger()).data.attentions.find(entry=>entry.id===attentionId)?.state==="resolved","T3 confirms reply");
  const done=await f.app.ledger();assert.equal(done.data.works.find(entry=>entry.id===work.id)?.phase,"running");
  assert.ok(!done.data.messages.some(message=>message.requestId==="attention-answer:t3-answer"));
 } finally {receipt.resolve({value:"开发"});await f.cleanup();}
});

test("protocol admission is idempotent, rejects conflicts and validates bot/thread ownership", async()=>{
 const f=await fixture({debounceMs:1000});try{
  await send(f.app,"same","first");await send(f.app,"same","first");
  assert.equal((await f.app.ledger()).data.messages.filter(m=>m.requestId==="same").length,1);
  await assert.rejects(send(f.app,"same","different"),/requestId/);
  await assert.rejects(f.app.command({type:"message.send",botId:"xiaocai",threadId:"wrong",text:"x",requestId:"wrong"}),/不匹配/);
  await assert.rejects(f.app.command({type:"message.send",botId:"xiaocai",threadId:"dm:xiaocai",text:"x"}),/requestId/);
  await assert.rejects(f.app.command({type:"message.send",botId:"xiaocai",threadId:"dm:xiaocai",text:123,requestId:"bad-shape"}),/协议命令参数无效/);
  const snapshot=f.events.filter(e=>e.type==="snapshot").at(-1);assert.ok(snapshot);assert.ok(snapshot.seq>0);
 }finally{await f.cleanup();}
});

const screenshotData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP438AAAAQBAYDFKhhdAAAAAElFTkSuQmCC";
const imageCommand = { type: "message.send-images", botId: "xiaocai", threadId: "dm:xiaocai", requestId: "image-only", text: "", images: [{ name: "截图.png", data: screenshotData }] };

test("a queued image survives restart, reaches the model and can be read by message id", async () => {
 const f = await fixture({ persistent: true, vision: true, debounceMs: 800, script: () => text("已收到图片") });
 let reopened: DeepBotApp | undefined;
 try {
  await assert.rejects(f.app.command({ ...imageCommand, requestId: "invalid-media", images: [{ name: "伪装图片.png", data: "dGV4dA==" }] }), /有效的 PNG/);
  await assert.rejects(f.app.command({ ...imageCommand, requestId: "nothing", images: [] }), /1 到 3/);
  await f.app.command(imageCommand);
  await send(f.app, "caption-followup", "后续文字");
  await f.app.close();
  reopened = await f.open();
  await reopened.command(imageCommand);
  await eventually(async () => (await reopened!.ledger()).data.messages.some(m => m.text === "已收到图片"), "multimodal response");
  const messages = (await reopened.ledger()).data.messages.filter(m => m.requestId === imageCommand.requestId);
  assert.equal(messages.length, 1);
  const message = messages[0]!;
  assert.equal(message.text, "");
  assert.equal(message.images?.[0]?.name, "截图.png");
  assert.ok(!JSON.stringify(message).includes(screenshotData));
  const input = f.mock.requests.flat().find(m => m.role === "user" && content(m).includes("后续文字"));
  assert.ok(input && Array.isArray(input.content));
  assert.deepEqual(input.content.filter(block => block.type === "image"), [{ type: "image", mimeType: "image/png", data: screenshotData }]);
  const lookup = { type: "message.image", requestId: "preview", messageId: message.id, imageId: message.images?.[0]?.id };
  await reopened.command(lookup);
  assert.deepEqual(f.events.find(e => e.type === "message.image.loaded")?.file, { kind: "image", image: `data:image/png;base64,${screenshotData}` });
  await assert.rejects(reopened.command({ ...lookup, messageId: "wrong-message" }), /找不到该消息/);
 } finally {
  await (reopened ?? f.app).close();
  await rm(f.dataDir, { recursive: true, force: true });
 }
});

test("an image sent to a text-only model fails before creating a message", async () => {
 const f = await fixture();
 try {
  await assert.rejects(f.app.command(imageCommand), /模型不支持图片输入/);
  assert.equal((await f.app.ledger()).data.messages.some(m => m.requestId === imageCommand.requestId), false);
 } finally { await f.cleanup(); }
});

test("the T3 Code credential command validates, refreshes tools and persists across restart", async () => {
 const dataDir = await mkdtemp(join(tmpdir(), "deepbot-t3-settings-"));
 const token = "valid-t3-fixture-token";
 const wrongToken = "rejected-t3-fixture-token";
 const server = await startT3Fixture({ root: dataDir, token });
 const configFile = join(dataDir, "connectors.json");
 const initial = { t3: { url: server.url, token: "legacy-fixture-token" }, acp: [{ id: "peer", command: "peer" }] };
 const env = { DEEPBOT_T3_TOKEN: "expired-env-token" };
 const events: AgentMessage[] = [];
 const mock = mockModels(messages => messages.at(-1)?.role === "toolResult"
  ? text(content(messages.at(-1)))
  : call("codemode", { code: "const r = await tools.mcp__t3code__t3_project_list({}); text(r.projects[0].id);" }));
 const start = () => DeepBotApp.open({
  dataDir, models: mock.models, provider: "test", modelId: "test-model", debounceMs: 10,
  connectors: [new T3CodeConnector({ dataDir, ...readConnectorsConfig(dataDir, env).t3 }), new FixtureConnector("acp:peer")],
  emit: event => events.push(event),
 });
 let app: DeepBotApp | undefined;
 try {
  await writeFile(configFile, JSON.stringify(initial), { mode: 0o644 });
  app = await start();
  const running = app;
  assert.equal((await running.ledger()).data.connectors[0]?.available, false);
  const configure = (requestId: string, token: string) => running.command({ type: "connector.t3.configure", requestId, token });
  const rejected = (id: string) => events.some(e => e.type === "error" && e.requestId === id && e.message.includes("HTTP 401"));
  await configure("bad", wrongToken);
  await eventually(() => rejected("bad"), "401 for invalid new credential");
  assert.deepEqual(JSON.parse(await readFile(configFile, "utf8")), initial);

  await Promise.all([configure("save", token), configure("save", token)]);
  await eventually(() => events.filter(e => e.type === "ack" && e.requestId === "save").length === 2, "save and replay acknowledged");
  assert.equal(server.state.initializes, 1);
  const connected = (await running.ledger()).data.connectors;
  assert.deepEqual(connected.map(c => [c.id, c.available]), [["t3code", true], ["acp:peer", true]]);
  assert.equal(connected[0]?.tools, 4);
  const saved = await readFile(configFile, "utf8");
  assert.deepEqual(JSON.parse(saved), { ...initial, t3: { ...initial.t3, savedToken: token, runtimeMode: "full-access" } });
  assert.equal((await stat(configFile)).mode & 0o777, 0o600);

  await configure("bad-rotation", wrongToken);
  await eventually(() => rejected("bad-rotation"), "401 for invalid replacement");
  assert.equal(await readFile(configFile, "utf8"), saved);
  assert.equal((await running.ledger()).data.connectors[0]?.available, true);
  await send(running, "query-t3", "查询项目");
  await eventually(async () => (await running.ledger()).data.messages.some(m => m.author.kind === "bot" && m.text.includes("p1")), "authorized T3 query from an existing Bot");

  await running.close();
  app = undefined;
  app = await start();
  assert.equal((await app.ledger()).data.connectors[0]?.available, true);
  assert.ok(!JSON.stringify(events).includes(token));
  assert.ok(!JSON.stringify(events).includes(wrongToken));
 } finally {
  await app?.close();
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
 }
});

test("sidebar pin, hide, rename and delete persist and delete refuses busy or last bots",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor]});try{
  const bot=async(id:string)=>(await f.app.ledger()).data.bots.find(b=>b.id===id);
  await f.app.command({type:"bot.upsert",requestId:"side-new",bot:{id:"side",name:"侧栏"}});
  assert.ok((await bot("side"))!.createdAt);
  await f.app.command({type:"bot.upsert",requestId:"side-pin",bot:{id:"side",name:"侧栏",pinned:true,hidden:false}});
  const pinnedAt=(await bot("side"))!.pinnedAt;assert.ok(pinnedAt);
  await f.app.command({type:"bot.upsert",requestId:"side-rename",bot:{id:"side",name:" 改名 "}});
  assert.equal((await bot("side"))!.name,"改名");assert.equal((await bot("side"))!.pinnedAt,pinnedAt);
  await assert.rejects(f.app.command({type:"bot.upsert",requestId:"side-both",bot:{id:"side",name:"改名",hidden:true}}),/隐藏/);
  await f.app.command({type:"bot.upsert",requestId:"side-hide",bot:{id:"side",name:"改名",pinned:false,hidden:true}});
  assert.equal((await bot("side"))!.hidden,true);assert.equal("pinnedAt" in (await bot("side"))!,false);
  await f.app.command({type:"routine.upsert",requestId:"side-routine",routine:{id:"side-r",botId:"side",name:"例行",prompt:"做事",enabled:false,nextRunAt:Date.now()+60000}});
  const work=await openWork(f.app,"busy");
  await assert.rejects(f.app.command({type:"bot.delete",requestId:"busy-delete",botId:"xiaocai"}),/先停止/);
  await f.app.command({type:"work.cancel",requestId:"busy-cancel",workId:work.id});
  await f.app.command({type:"bot.delete",requestId:"side-delete",botId:"side"});await f.app.command({type:"bot.delete",requestId:"side-delete",botId:"side"});
  const l=await f.app.ledger();
  assert.equal(l.data.bots.some(b=>b.id==="side"),false);assert.equal(l.data.threads.some(t=>t.id==="dm:side"),false);assert.equal(l.data.routines.some(r=>r.botId==="side"),false);
  await assert.rejects(f.app.command({type:"bot.delete",requestId:"side-again",botId:"side"}),/不存在/);
  await eventually(async()=>!(await f.app.ledger()).data.typing["dm:xiaocai"]&&!(await f.app.ledger()).inbox.length&&!(await f.app.ledger()).effects.length,"xiaocai idle");
  await assert.rejects(f.app.command({type:"bot.delete",requestId:"last-delete",botId:"xiaocai"}),/至少保留/);
 }finally{await f.cleanup();}
});

test("burst messages share one model wake and each bot keeps an isolated conversation",async()=>{
 const f=await fixture({debounceMs:80});try{
  await send(f.app,"m1","one");await send(f.app,"m2","two");await send(f.app,"m3","three");
  await eventually(async()=> (await f.app.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.kind==="text"),"burst response");
  assert.equal(f.mock.requests.length,1);const prompt=f.mock.requests[0]!.map(content).join("\n");for(const value of ["one","two","three"])assert.ok(prompt.includes(value));
  await f.app.command({type:"bot.upsert",requestId:"newbot",bot:{id:"other",name:"另一个"}});await send(f.app,"other1","separate","other");
  await eventually(()=>f.mock.requests.length>=2,"other bot wake");const other=f.mock.requests[1]!.filter(m=>m.role==="user").map(content).join("\n");assert.ok(other.includes("separate"));assert.ok(!other.includes('"text":"one"'));
  const l=await f.app.ledger();assert.notEqual(l.data.threads[0]!.conversationId,l.data.threads[1]!.conversationId);
 }finally{await f.cleanup();}
});

test("say can emit two messages and pass produces no synthetic reply",async()=>{
 let workId: string;
 const f=await fixture({script:messages=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(messages.at(-1)?.role==="toolResult"||prompt.includes("silent"))return call("pass");
  return [...call("say",{text:"第一条",workId}),...call("say",{text:"第二条"})];
 },connectors:[new FixtureConnector()]});try{
  workId=(await openWork(f.app,"事项汇报验证")).id;
  await send(f.app,"multi","two replies");await eventually(async()=> (await f.app.ledger()).data.messages.filter(m=>m.requestId.startsWith("say:")).length===2,"two say messages");
  await send(f.app,"silent","silent");await eventually(()=>f.mock.requests.length>=3,"silent pass");await sleep(80);
  const messages=(await f.app.ledger()).data.messages.filter(m=>m.requestId.startsWith("say:"));
  assert.deepEqual(messages.map(({text,workId,workTitle})=>({text,workId,workTitle})),[
   {text:"第一条",workId,workTitle:"事项汇报验证"},
   {text:"第二条",workId:undefined,workTitle:undefined},
  ]);
 }finally{await f.cleanup();}
});

const until=(p:Promise<void>,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{p.then(resolve);signal?.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});});
test("aborting the foreground run clears the activity in the next sync snapshot", async () => {
 const held = Promise.withResolvers<void>();
 const f = await fixture({ script: async (_messages, signal) => {
  await until(held.promise, signal);
  return text("unexpected answer");
 } });
 try {
  await send(f.app, "cancel-turn", "等待中的一轮");
  await eventually(async () => (await f.app.ledger()).data.chatActivity?.["dm:xiaocai"] === "thinking", "foreground activity");
  await (await f.app.frontConversation("xiaocai")).abort(ctx);
  await eventually(async () => {
   const { typing, chatActivity } = (await f.app.ledger()).data;
   return typing["dm:xiaocai"] === false && chatActivity?.["dm:xiaocai"] === undefined;
  }, "cancelled turn idle");
  await f.app.command({ type: "sync", requestId: "sync-after-cancel" });
  const snapshot = f.events.findLast(event => event.type === "snapshot")?.snapshot;
  assert.deepEqual(snapshot?.chatActivity, {});
  assert.equal(snapshot?.errors["dm:xiaocai"], undefined);
 } finally { held.resolve(); await f.cleanup(); }
});

test("a new message interrupts the answer being generated and both messages are answered together",async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let aborted=0;
 const f=await fixture({debounceMs:0,script:async(messages,signal)=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));
  if(prompt.includes("first-request")){try{await until(held,signal);}catch(e){aborted++;throw e;}return text("LATE ANSWER");}
  return text("handled both");
 }});try{
  await send(f.app,"int1","first-request");
  await eventually(async()=> f.mock.requests.length === 1 &&
   (await f.app.ledger()).data.chatActivity?.["dm:xiaocai"] === "thinking", "first answer generating");
  await send(f.app,"int2","never-mind");await f.app.tick();
  await eventually(async()=> (await f.app.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.text==="handled both"),"combined answer");
  release();await sleep(100);
  assert.equal(aborted,1);
  const prompt=f.mock.requests.at(-1)!.filter(m=>m.role==="user").map(content).join("\n");
  assert.match(prompt,/first-request/);assert.match(prompt,/never-mind/);assert.match(prompt,/打断/);
  const l=await f.app.ledger();
  assert.equal(l.data.chatActivity?.["dm:xiaocai"], undefined);
  assert.ok(!l.data.messages.some(m=>m.text.includes("LATE ANSWER")));assert.equal(l.data.errors["dm:xiaocai"],undefined);
 }finally{release();await f.cleanup();}
});

test("a new message waits for an executor report review instead of interrupting it",async()=>{
 const executor=new FixtureConnector();let release!:()=>void;const held=new Promise<void>(r=>release=r);let aborted=0;
 const f=await fixture({debounceMs:0,connectors:[executor],script:async(messages,signal)=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));
  if(messages.at(-1)?.role==="toolResult")return call("pass");
  if(prompt.includes("派活结构化汇报")){try{await until(held,signal);}catch(e){aborted++;throw e;}return text("REVIEW DONE");}
  return text(`收到：${prompt.split("\n\n当前事项看板")[0]}`);
 }});try{
  const w=await openWork(f.app,"report-review");await eventually(()=>executor.records.has(w.assignmentId!),"assignment started");
  await f.app.acceptReport({id:"ready-hold",assignmentId:w.assignmentId!,kind:"ready",text:"done",createdAt:Date.now()});
  await eventually(()=>f.mock.requests.some(r=>content(r.filter(m=>m.role==="user").at(-1)).includes("派活结构化汇报")),"review generating");
  await send(f.app,"during-review","hello-during-review");await f.app.tick();await sleep(100);
  assert.equal(aborted,0);release();
  await eventually(async()=>{const texts=(await f.app.ledger()).data.messages.filter(m=>m.author.kind==="bot").map(m=>m.text);return texts.includes("REVIEW DONE")&&texts.some(t=>t.includes("hello-during-review"));},"review and chat both answered");
 }finally{release();await f.cleanup();}
});

test("background concurrency is bounded, cancellation is scoped, foreground remains responsive",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor]});try{
  await f.app.command({type:"bot.upsert",requestId:"limit",bot:{id:"xiaocai",name:"小菜",maxConcurrent:1}});
  const a=await openWork(f.app,"A"),b=await openWork(f.app,"B");
  await eventually(()=>executor.starts>0,"background starts");await sleep(100);assert.equal(executor.starts,1);
  await send(f.app,"chat","background chat");await eventually(async()=> (await f.app.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.text.includes("background chat")),"foreground responsive");
  await f.app.command({type:"work.cancel",requestId:"cancel-a",workId:a.id});await eventually(()=>executor.starts===2,"next work starts after cancellation");
  const l=await f.app.ledger();assert.equal(l.data.works.find(w=>w.id===a.id)!.phase,"cancelled");assert.equal(l.data.works.find(w=>w.id===b.id)!.phase,"running");assert.ok(executor.records.get(a.assignmentId!)!.cancelled);
 }finally{await f.cleanup();}
});

test("Bot limits span executors, allow the default ten, and refill independently when limits change", async () => {
 const first = new FixtureConnector();
 const second = new FixtureConnector("fixture-other");
 const f = await fixture({ persistent: true, connectors: [first, second] });
 let app = f.app;
 try {
  const setLimit = (id: string, name: string, maxConcurrent: number) =>
   app.command({ type: "bot.upsert", requestId: `limit-${id}-${maxConcurrent}`, bot: { id, name, maxConcurrent } });
  await app.command({ type: "settings.update", requestId: "old-global-limit", settings: { maxConcurrent: 1 } });
  await app.command({ type: "bot.upsert", requestId: "create-other", bot: { id: "other", name: "另一个" } });
  assert.deepEqual((await app.ledger()).data.bots.map(b => b.maxConcurrent), [10, 10]);
  for (const invalid of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1])
   await assert.rejects(setLimit("other", "另一个", invalid), /事项并发上限必须是正整数/);
  await setLimit("other", "另一个", 1);
  const running = async (botId: string) =>
   (await app.ledger()).data.assignments.filter(a => a.brief.botId === botId && a.state === "running");
  const pending = async (botId: string) =>
   (await app.ledger()).data.assignments.filter(a => a.brief.botId === botId && a.state === "pending");
  for (let index = 0; index < 11; index++)
   await openWork(app, `primary-${index}`, index % 2 ? first.id : second.id);
  await eventually(() => first.starts + second.starts === 10, "default Bot dispatches ten");
  assert.equal((await pending("xiaocai")).length, 1);
  assert.ok(first.starts > 0 && second.starts > 0);

  for (let index = 0; index < 2; index++) {
   const title = `other-${index}`;
   await app.createWork("other", { title, goal: title, criteria: ["完成"], assignee: first.id }, title);
  }
  await eventually(async () => (await running("other")).some(a => a.sessionRef), "second Bot dispatches while first is full");
  assert.equal((await pending("other")).length, 1);

  const admitted = await running("xiaocai");
  await setLimit("xiaocai", "小菜", 9);
  await app.close();
  app = await f.open();
  assert.deepEqual((await app.ledger()).data.bots.map(b => b.maxConcurrent), [9, 1]);
  assert.deepEqual((await running("xiaocai")).map(a => a.id), admitted.map(a => a.id));
  await app.command({ type: "work.cancel", requestId: "finish-one", workId: admitted[0]!.workId });
  await sleep(700); // Allow multiple admission retries while the running count equals the lower limit.
  assert.equal((await running("xiaocai")).length, 9);
  assert.equal((await pending("xiaocai")).length, 1);
  assert.equal(first.starts + second.starts, 11);
  await app.command({ type: "work.cancel", requestId: "finish-two", workId: admitted[1]!.workId });
  await eventually(() => first.starts + second.starts === 12, "queued assignment refills a free slot");
  assert.equal((await running("xiaocai")).length, 9);
  assert.equal((await pending("xiaocai")).length, 0);

  await setLimit("other", "另一个", 2);
  await eventually(async () => (await running("other")).filter(a => a.sessionRef).length === 2, "raising the limit releases the other queue");
  assert.equal((await pending("other")).length, 0);
 } finally {
  await app.close();
  await rm(f.dataDir, { recursive: true, force: true });
 }
});

test("a reply on a work goes to the Bot, which relays or reopens it through work_send",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor],script:messages=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(messages.at(-1)?.role==="toolResult")return call("pass");
  const workId=/"workId":"([^"]+)"/.exec(prompt)?.[1];const said=/"text":"用户：([^"]+)"/.exec(prompt)?.[1];
  if(workId&&said)return call("work_send",{workId,text:`Bot 转述：${said}`});
  return call("pass");
 }});try{
  const w=await openWork(f.app,"reply-route");await eventually(()=>executor.records.has(w.assignmentId!),"first assignment");
  await f.app.command({type:"message.send",requestId:"work-reply",botId:"xiaocai",threadId:"dm:xiaocai",text:"用户：中英文都写",workId:w.id});
  await eventually(()=>executor.records.get(w.assignmentId!)!.inputs.some(i=>i.text==="Bot 转述：中英文都写"),"Bot relays the supplement");
  assert.ok(!executor.records.get(w.assignmentId!)!.inputs.some(i=>i.text.includes("用户：")),"the raw user text is never forwarded directly");
  await f.app.command({type:"work.cancel",requestId:"end-it",workId:w.id});
  await f.app.command({type:"message.send",requestId:"work-reopen",botId:"xiaocai",threadId:"dm:xiaocai",text:"用户：再加一节",workId:w.id});
  await eventually(async()=>{const l=await f.app.ledger();const x=l.data.works.find(x=>x.id===w.id)!;return x.state==="open"&&x.assignmentId!==w.assignmentId&&executor.records.has(x.assignmentId!);},"ended work reopened by the Bot");
  const reopened=(await f.app.ledger()).data.works.find(x=>x.id===w.id)!;assert.match(reopened.goal,/后续要求：Bot 转述：再加一节/);assert.equal(executor.starts,2);
 }finally{await f.cleanup();}
});

test("work_send steers the active T3 run and the work stays open", async t => {
 const server = await startT3Fixture({ root: tmpdir() });
 t.after(() => server.close());
 const directory = await mkdtemp(join(tmpdir(), "deepbot-t3-steering-"));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const connector = new T3CodeConnector({ dataDir: directory, url: server.url, token: "secret", pollMs: 0 });
 const supplemental = "追加一项验收说明";
 const f = await fixture({ connectors: [connector], script: messages => {
  if (messages.at(-1)?.role === "toolResult") return call("pass");
  const prompt = content(messages.filter(m => m.role === "user").at(-1));
  const workId = /"workId":"([^"]+)"/.exec(prompt)?.[1];
  return workId && prompt.includes(supplemental) ? call("work_send", { workId, text: supplemental }) : call("pass");
 } });
 try {
  const work = await openWork(f.app, "LONG_RUNNING T3 work", "t3code");
  await eventually(async () => (await f.app.ledger()).data.assignments[0]?.sessionRef, "T3 dispatch attached");
  const remote = server.state.threads[0]!;
  const first = remote.thread.activeRunId;
  await f.app.command({ type: "message.send", requestId: "supplement", botId: "xiaocai", threadId: "dm:xiaocai", workId: work.id, text: supplemental });
  await eventually(() => server.state.sends === 1, "work_send reaches T3 MCP");
  assert.equal(remote.runs.length, 1, "the supplement must not create a queued run");
  assert.ok(remote.items.some(item => item.type === "user_message" && item.runId === first && item.text === supplemental));
  await eventually(async () => (await f.app.ledger()).data.works[0]?.progress.includes("已送达 T3 Code 当前运行"), "confirmed steering surfaced in work progress");
  assert.equal((await f.app.ledger()).data.works[0]?.state, "open");
  assert.equal((await f.app.ledger()).data.works[0]?.phase, "running");
 } finally {
  await f.cleanup();
 }
});

test("remote T3 persists the chosen environment through restart, reply, steering and cancel", async t => {
 const one = await startT3Fixture({ root: "/remote/one" });
 const two = await startT3Fixture({ root: "/remote/two", pairingCodes: { "SUPERVISED-ABCDEFGHJK23": "approval-required" } });
 t.after(async () => { await one.close(); await two.close(); });
 two.state.projects[0]!.id = "two-project";
 const f = await fixture({ persistent: true, script: messages => {
  const last = messages.at(-1);
  if (last?.role !== "user") return call("pass");
  const workId = /"workId":"([^"]+)"/.exec(content(last))?.[1];
  return workId && content(last).includes("给远端追加") ? call("work_send", { workId, text: "LONG_RUNNING 给远端追加" }) : call("pass");
 } });
 let app = f.app;
 const submit = async (cmd: Record<string, unknown> & { requestId: string }) => {
  const from = f.events.length;
  await app.command(cmd);
  const result = () => f.events.slice(from).find(event => (event.type === "ack" || event.type === "error") && event.requestId === cmd.requestId);
  await eventually(result, cmd.requestId);
  return result()!;
 };
 const save = (requestId: string, name: string, url: string, token: string) =>
  ({ type: "connector.t3.save", requestId, name, url, token, runtimeMode: "approval-required" });
 try {
  assert.equal((await submit(save("bad-credential", "另一台", two.url, "invalid-token"))).type, "error");
  assert.equal((await app.ledger()).data.connectors.length, 0);
  assert.equal((await submit(save("first", "开发机", one.url, "secret"))).type, "ack");
  const add = save("second", "T3 Code 办公机", two.url, "SUPERVISED-ABCDEFGHJK23");
  assert.equal((await submit(add)).type, "ack");
  assert.equal((await submit(add)).type, "ack");
  const ledger = await app.ledger();
  const [first, second] = ledger.data.connectors;
  assert.ok(first?.remoteT3 && second?.remoteT3);
  assert.deepEqual(app.mentionedAssignees(ledger, ["用 T3 Code 办公机"]), { named: second.id, refused: [] });
  assert.deepEqual(app.mentionedAssignees(ledger, ["别用 T3 Code 办公机"]), { refused: [second.id] });
  assert.deepEqual(await app.t3Projects(second.id), [{ id: "two-project", workspaceRoot: "/remote/two" }]);
  await app.command({ type: "connector.t3.projects", requestId: "target-projects", connectorId: second.id });
  await eventually(() => f.events.some(event => event.type === "connector.t3.project-list" &&
    event.requestId === "target-projects" && event.projects[0]?.id === "two-project"), "project query uses selected executor");
  assert.deepEqual(two.state.approvals, ["approval-required"]);
  assert.equal((await stat(join(f.dataDir, "connectors.json"))).mode & 0o777, 0o600);
  const config = { type: "connector.t3.save", connectorId: second.id, name: "办公机更新", runtimeMode: "approval-required" };
  const wrong = await submit({ ...config, requestId: "wrong", url: one.url, token: "secret" });
  assert.ok(wrong.type === "error" && wrong.message.includes("另一台"));
  assert.equal((await submit({ ...config, requestId: "rename" })).type, "ack");
  const work = await app.createWork("xiaocai", {
   title: "选择办公机", goal: "WAIT_QUESTION", criteria: ["回答后继续"], assignee: second.id, t3ProjectId: "two-project",
  }, "remote-work");
  const question = async () => (await app.ledger()).data.attentions.find(a => a.workId === work.id && a.state === "open");
  await eventually(question, "remote question arrives");
  assert.equal(two.state.launches, 1);
  assert.equal(one.state.launches, 0);
  assert.match(two.state.threads[0]!.items[0]!.text, /工作目录：\/remote\/two/);
  const availability = (enabled: boolean) => submit({ type: "connector.t3.connect", requestId: enabled ? "reconnect" : "disconnect", connectorId: second.id, enabled });
  assert.equal((await availability(false)).type, "ack");
  await app.close();
  app = await f.open();
  const restored = (await app.ledger()).data.connectors.find(c => c.id === second.id);
  assert.equal(restored?.name, "办公机更新");
  assert.equal(restored?.remoteT3?.enabled, false);
  await assert.rejects(app.t3Projects(second.id), /已断开/);
  const originalEnvironment = two.state.environmentId;
  two.state.environmentId = one.state.environmentId;
  const mismatched = await availability(true);
  assert.ok(mismatched.type === "error" && mismatched.message.includes("不匹配"));
  two.state.environmentId = originalEnvironment;
  assert.equal((await availability(true)).type, "ack");
  await app.command({ type: "attention.reply", requestId: "reply-t3-remote", attentionId: (await question())!.id, value: "开发分支", answers: { branch: ["dev"] } });
  await eventually(() => two.state.replies.length === 1, "remote reply received");
  await app.command({ type: "message.send", requestId: "supplement-t3-remote", botId: "xiaocai", threadId: "dm:xiaocai", workId: work.id, text: "给远端追加" });
  await eventually(() => two.state.sends === 1, "remote supplement received");
  assert.equal((await submit({ type: "connector.t3.connect", requestId: "disconnect-before-stop", connectorId: second.id, enabled: false })).type, "ack");
  await app.command({ type: "work.cancel", requestId: "stop-t3-remote", workId: work.id });
  await eventually(async () => (await app.ledger()).effects.some(e => e.kind === "cancel" && e.lastError?.includes("已断开")),
    "cancel remains pending while selected executor is disconnected");
  assert.equal(two.state.interrupts.length, 0);
  assert.equal((await submit({ type: "connector.t3.connect", requestId: "reconnect-after-stop", connectorId: second.id, enabled: true })).type, "ack");
  await eventually(() => two.state.interrupts.length > 0, "same remote run interrupted");
  assert.equal(two.state.interrupts[0]!.threadId, two.state.threads[0]!.thread.threadId);
  assert.deepEqual([one.state.launches, one.state.replies.length, one.state.sends, one.state.interrupts.length], [0, 0, 0, 0]);
 } finally {
  await app.close();
  await f.cleanup();
 }
});

test("ready is not done; review verifies changed artifact and accepts latest rework evidence",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor]});try{
  const w=await openWork(f.app,"review");await eventually(()=>executor.records.has(w.assignmentId!),"assignment ready");const path=join(f.dataDir,"artifact.txt");await writeFile(path,"v1");
  await f.app.addArtifact(w.assignmentId!,{path},"v1");await f.app.acceptReport({id:"ready1",assignmentId:w.assignmentId!,kind:"ready",text:"v1 complete",createdAt:Date.now()});
  assert.equal((await f.app.ledger()).data.works.find(x=>x.id===w.id)!.phase,"review");await assert.rejects(f.app.reviewWork(w.id,true,[],"","invalid"),/验收证据/);
  await writeFile(path,"changed");await assert.rejects(f.app.reviewWork(w.id,true,["file checked"],"结果见 artifact.txt","changed"),/变更/);
  await f.app.reviewWork(w.id,false,[],"fix","reject");await writeFile(path,"v2");await f.app.addArtifact(w.assignmentId!,{path},"v2");await f.app.acceptReport({id:"ready2",assignmentId:w.assignmentId!,kind:"ready",text:"v2 complete",createdAt:Date.now()});
  await assert.rejects(f.app.reviewWork(w.id,true,["v2 read and checked"],"  ","no-reply"),/交付答复/);
  await f.app.reviewWork(w.id,true,["v2 read and checked"],"v2 的结果在 artifact.txt","accept");const done=await f.app.ledger();assert.equal(done.data.works.find(x=>x.id===w.id)!.outcome,"done");
  assert.deepEqual(done.data.messages.filter(m=>m.workId===w.id&&m.kind==="result").map(m=>m.text),["v2 的结果在 artifact.txt"]);
 }finally{await f.cleanup();}
});

test("artifact registration, review and desktop requests use the current allowed folders", async () => {
 const executor = new FixtureConnector();
 const opened: string[] = [];
 const f = await fixture({ connectors: [executor], openArtifact: async path => { opened.push(path); } });
 const outside = await mkdtemp(join(tmpdir(), "deepbot-artifact-other-"));
 try {
  const work = await openWork(f.app, "artifact-authorization");
  const outsideFile = join(outside, "outside.txt");
  const inside = join(f.dataDir, "allowed.txt");
  const link = join(f.dataDir, "link.txt");
  await writeFile(outsideFile, "outside");
  await writeFile(inside, "产物已核对");
  await symlink(outsideFile, link);
  for (const path of [outsideFile, link]) await assert.rejects(f.app.addArtifact(work.assignmentId!, { path }, path), /路径不在/);
  await f.app.addArtifact(work.assignmentId!, { path: inside }, "approved");
  await f.app.acceptReport({ id: "remote-file", assignmentId: work.assignmentId!, kind: "ready", text: "已完成",
   evidence: [{ path: outsideFile }, { path: link }], createdAt: Date.now() });
  const artifact = (await f.app.ledger()).data.artifacts[0]!;
  assert.equal(artifact.path, inside);
  assert.equal((await f.app.ledger()).data.artifacts.length, 1);
  await f.app.command({ type: "artifact.preview", artifactId: artifact.id, requestId: "preview" });
  assert.ok(f.events.some(event => event.type === "artifact.previewed" && event.requestId === "preview" &&
    event.file.kind === "text" && event.file.text === "产物已核对"));
  const open = { type: "artifact.open", artifactId: artifact.id, requestId: "open" };
  await f.app.command(open);
  await f.app.command(open);
  assert.deepEqual(opened, [inside]);
  await assert.rejects(f.app.command({ type: "artifact.preview", path: inside, requestId: "raw-path" }), /参数无效/);
  const permissions = (await f.app.ledger()).data.settings.permissions;
  await f.app.command({ type: "settings.update", requestId: "revoke-files", settings: { permissions: { ...permissions, files: false } } });
  await assert.rejects(f.app.command({ ...open, requestId: "locked-open" }), /权限已关闭/);
  await f.app.command({ type: "settings.update", requestId: "revoke-folder", settings: { permissions, connectedFolders: [] } });
  await assert.rejects(f.app.command({ type: "artifact.preview", artifactId: artifact.id, requestId: "unlinked-folder" }), /路径不在/);
  await assert.rejects(f.app.reviewWork(work.id, true, ["已核实"], "交付", "revoked"), /路径不在/);
 } finally {
  await f.cleanup();
  await rm(outside, { recursive: true, force: true });
 }
});

test("opening a chat link uses its Bot's current file authorization and the shared opener", async () => {
 const opened: string[] = [];
 const f = await fixture({ openArtifact: async path => { opened.push(path); } });
 const outside = await mkdtemp(join(tmpdir(), "deepbot-link-other-"));
 try {
  const inside = join(f.dataDir, "交付 报告.md");
  const outsideFile = join(outside, "outside.md");
  const symlinkPath = join(f.dataDir, "outside-link.md");
  const missing = join(f.dataDir, "missing.md");
  await writeFile(inside, "report");
  await writeFile(outsideFile, "outside");
  await symlink(outsideFile, symlinkPath);
  await f.app.mutate(l => {
   l.data.messages.push({ id: "historical-link", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" },
    kind: "text", text: `[报告](<${inside}:12>)`, createdAt: 1, requestId: "history" });
  });
  const open = { type: "message.open-file", messageId: "historical-link", path: inside, requestId: "open-link" };
  await f.app.command(open);
  await f.app.command(open);
  assert.ok(f.events.some(e => e.type === "ack" && e.requestId === open.requestId));
  await assert.rejects(f.app.command({ ...open, path: missing }), /requestId 已被其他内容使用/);
  await assert.rejects(f.app.command({ ...open, path: missing, requestId: "missing-link" }), /找不到文件/);
  await assert.rejects(f.app.command({ ...open, path: "relative.md", requestId: "relative-link" }), /绝对路径/);
  await assert.rejects(f.app.command({ ...open, messageId: "unknown", requestId: "unknown-link" }), /找不到消息所属/);
  for (const path of [outsideFile, symlinkPath]) {
   await assert.rejects(f.app.command({ ...open, path, requestId: "outside-link" }), /路径不在/);
  }
  const { permissions } = (await f.app.ledger()).data.settings;
  await f.app.command({ type: "settings.update", requestId: "lock-files", settings: { permissions: { ...permissions, files: false } } });
  await assert.rejects(f.app.command({ ...open, requestId: "locked-link" }), /权限已关闭/);
  await f.app.command({ type: "settings.update", requestId: "unlink-folder", settings: { permissions, connectedFolders: [] } });
  await assert.rejects(f.app.command({ ...open, requestId: "unlinked-link" }), /路径不在/);
  assert.deepEqual(opened, [await realpath(inside)]);
 } finally {
  await f.cleanup();
  await rm(outside, { recursive: true, force: true });
 }
});

test("a removed connector's unfinished work is stopped on restart and attentions answer only once",async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),"deepbot-retired-test-"));const mock=mockModels();
 const open=(connectors:Connector[])=>DeepBotApp.open({dataDir,...mock,provider:"test",modelId:"test-model",tickMs:20,debounceMs:10,connectors});
 let app=await open([new FixtureConnector("legacy")]);try{
  const w=await openWork(app,"legacy task","legacy");
  await app.mutate(l=>{app.openAttention(l,{id:"once",botId:"xiaocai",threadId:"dm:xiaocai",workId:w.id,kind:"decision",question:"继续吗？",options:["继续"]});});
  await app.command({type:"attention.reply",requestId:"answer",attentionId:"once",value:"继续"});
  await assert.rejects(app.command({type:"attention.reply",requestId:"again",attentionId:"once",value:"again"}),/已处理/);
  await app.close();app=await open([]);
  const l=await app.ledger();const work=l.data.works.find(x=>x.id===w.id)!;
  assert.equal(work.outcome,"cancelled");assert.match(work.progress,/legacy 已不再提供/);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});


test("chat-proposed rules wait for confirmation and ask-first dispatch works",async()=>{
 const executor=new FixtureConnector("t3code");const f=await fixture({connectors:[executor],script:messages=>messages.at(-1)?.role==="toolResult"?call("pass"):call("route_propose",{name:"代码交给外部",keywords:["代码"],assignee:"t3code",askFirst:true})});try{
  await send(f.app,"propose","以后代码走外部执行者");await eventually(async()=> (await f.app.ledger()).data.attentions.some(a=>a.kind==="rule"),"proposed rule");
  let l=await f.app.ledger();assert.equal(l.data.rules.length,0);const a=l.data.attentions.find(a=>a.kind==="rule")!;
  await f.app.command({type:"attention.reply",requestId:"confirm-rule",attentionId:a.id,value:"确认"});l=await f.app.ledger();assert.ok(l.data.rules[0]!.confirmed);
  const w=await openWork(f.app,"代码修复","self");l=await f.app.ledger();assert.equal(l.data.assignments.length,0);const dispatch=l.data.attentions.find(a=>a.workId===w.id)!;
  await f.app.command({type:"attention.reply",requestId:"dispatch-rule",attentionId:dispatch.id,value:dispatch.options[0]!});
  await eventually(()=>executor.starts===1,"approved rule dispatch");
  await f.app.command({type:"rule.upsert",requestId:"disable-rule",rule:{...l.data.rules[0]!,enabled:false}});assert.equal((await f.app.ledger()).data.rules[0]!.enabled,false);
 }finally{await f.cleanup();}
});

test("routine triggers a persistent occurrence once and message admission survives restart",async()=>{
 const f=await fixture({persistent:true,debounceMs:500,script:messages=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(prompt.includes("例行到点")&&messages.at(-1)?.role!=="toolResult")return call("work_start",{reply:"例行任务已发起",title:"例行任务",goal:"routine result",criteria:["提供结果"]});
  if(messages.at(-1)?.role==="toolResult"||prompt.includes("派活结构化汇报"))return call("pass");
  return text("恢复后的回答");
 }});let reopened:DeepBotApp|undefined;try{
  await send(f.app,"restart-message","survive restart");await f.app.command({type:"routine.upsert",requestId:"routine",routine:{id:"r1",botId:"xiaocai",name:"提醒",prompt:"routine",enabled:true,nextRunAt:Date.now()+100}});await f.app.close();
  reopened=await f.open();await eventually(async()=> (await reopened!.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.text==="恢复后的回答"),"message resumed");await eventually(async()=> (await reopened!.ledger()).data.works.some(w=>w.title==="例行任务"),"routine work");
  await reopened.tick();await reopened.tick();const l=await reopened.ledger();assert.equal(l.data.messages.filter(m=>m.requestId==="restart-message").length,1);assert.equal(l.data.works.filter(w=>w.title==="例行任务").length,1);assert.equal(l.data.routines[0]!.enabled,false);
 }finally{if(reopened)await reopened.close();else await f.app.close();await rm(f.dataDir,{recursive:true,force:true});}
});

test("the desktop and Bot update the same routine and preserve Bot ownership", async () => {
 const nextRunAt = Date.now() + 60_000;
 const f = await fixture({ script: messages => {
  if (messages.at(-1)?.role === "toolResult") return call("pass");
  return call("routine_set", {
   id: "shared-routine", name: "工具更新", prompt: "整理周报", nextRunAt: String(nextRunAt), enabled: false,
  });
 }});
 try {
  const routine = { id: "shared-routine", botId: "xiaocai", name: "桌面创建", prompt: "整理资料", nextRunAt, enabled: false };
  await f.app.command({ type: "routine.upsert", requestId: "routine-from-desktop", routine });
  await send(f.app, "routine-from-bot", "更新例行");
  await eventually(async () => (await f.app.ledger()).data.routines[0]?.name === "工具更新", "Bot update");
  await f.app.command({ type: "bot.upsert", requestId: "add-routine-bot", bot: { id: "other-routine", name: "另一个 Bot" } });
  await assert.rejects(f.app.command({
   type: "routine.upsert", requestId: "routine-wrong-owner", routine: { ...routine, botId: "other-routine" },
  }), /例行不属于当前 Bot/);
  assert.deepEqual((await f.app.ledger()).data.routines, [{ ...routine, name: "工具更新", prompt: "整理周报" }]);
 } finally { await f.cleanup(); }
});

test("internal worker uses the host coding tools, records a real artifact and the owner verifies before delivery",async()=>{
 const outside=await mkdtemp(join(tmpdir(),"deepbot-outside-"));const outsideFile=join(outside,"outside.txt");
 const f=await fixture({script:messages=>{
  const user=content(messages.filter(m=>m.role==="user").at(-1));const last=messages.at(-1);const toolName=last?.role==="toolResult"?last.toolName:undefined;
  const worker=messages.some(m=>m.role==="user"&&content(m).startsWith("执行派工"));
  if(worker){
   if(toolName==="bash")return call("read",{path:"self-output.txt"});
   if(toolName==="read")return call("record_artifact",{path:"self-output.txt"});
   if(toolName==="record_artifact")return text("命令执行完成，self-output.txt 已读回核对");
   return call("bash",{command:`python3 -c "from pathlib import Path; Path('self-output.txt').write_text('真实后台执行'); Path('${outsideFile}').write_text('工作目录以外')"`});
  }
  if(user.includes("派活结构化汇报")){
   const workId=/"workId":"([^"]+)"/.exec(user)?.[1];assert.ok(workId);
   if(toolName==="work_review")return call("pass");
   if(toolName==="work_detail")return call("work_review",{workId,accepted:true,checks:["实际文件读取与 SHA-256 一致"],reply:"self-output.txt 已创建，内容是「真实后台执行」"});
   return call("work_detail",{workId});
  }
  if(toolName)return call("pass");
  return call("work_start",{reply:"已发起「内部执行验证」，做完告诉你",title:"内部执行验证",goal:"创建并验证 self-output.txt",criteria:["文件包含真实后台执行"],assignee:"self"});
 }});try{
  await send(f.app,"start-self","请内部执行者创建文件");
  await eventually(async()=> (await f.app.ledger()).data.works.some(w=>w.phase==="done"),"self execution and review",12000);
  assert.equal(await readFile(join(f.dataDir,"bots","xiaocai","workspace","self-output.txt"),"utf8"),"真实后台执行","work unrelated to a project runs in the Bot's workspace");
  assert.equal(await readFile(outsideFile,"utf8"),"工作目录以外","bash runs on the host, not in a sandbox copy");
  const l=await f.app.ledger();assert.ok(l.data.artifacts.some(a=>a.path===join(f.dataDir,"bots","xiaocai","workspace","self-output.txt")&&a.hash),"authorized artifacts are recorded with a hash");
  const workId=l.data.works[0]!.id;
  assert.ok(l.data.messages.some(m=>m.kind==="text"&&m.author.kind==="bot"&&m.workId===workId&&m.text==="已发起「内部执行验证」，做完告诉你"),"Bot acknowledges in its own words");
  assert.ok(!l.data.messages.some(m=>m.kind==="work"),"work is not a chat card");
  assert.ok(l.data.messages.some(m=>m.kind==="result"&&m.workId===workId&&m.workTitle==="内部执行验证"&&m.text==="self-output.txt 已创建，内容是「真实后台执行」"),"delivery includes the Work title and the Bot's original reply");
 }finally{await f.cleanup();await rm(outside,{recursive:true,force:true});}
});

test("reassignment preserves identity and artifacts, cancels old executor before starting replacement",async()=>{
 const first=new FixtureConnector("first"),second=new FixtureConnector("second");const f=await fixture({connectors:[first,second]});try{
  const w=await openWork(f.app,"reassign","first");await eventually(()=>first.records.has(w.assignmentId!),"first starts");
  await f.app.addArtifact(w.assignmentId!,{text:"completed first step"},"handoff");const artifactIds=(await f.app.ledger()).data.works.find(x=>x.id===w.id)!.artifactIds;
  await f.app.command({type:"work.reassign",requestId:"switch",workId:w.id,assignee:"second"});await eventually(()=>second.starts===1,"replacement starts");
  const l=await f.app.ledger(),now=l.data.works.find(x=>x.id===w.id)!;assert.equal(now.ownerBotId,w.ownerBotId);assert.deepEqual(now.artifactIds,artifactIds);assert.notEqual(now.assignmentId,w.assignmentId);assert.ok(first.records.get(w.assignmentId!)!.cancelled);assert.match(second.records.get(now.assignmentId!)!.brief.context,/completed first step/);
  await f.app.acceptReport({id:"late",assignmentId:w.assignmentId!,kind:"ready",text:"stale result",createdAt:Date.now()});assert.equal((await f.app.ledger()).data.works.find(x=>x.id===w.id)!.phase,"running");
 }finally{await f.cleanup();}
});

test("only one child-work level is allowed and parent cancellation cancels its child",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor]});try{
  const parent=await openWork(f.app,"parent"),child=await f.app.createWork("xiaocai",{title:"child",goal:"child",criteria:["done"],assignee:"fixture",parentWorkId:parent.id},"child");
  await assert.rejects(f.app.createWork("xiaocai",{title:"grandchild",goal:"grandchild",criteria:["done"],assignee:"fixture",parentWorkId:child.id},"grandchild"),/一层/);
  await f.app.command({type:"work.cancel",requestId:"cancel-parent",workId:parent.id});const l=await f.app.ledger();assert.equal(l.data.works.find(w=>w.id===child.id)!.outcome,"cancelled");
 }finally{await f.cleanup();}
});

test("naming an executor ignores negated mentions and never falls back to an older message",async()=>{
 const executor=new FixtureConnector("t3code");const f=await fixture({connectors:[executor],debounceMs:1000});try{
  const l=await f.app.ledger();const named=(...texts:string[])=>f.app.namedAssignee(l,texts);
  assert.equal(named("用 T3 做"),"t3code");assert.equal(named("你自己来"),"self");assert.equal(named("别自己干了，换成 T3 Code"),"t3code");
  assert.equal(named("不用 T3，用 Hermes"),"acp:hermes");
  for(const negated of ["不要用T3","不使用 T3","别交给 T3","别自己干了"])assert.equal(named(negated),undefined,negated);
  assert.equal(named("用T3做","算了不要用 T3"),undefined,"a later negation is not overridden by an earlier request");
  assert.equal(named("今天天气不错"),undefined);
  await send(f.app,"negated-source","不要用T3，帮我读 README");const source=(await f.app.ledger()).data.messages.find(m=>m.requestId==="negated-source")!;
  await assert.rejects(f.app.createWork("xiaocai",{title:"读取 README",goal:"读取 README",criteria:["第一行原文"],assignee:"t3code",sourceMessageIds:[source.id]},"negated"),/不要交给 t3code/);
  await send(f.app,"plain-source","帮我读 README");const plain=(await f.app.ledger()).data.messages.find(m=>m.requestId==="plain-source")!;
  const work=await f.app.createWork("xiaocai",{title:"读取 README",goal:"读取 README",criteria:["第一行原文"],assignee:"t3code",sourceMessageIds:[plain.id]},"unnamed");
  assert.equal((await f.app.ledger()).data.assignments.find(a=>a.id===work.assignmentId)!.assignee,"t3code","T3 manages its own permissions: no naming is needed");
 }finally{await f.cleanup();}
});
test("keyword routing matches original user request when model paraphrases the work goal",async()=>{
 const executor=new FixtureConnector("t3code");const f=await fixture({connectors:[executor],debounceMs:1000});try{
  await f.app.command({type:"rule.upsert",requestId:"source-rule",rule:{id:"original-keyword",botId:"xiaocai",name:"只读验收",match:{keywords:["只读验收"]},assignee:"t3code",askFirst:false,enabled:true,confirmed:true}});
  await send(f.app,"keyword-source","只读验收：读取 README 第一行");const source=(await f.app.ledger()).data.messages.find(m=>m.requestId==="keyword-source")!;
  const work=await f.app.createWork("xiaocai",{title:"读取 README",goal:"读取 README 的第一行",criteria:["第一行原文"],assignee:"t3code",sourceMessageIds:[source.id]},"source-match");
  assert.equal((await f.app.ledger()).data.assignments.find(a=>a.id===work.assignmentId)!.assignee,"t3code");
 }finally{await f.cleanup();}
});

test("the latest confirmed rule wins when a chat follow-up matches conflicting dispatch rules", async () => {
 const dataDir = await mkdtemp(join(tmpdir(), "deepbot-route-conflict-"));
 const server = await startT3Fixture({ root: dataDir });
 const connector = new T3CodeConnector({ dataDir, url: server.url, token: "secret" });
 const goal = "复查项目 README";
 const mock = mockModels(messages => {
  const last = messages.filter(m => m.role !== "system").at(-1);
  const prompt = content(last);
  if (prompt.startsWith("执行派工")) return text("已回复测试事项");
  if (last?.role !== "user") return call("pass");
  if (prompt.includes('"text":"这个项目以后交给 T3"')) {
   return call("route_propose", {
    name: "项目交给 T3", directory: dataDir, keywords: ["项目"], assignee: "t3code", askFirst: false,
   });
  }
  if (!prompt.includes('"text":"行，用他再跑一遍"')) return call("pass");
  return call("work_start", {
   title: goal, goal, criteria: ["返回 README 第一行"], folder: dataDir,
   reply: "已发起复查，完成后告诉你", assignee: "t3code",
  });
 });
 let app: DeepBotApp | undefined;
 try {
  const running = app = await DeepBotApp.open({
   dataDir, ...mock, provider: "test", modelId: "test-model",
   storage: new MemoryStorage(), connectors: [connector], debounceMs: 10, tickMs: 20,
  });
  await running.command({
   type: "bot.upsert", requestId: "project-folder",
   bot: { id: "xiaocai", name: "小菜", folders: [dataDir] },
  });
  const rule = {
   id: "project-self", botId: "xiaocai", name: "项目交给 Bot 自己",
   match: { directory: dataDir, keywords: ["项目"] },
   assignee: "self", confirmed: true, enabled: true, askFirst: false,
  };
  await running.command({ type: "rule.upsert", requestId: "old-rule", rule });
  await send(running, "propose-t3", "这个项目以后交给 T3");
  await eventually(async () => (await running.ledger()).data.attentions.some(a => a.kind === "rule"), "new rule proposed");
  const pending = await running.ledger();
  assert.equal(pending.data.rules.length, 1);
  const proposal = pending.data.attentions.find(a => a.kind === "rule")!;
  await running.command({ type: "attention.reply", requestId: "confirm-t3", attentionId: proposal.id, value: "确认" });
  await eventually(async () => !(await running.ledger()).data.typing["dm:xiaocai"], "rule turn ended");
  await send(running, "rerun", "行，用他再跑一遍");
  await eventually(async () => (await running.ledger()).data.assignments.length === 1, "chat work assigned");
  const l = await running.ledger();
  assert.equal(l.data.assignments[0]?.assignee, "t3code");
  await eventually(() => server.state.launches === 1, "T3 MCP launch received");
  const bot = l.data.bots.find(b => b.id === rule.botId)!;
  await send(running, "explicit-self", "这次你自己来");
  const next = await running.ledger();
  const source = next.data.messages.find(m => m.requestId === "explicit-self")!;
  assert.equal(running.route(next, bot, goal, dataDir, "t3code", [source.id]).assignee, "self");
  const t3Rule = next.data.rules.find(r => r.assignee === "t3code")!;
  await running.command({ type: "rule.upsert", requestId: "disable-t3", rule: { ...t3Rule, enabled: false } });
  const disabled = await running.ledger();
  const rerun = disabled.data.messages.find(m => m.requestId === "rerun")!;
  assert.equal(running.route(disabled, bot, goal, dataDir, "t3code", [rerun.id]).assignee, "self");
  await running.command({ type: "rule.upsert", requestId: "enable-t3", rule: t3Rule });
  await running.command({ type: "rule.upsert", requestId: "edit-older-rule", rule: { ...rule, askFirst: true } });
  assert.deepEqual(running.route(await running.ledger(), bot, goal, dataDir, "t3code", [rerun.id]), {
   assignee: "self", askFirst: true,
  });
 } finally {
  await app?.close();
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
 }
});

test("cancellation while executor availability is pending prevents a late launch",async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let checking=false;
 class SlowExecutor extends FixtureConnector{calls=0;override async available(){if(++this.calls>1){checking=true;await held;}return super.available();}}
 const executor=new SlowExecutor();const f=await fixture({connectors:[executor]});try{
  const w=await openWork(f.app,"late-start");await eventually(()=>checking,"availability check in progress");
  await f.app.command({type:"work.cancel",workId:w.id,requestId:"cancel-before-launch"});release();await sleep(100);
  assert.equal(executor.starts,0);assert.equal((await f.app.ledger()).data.works.find(x=>x.id===w.id)!.phase,"cancelled");
 }finally{release();await f.cleanup();}
});

test("ACP restored permission invalidates its old card and answers the exact new report",async()=>{
 class PermissionExecutor extends FixtureConnector {answers:string[]=[];async respondPermission(_ref:SessionRef,id:string,_approved:boolean){this.answers.push(id);}}
 const executor=new PermissionExecutor("acp:test");const f=await fixture({connectors:[executor]});try{
  const w=await openWork(f.app,"permission-resume","acp:test");await eventually(()=>executor.starts===1,"ACP starts");
  const action={kind:"files" as const,description:"edit file",path:join(f.dataDir,"proof.txt"),content:"same content"};
  await f.app.acceptReport({id:"old-permission",assignmentId:w.assignmentId!,kind:"permission",text:"Approve",action,createdAt:Date.now()});
  await f.app.acceptReport({id:"restored",assignmentId:w.assignmentId!,kind:"progress",text:"restored",invalidatedPermissionIds:["old-permission"],createdAt:Date.now()});
  await f.app.acceptReport({id:"new-permission",assignmentId:w.assignmentId!,kind:"permission",text:"Approve again",action,createdAt:Date.now()});
  let l=await f.app.ledger();assert.equal(l.data.attentions.find(a=>a.id==="report-attention:old-permission")!.state,"resolved");
  await f.app.command({type:"attention.reply",requestId:"approve-new",attentionId:"report-attention:new-permission",value:"批准"});
  await eventually(()=>executor.answers.length===1,"new permission delivered");assert.deepEqual(executor.answers,["new-permission"]);
 }finally{await f.cleanup();}
});

test("a stalled remote supplement never blocks new foreground chat",async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let sending=false;
 class SlowSend extends FixtureConnector{override async send(ref:SessionRef,input:{inputId:string;text:string}){sending=true;await held;await super.send(ref,input);}}
 const executor=new SlowSend();const f=await fixture({connectors:[executor],script:messages=>{
  const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(messages.at(-1)?.role==="toolResult")return call("pass");
  const workId=/"workId":"([^"]+)"/.exec(prompt)?.[1];if(workId&&prompt.includes("补充要求"))return call("work_send",{workId,text:"补充要求"});
  return text(`收到：${prompt.split("\n\n当前事项看板")[0]}`);
 }});try{
  const w=await openWork(f.app,"slow-remote");await eventually(()=>executor.starts===1,"remote starts");
  await f.app.command({type:"message.send",requestId:"supplement",botId:"xiaocai",threadId:"dm:xiaocai",workId:w.id,text:"补充要求"});await eventually(()=>sending,"remote send held");
  await send(f.app,"free-chat","我还可以聊天");await eventually(async()=>(await f.app.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.text.includes("我还可以聊天")),"foreground while remote held");
  release();await eventually(()=>executor.records.get(w.assignmentId!)!.inputs.length===1,"supplement finishes once");
 }finally{release();await f.cleanup();}
});

test("a replacement waits for an executor that cannot cancel to actually settle",async()=>{
 class Unstoppable extends FixtureConnector{settled=false;override capabilities(){return{...super.capabilities(),cancel:false};}async isSettled(){return this.settled;}}
 const first=new Unstoppable("uncancellable"),second=new FixtureConnector("replacement");const f=await fixture({connectors:[first,second]});try{
  const w=await openWork(f.app,"handoff-wait","uncancellable");await eventually(()=>first.starts===1,"old executor starts");
  await f.app.command({type:"work.reassign",workId:w.id,assignee:second.id,requestId:"replace"});await sleep(150);assert.equal(second.starts,0);
  first.settled=true;await eventually(()=>second.starts===1,"actual old completion releases replacement");
 }finally{first.settled=true;await f.cleanup();}
});

test("essential memory keeps its source across restart and stays private to its bot",async()=>{
 const f=await fixture({persistent:true,script:messages=>{const last=messages.filter(m=>m.role!=="system").at(-1);const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(last?.role==="toolResult")return call("pass");if(prompt.includes('"text":"save essential"')){const id=/"messageId":"([^"]+)"/.exec(prompt)![1]!;return call("memory_set",{text:"用户偏好清晨摘要",sourceMessageIds:[id]});}return text("memory context received");}});let reopened:DeepBotApp|undefined;try{
  await send(f.app,"memory-source","save essential");await eventually(async()=>(await f.app.ledger()).data.memories.length===1,"memory persisted");await f.app.close();
  reopened=await f.open();const memory=(await reopened.ledger()).data.memories[0]!;assert.equal(memory.revision,1);assert.ok(memory.sourceMessageIds.length===1);
  await send(reopened,"read-memory","read memory");await eventually(()=>f.mock.requests.some(r=>content(r.filter(m=>m.role==="user").at(-1)).includes('"text":"read memory"')),"owner request");
  const ownerReq=f.mock.requests.at(-1)!;
  assert.match(activeStateSection(ownerReq),/用户偏好清晨摘要/);
  assert.doesNotMatch(content(ownerReq.filter(m=>m.role==="user").at(-1)),/essential 记忆：/);
  await send(reopened,"second-chat","second chat");await eventually(()=>f.mock.requests.some(r=>content(r.filter(m=>m.role==="user").at(-1)).includes('"text":"second chat"')),"second owner request");
  const secondReq=f.mock.requests.at(-1)!;
  const stateEntries=(msgs:ModelMessage[])=>msgs.filter(m=>m.role==="system"&&m.sections&&"deepbot_state" in m.sections).length;
  assert.equal(stateEntries(secondReq),stateEntries(ownerReq),"state section is not duplicated across turns");
  await reopened.command({type:"bot.upsert",requestId:"memory-other",bot:{id:"private-other",name:"另一个"}});await send(reopened,"other-memory","check other","private-other");await eventually(()=>content(f.mock.requests.at(-1)!.filter(m=>m.role==="user").at(-1)).includes('"text":"check other"'),"other request");
  const otherReq=f.mock.requests.at(-1)!;
  assert.doesNotMatch(activeStateSection(otherReq),/用户偏好清晨摘要/);
  assert.doesNotMatch(content(otherReq.filter(m=>m.role==="user").at(-1)),/用户偏好清晨摘要/);
 }finally{if(reopened)await reopened.close();else await f.app.close();await rm(f.dataDir,{recursive:true,force:true});}
});

test("foreground tool budget hands unfinished work to one background assignment",async()=>{
 const f=await fixture({script:messages=>{const prompt=content(messages.filter(m=>m.role==="user").at(-1));if(prompt.startsWith("执行派工"))return text("后台收到未完成请求");if(prompt.includes("派活结构化汇报"))return call("pass");return call("current_time");}});try{
  await f.app.command({type:"settings.update",requestId:"budget",settings:{foregroundMaxTurns:2}});await send(f.app,"budget-input","需要持续处理的工作");
  await eventually(async()=>(await f.app.ledger()).data.works.length===1,"budget transfer");await eventually(async()=>(await f.app.ledger()).data.assignments.some(a=>a.state==="running"),"background continues");
  const l=await f.app.ledger();assert.equal(l.data.works.length,1);assert.equal(l.data.assignments[0]!.assignee,"self");assert.match(l.data.works[0]!.goal,/需要持续处理/);
 }finally{await f.cleanup();}
});

test("work runs in a remembered project folder, else in the Bot's own workspace, never in an unknown folder",async()=>{
 const executor=new FixtureConnector();const f=await fixture({connectors:[executor],debounceMs:1000});
 const project=await mkdtemp(join(tmpdir(),"deepbot-project-")),unknown=await mkdtemp(join(tmpdir(),"deepbot-unknown-"));try{
  let l=await f.app.ledger();const bot=l.data.bots.find(b=>b.id==="xiaocai")!;
  assert.equal(bot.workspace,join(f.dataDir,"bots","xiaocai","workspace"));assert.deepEqual(bot.folders,[]);
  assert.equal(l.data.sharedFolder,join(f.dataDir,"shared"));
  assert.ok((await stat(bot.workspace)).isDirectory());assert.ok((await stat(l.data.sharedFolder)).isDirectory());
  const loose=await f.app.createWork("xiaocai",{title:"写诗",goal:"写一首诗",criteria:["一首诗"],assignee:"fixture"},"loose");
  assert.equal(loose.cwd,bot.workspace);
  await assert.rejects(f.app.createWork("xiaocai",{title:"改代码",goal:"改代码",criteria:["测试通过"],assignee:"fixture",folder:unknown},"unknown"),/folder_remember/);
  const real=await f.app.setFolder("xiaocai",project,true);assert.equal(real,await realpath(project));
  await f.app.setFolder("xiaocai",project,true);assert.deepEqual((await f.app.ledger()).data.bots[0]!.folders,[real],"remembering twice keeps one entry");
  const work=await f.app.createWork("xiaocai",{title:"改代码",goal:"改代码",criteria:["测试通过"],assignee:"fixture",folder:project},"project");
  assert.equal(work.cwd,real);assert.equal(work.scope,real);
  await eventually(()=>executor.records.has(work.assignmentId!),"project work dispatched");
  const brief=executor.records.get(work.assignmentId!)!.brief;assert.equal(brief.cwd,real);assert.equal(brief.botName,"小菜");
  const child=await f.app.createWork("xiaocai",{title:"子事项",goal:"补测试",criteria:["有测试"],assignee:"fixture",parentWorkId:work.id},"child");
  assert.equal(child.cwd,real,"a child work stays in its parent's folder");
  await f.app.setFolder("xiaocai",project,false);l=await f.app.ledger();assert.deepEqual(l.data.bots[0]!.folders,[]);
  await assert.rejects(f.app.setFolder("xiaocai",project,false),/没有关联/);
  await assert.rejects(f.app.command({type:"bot.upsert",requestId:"old-cwd",bot:{id:"xiaocai",name:"小菜",cwd:project}}),/关联文件夹/);
 }finally{await f.cleanup();await rm(project,{recursive:true,force:true});await rm(unknown,{recursive:true,force:true});}
});

test("a ledger from before connectors keeps the Bot's directory as a folder and renames executor fields",async()=>{
 const executor=new FixtureConnector("t3code");const f=await fixture({persistent:true,connectors:[executor],debounceMs:1000});let reopened:DeepBotApp|undefined;try{
  const w=await openWork(f.app,"legacy","t3code");await eventually(()=>executor.records.has(w.assignmentId!),"legacy work started");
  await f.app.command({type:"rule.upsert",requestId:"legacy-rule",rule:{id:"r",botId:"xiaocai",name:"代码",match:{keywords:["代码"]},assignee:"t3code",askFirst:false,enabled:true,confirmed:true}});
  await f.app.mutate(l=>{
   const { connectors: _connectors, ...data } = l.data;
   const legacy = {
     ...data,
     executors: [],
     bots: data.bots.map(({ folders: _folders, workspace: _workspace, maxConcurrent: _maxConcurrent, ...bot }) =>
       ({ ...bot, cwd: f.dataDir, enabledExecutors: ["self", "t3code"] })),
     assignments: data.assignments.map(({ assignee, sessionRef, brief, ...assignment }) => {
       assert.ok(sessionRef);
       const { assignee: sessionExecutor, ...ref } = sessionRef;
       const { botName: _botName, ...legacyBrief } = brief;
       return { ...assignment, executorId: assignee, sessionRef: { ...ref, executorId: sessionExecutor }, brief: legacyBrief };
     }),
     rules: data.rules.map(({ assignee, ...rule }) => ({ ...rule, executorId: assignee })),
     works: data.works.map(({ cwd: _cwd, ...work }) => work),
   };
   Object.assign(l, { data: legacy });
  });
  await f.app.close();reopened=await f.open();
  const l=await reopened.ledger();const bot=l.data.bots[0]!,a=l.data.assignments[0]!;
  assert.equal(bot.maxConcurrent, 10);
  assert.deepEqual(bot.folders,[f.dataDir]);assert.equal(bot.workspace,join(f.dataDir,"bots","xiaocai","workspace"));
  assert.equal("cwd" in bot,false);assert.equal("enabledExecutors" in bot,false);assert.equal("executors" in l.data,false);
  assert.equal(a.assignee,"t3code");assert.equal(a.sessionRef!.assignee,"t3code");assert.equal("executorId" in a,false);assert.equal(a.brief.botName,"小菜");
  assert.equal(l.data.rules[0]!.assignee,"t3code");assert.equal(l.data.works[0]!.cwd,a.brief.cwd);
  assert.equal(l.data.connectors[0]!.id,"t3code");
 }finally{if(reopened)await reopened.close();else await f.app.close();await rm(f.dataDir,{recursive:true,force:true});}
});

/** Tools offered to the model, as the request's system messages add and remove them. */
function offeredTools(messages: ModelMessage[]) {
 const names = new Set<string>();
 for (const message of messages) {
  if (message.role !== "system") continue;
  for (const tool of message.toolsAdded ?? []) names.add(tool.name);
  for (const tool of message.toolsRemoved ?? []) names.delete(tool.name);
 }
 return [...names].sort();
}
class ToolConnector implements Connector {
 readonly id="fake";calls:{name:string;args:unknown}[]=[];
 async status():Promise<ConnectorStatus>{return{id:this.id,name:"假服务",transport:"mcp",builtin:false,description:"测试用的 100 个工具",available:true,tools:100};}
 async tools(){return Array.from({length:100},(_,i)=>({name:`tool_${i}`,description:`第 ${i} 个工具`,inputSchema:{type:"object",properties:{x:{type:"number"}}}}));}
 async callTool(name:string,args:Record<string,unknown>){this.calls.push({name,args});return{echo:name,x:args.x};}
}
test("connector tools are reached through the one code mode tool, so the model's function list does not grow",async()=>{
 const plain=await fixture();let baseline:string[];try{
  await send(plain.app,"baseline","你好");await eventually(()=>plain.mock.requests.length>0,"baseline request");baseline=offeredTools(plain.mock.requests[0]!);
 }finally{await plain.cleanup();}
 const tools=new ToolConnector();
 const f=await fixture({connectors:[tools],script:messages=>{
  const last=messages.at(-1);
  if(last?.role==="toolResult")return last.toolName==="codemode"?text(`脚本结果：${content(last)}`):call("pass");
  return call("codemode",{code:"const r = await tools.mcp__fake__tool_7({ x: 42 });\ntext(JSON.stringify(r));"});
 }});try{
  await send(f.app,"codemode","查一下假服务");
  await eventually(async()=>(await f.app.ledger()).data.messages.some(m=>m.author.kind==="bot"&&m.text.startsWith("脚本结果")),"script answer",10000);
  assert.deepEqual(tools.calls,[{name:"tool_7",args:{x:42}}]);
  const offered=offeredTools(f.mock.requests[0]!);
  assert.deepEqual(offered,baseline,"100 connector tools add no function to the model's list");
  assert.ok(offered.includes("codemode"));assert.ok(offered.includes("work_start"),"core tools stay function calls");assert.ok(!offered.some(n=>n.startsWith("mcp__")));
  const answer=(await f.app.ledger()).data.messages.find(m=>m.text.startsWith("脚本结果"))!.text;assert.match(answer,/"echo":"tool_7"/);assert.match(answer,/42/);
  const status=(await f.app.ledger()).data.connectors.find(c=>c.id==="fake")!;assert.equal(status.tools,100);assert.equal(status.dispatch,undefined);
  await assert.rejects(f.app.createWork("xiaocai",{title:"x",goal:"x",criteria:["x"],assignee:"fake"},"tools-only"),/只提供工具/);
 }finally{await f.cleanup();}
});

test("managed MCP grants migrate and govern real foreground and background HTTP calls across restart", async () => {
 const dataDir = await mkdtemp(join(tmpdir(), "deepbot-mcp-access-"));
 let held = Promise.withResolvers<void>();
 const service = await startManagedMcpFixture({ onCall: async incoming => {
  if (incoming.args.hold === true) await held.promise;
 } });
 const scriptResults = new Map<string, string>();
 let target = "legacy";
 const knownTool = "mcp__legacy__mcp_test_echo";
 let holdCall = false;
 const mock = mockModels(messages => {
  const last = messages.findLast(message => message.role !== "system");
  const prompt = content(messages.findLast(message => message.role === "user"));
  const marker = /\n目标：MCP验收 ([\w-]+)\n/.exec(prompt)?.[1] ??
   /\n本批事件：\n[^\n]*"text":"MCP验收 ([\w-]+)"/.exec(prompt)?.[1];
  if (!marker) return last?.role === "toolResult" || prompt.includes("派活结构化汇报") ? call("pass") : text("收到");
  if (last?.role === "toolResult" && last.toolName === "codemode") {
   scriptResults.set(marker, content(last));
   return text(`连接验收结果：${content(last)}`);
  }
  const code = `
    const catalog = await searchTools("mcp_test_echo", { namespace: ${JSON.stringify(target)} });
    const detail = await describeTool(catalog[0]?.name ?? ${JSON.stringify(knownTool)});
    const namespace = await describeNamespace(${JSON.stringify(target)});
    text(JSON.stringify({ hits: catalog.length, detail: !!detail, namespace: !!namespace }));
    const name = catalog[0]?.name ?? ${JSON.stringify(knownTool)};
    try { text(JSON.stringify(await tools[name]({ hold: ${holdCall} }))); }
    catch { text("CALL_DENIED"); }
    if (${holdCall}) {
      try { text(JSON.stringify(await tools[name]({ hold: false }))); }
      catch { text("STALE_CALL_DENIED"); }
    }
  `;
  return call("codemode", {code});
 });
 const events: AgentMessage[] = [];
 const open = () => DeepBotApp.open({
  dataDir, ...mock, provider: "test", modelId: "test-model", tickMs: 20, debounceMs: 0,
  mcp: readConnectorsConfig(dataDir, {}).mcp, emit: event => events.push(event),
 });
 let app = await open();
 const configPath = join(dataDir, "connectors.json");
 const existing = { t3: { savedToken: "private-t3-fixture" }, acp: [{ id: "existing", command: process.execPath }] };
 const status = async (id: string) => (await app.ledger()).data.connectors.find(item => item.id === id);
 const submit = async (cmd: { requestId: string; type: string } & Record<string, unknown>) => {
  const from = events.length;
  await app.command(cmd);
  await eventually(() => events.slice(from).some(event => "requestId" in event && event.requestId === cmd.requestId &&
    (event.type === "ack" || event.type === "error")), cmd.requestId);
  return events.slice(from).find(event => "requestId" in event && event.requestId === cmd.requestId &&
    (event.type === "ack" || event.type === "error"));
 };
 const save = (requestId: string, botIds: string[], allowNewBots: boolean, config = {}) =>
  submit({ type: "connector.mcp.save", requestId, connectorId: target, name: "Legacy MCP", access: { botIds, allowNewBots }, ...config });
 const makeBot = (id: string, hidden = false) => app.command({ type: "bot.upsert", requestId: `create-${id}`, bot: { id, name: id, hidden } });
 const waitResult = async (marker: string) => {
  const result = () => scriptResults.get(marker);
  await eventually(() => result(), marker);
  return result()!;
 };
 const expectedCatalog = (visible: boolean) => visible
  ? /"hits":1,"detail":true,"namespace":true/ : /"hits":0,"detail":false,"namespace":false/;
 try {
  await makeBot("hidden", true);
  await app.mutate(ledger => { delete ledger.mcpPolicies; });
  await app.close();
  await writeFile(configPath, JSON.stringify({ ...existing, mcp: [
   { id: "legacy", name: "Legacy MCP", url: service.origin + "/alpha" },
   { id: "legacy-stdio", name: "Legacy stdio", command: process.execPath, args: [join(import.meta.dirname, "../test/fixtures/mcp-stdio.mjs")] },
  ] }), { mode: 0o600 });
  app = await open();
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, ["xiaocai", "hidden"]);
  assert.equal((await status("legacy"))?.mcp?.allowNewBots, false);
  assert.deepEqual((await status("legacy-stdio"))?.mcp, {
   kind: "stdio", enabled: true, hasCredential: false, botIds: ["xiaocai", "hidden"], allowNewBots: false,
  });
  assert.equal((await status("legacy-stdio"))?.tools, 2);
  await makeBot("new-denied");
  await send(app, "front-ok", "MCP验收 front-ok", "hidden");
  const allowedFront = await waitResult("front-ok");
  assert.match(allowedFront, expectedCatalog(true));
  assert.match(allowedFront, /MCP_ECHO_OK/);
  assert.match(activeStateSection(mock.requests.find(messages => messages.some(message => content(message).includes("front-ok")))!), /Legacy MCP/);
  await send(app, "front-denied", "MCP验收 front-denied", "new-denied");
  const deniedFront = await waitResult("front-denied");
  assert.match(deniedFront, expectedCatalog(false));
  assert.match(deniedFront, /CALL_DENIED/);
  assert.ok(!activeStateSection(mock.requests.find(messages => messages.some(message => content(message).includes("front-denied")))!).includes("Legacy MCP"));

  await openWork(app, "MCP验收 worker-ok", "self");
  const allowedWorker = await waitResult("worker-ok");
  assert.match(allowedWorker, expectedCatalog(true));
  assert.match(allowedWorker, /MCP_ECHO_OK/);
  await app.createWork("new-denied", { title: "MCP验收 worker-denied", goal: "MCP验收 worker-denied", criteria: ["检查目录"], assignee: "self" }, "worker-no-access");
  const deniedWorker = await waitResult("worker-denied");
  assert.match(deniedWorker, expectedCatalog(false));
  assert.match(deniedWorker, /CALL_DENIED/);
  assert.equal(service.calls.length, 2, "only the allowed front and worker reached the service");

  holdCall = true;
  await send(app, "held", "MCP验收 held-call", "hidden");
  await eventually(() => service.calls.some(call => call.args.hold), "first script call reached the service");
  assert.equal((await save("revoke", [], true))?.type, "ack");
  held.resolve();
  const completed = await waitResult("held-call");
  holdCall = false;
  assert.match(completed, /MCP_ECHO_OK/);
  assert.match(completed, /STALE_CALL_DENIED/);
  assert.equal(service.calls.length, 3);
  await makeBot("new-allowed");
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, ["new-allowed"]);
  assert.equal((await save("default-off", ["new-allowed"], false))?.type, "ack");
  await makeBot("later-denied");
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, ["new-allowed"]);

  const disconnect = (requestId: string, enabled: boolean) =>
   submit({ type: "connector.mcp.connect", requestId, connectorId: "legacy", enabled });
  held = Promise.withResolvers<void>();
  holdCall = true;
  await send(app, "held-disconnect", "MCP验收 held-disconnect", "new-allowed");
  await eventually(() => service.calls.length === 4, "call in flight before disconnect");
  assert.equal((await disconnect("disconnect", false))?.type, "ack");
  held.resolve();
  const drained = await waitResult("held-disconnect");
  holdCall = false;
  assert.match(drained, /MCP_ECHO_OK/);
  assert.match(drained, /STALE_CALL_DENIED/);
  assert.equal(service.calls.length, 4);
  await app.close();
  app = await open();
  assert.equal((await status("legacy"))?.available, false);
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, ["new-allowed"]);
  await send(app, "disconnected", "MCP验收 during-disconnect", "new-allowed");
  assert.match(await waitResult("during-disconnect"), expectedCatalog(false));
  assert.equal(service.calls.length, 4);
  assert.equal((await disconnect("reconnect", true))?.type, "ack");
  await send(app, "reconnected", "MCP验收 after-reconnect", "new-allowed");
  assert.match(await waitResult("after-reconnect"), /MCP_ECHO_OK/);

  const add = { type: "connector.mcp.save", requestId: "add", name: "Second MCP",
   url: service.origin + "/protected", token: "synthetic-mcp-token", access: { botIds: [], allowNewBots: false } };
  assert.equal((await submit(add))?.type, "ack");
  assert.equal((await submit(add))?.type, "ack");
  const second = (await app.ledger()).data.connectors.find(item => item.name === "Second MCP")!;
  assert.notEqual(second.id, "legacy");
  assert.equal(second.available, true);
  assert.deepEqual(second.mcp?.botIds, []);
  assert.equal((await save("failed-endpoint", [], true, { url: service.origin + "/missing" }))?.type, "error");
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, ["new-allowed"]);
  assert.equal((await status("legacy"))?.mcp?.allowNewBots, false);
  assert.equal((await status("legacy"))?.available, true);
  assert.equal((await save("clear-legacy", [], false))?.type, "ack");
  const saved = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(saved.t3, existing.t3);
  assert.deepEqual(saved.acp, existing.acp);
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(events).includes("synthetic-mcp-token"));
  assert.ok(!JSON.stringify(await app.ledger()).includes("synthetic-mcp-token"));

  await app.close();
  app = await open();
  assert.deepEqual((await status("legacy"))?.mcp?.botIds, []);
  assert.deepEqual((await status(second.id))?.mcp?.botIds, []);
  assert.equal((await status(second.id))?.available, true);
  await send(app, "restart-denied", "MCP验收 after-restart-empty", "new-allowed");
  assert.match(await waitResult("after-restart-empty"), expectedCatalog(false));
  assert.equal(service.calls.length, 5, "revoked, disconnected and empty-list requests never reached either service");

  target = second.id;
  assert.equal((await save("grant-second", ["new-allowed"], false, { name: "Second MCP" }))?.type, "ack");
  await send(app, "second-allowed", "MCP验收 second-allowed", "new-allowed");
  assert.match(await waitResult("second-allowed"), /MCP_ECHO_OK/);
  assert.equal(service.calls.at(-1)?.service, "/protected");
 } finally {
  held.resolve();
  await app.close();
  await service.close();
  await rm(dataDir, { recursive: true, force: true });
 }
});

const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const reported = async (app: DeepBotApp, value: string) => (await app.ledger()).reports.some(r => r.text === value);
test("self runs with the executor settings: thinking, its own context window, images, AGENTS.md and no turn cap",async()=>{
 const f=await fixture({script:messages=>{
  const worker=messages.some(m=>m.role==="user"&&content(m).startsWith("执行派工"));
  if(worker){
   const rounds=messages.filter(m=>m.role==="toolResult").length;
   if(rounds===0)return call("read",{path:"pixel.png"});
   if(rounds<70)return call("read",{path:"note.txt"});
   return text("七十轮后完成");
  }
  return messages.at(-1)?.role==="toolResult"?call("pass"):text("ok");
 }});try{
  const workspace=join(f.dataDir,"bots","xiaocai","workspace");
  await writeFile(join(f.dataDir,"AGENTS.md"),"外层说明");await writeFile(join(workspace,"AGENTS.md"),"内层说明");await writeFile(join(workspace,"CLAUDE.md"),"有 AGENTS.md 时不读");
  await writeFile(join(workspace,"pixel.png"),Buffer.from(PIXEL_PNG,"base64"));await writeFile(join(workspace,"note.txt"),"x");
  assert.deepEqual((await f.app.ledger()).data.settings.executor,{thinkingLevel:"medium",contextWindow:0,images:true,projectInstructions:true});
  await assert.rejects(f.app.command({type:"settings.update",requestId:"bad-level",settings:{executor:{thinkingLevel:"turbo",contextWindow:0,images:true,projectInstructions:true}}}),/执行器配置无效/);
  await assert.rejects(f.app.command({type:"settings.update",requestId:"bad-window",settings:{executor:{thinkingLevel:"high",contextWindow:1000,images:true,projectInstructions:true}}}),/执行器配置无效/);
  await f.app.command({type:"settings.update",requestId:"executor",settings:{executor:{thinkingLevel:"high",contextWindow:1_000_000,images:true,projectInstructions:true}}});
  await openWork(f.app,"执行器配置","self");
  await eventually(()=>reported(f.app,"七十轮后完成"),"self answers after more than 64 tool rounds",20000);
  const worker=f.mock.calls.filter(c=>c.model.provider==="self:test");
  assert.equal(worker.length,71,"no turn cap cuts the run at 64 rounds");
  assert.equal(worker[0]!.model.contextWindow,1_000_000);assert.equal(worker[0]!.model.reasoning,true);assert.deepEqual(worker[0]!.model.input,["text","image"]);
  assert.equal(worker[0]!.reasoning,"high");
  const prompt=JSON.stringify(worker[0]!.messages.filter(m=>(m.role as string)==="system"));
  assert.ok(prompt.indexOf("外层说明")>=0&&prompt.indexOf("外层说明")<prompt.indexOf("内层说明"),"outer AGENTS.md comes before the inner one");
  assert.ok(!prompt.includes("有 AGENTS.md 时不读"),"CLAUDE.md only stands in where there is no AGENTS.md");
  assert.ok(worker[1]!.messages.some(m=>m.role==="toolResult"&&Array.isArray(m.content)&&m.content.some(x=>x.type==="image")),"the image read reaches the model");
  await send(f.app,"front-chat","你好");await eventually(()=>f.mock.calls.some(c=>c.model.provider==="test"),"front request");
  const front=f.mock.calls.filter(c=>c.model.provider==="test");assert.equal(front[0]!.model.contextWindow,128000);assert.deepEqual(front[0]!.model.input,["text"]);assert.equal(front[0]!.reasoning,undefined,"the Bot's chat model keeps its own settings");
 }finally{await f.cleanup();}
});

test("executor settings off: no reasoning, text only, no project instructions",async()=>{
 const f=await fixture({script:messages=>messages.some(m=>m.role==="user"&&content(m).startsWith("执行派工"))?text("关闭后完成"):messages.at(-1)?.role==="toolResult"?call("pass"):text("ok")});try{
  await writeFile(join(f.dataDir,"bots","xiaocai","workspace","AGENTS.md"),"不应读取的说明");
  await f.app.command({type:"settings.update",requestId:"executor-off",settings:{executor:{thinkingLevel:"off",contextWindow:0,images:false,projectInstructions:false}}});
  await openWork(f.app,"关闭配置","self");await eventually(()=>reported(f.app,"关闭后完成"),"self answers");
  const worker=f.mock.calls.find(c=>c.model.provider==="self:test")!;
  assert.equal(worker.reasoning,undefined);assert.equal(worker.model.reasoning,false);assert.deepEqual(worker.model.input,["text"]);assert.equal(worker.model.contextWindow,128000,"0 follows the model");
  assert.ok(!JSON.stringify(worker.messages).includes("不应读取的说明"));
 }finally{await f.cleanup();}
});

test("a self run interrupted by a restart resumes on its model alias with a fresh model registry",async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),"deepbot-executor-restart-"));
 const isWorker=(messages:ModelMessage[])=>messages.some(m=>m.role==="user"&&content(m).startsWith("执行派工"));
 const front=(messages:ModelMessage[])=>messages.at(-1)?.role==="toolResult"?call("pass"):text("ok");
 const first=mockModels((messages,signal)=>isWorker(messages)?new Promise((_,reject)=>signal?.addEventListener("abort",()=>reject(new Error("aborted")))):front(messages));
 const second=mockModels(messages=>isWorker(messages)?text("重启后完成"):front(messages));
 const open=(mock:ReturnType<typeof mockModels>)=>DeepBotApp.open({dataDir,models:mock.models,provider:"test",modelId:"test-model",tickMs:20,debounceMs:10});
 let app=await open(first);try{
  await app.command({type:"settings.update",requestId:"executor",settings:{executor:{thinkingLevel:"low",contextWindow:256000,images:true,projectInstructions:true}}});
  await openWork(app,"重启恢复","self");
  await eventually(()=>first.calls.some(c=>c.model.provider==="self:test"),"self request in flight");
  await app.close();app=await open(second);
  await eventually(()=>reported(app,"重启后完成"),"resumed self run answers");
  const resumed=second.calls.find(c=>c.model.provider==="self:test")!;
  assert.equal(resumed.model.contextWindow,256000);assert.equal(resumed.reasoning,"low");
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});

test("self runs coding tools in parallel, isolates bash temp/spill files in dataDir/tmp, cleans up when idle, and marks read replay-safe", async () => {
 let step = 0;
 let tmpSaw = "";
 let spillDiag = "";
 const f = await fixture({
  script: (messages) => {
   const isWorker = messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"));
   if (!isWorker) return messages.at(-1)?.role === "toolResult" ? call("pass") : text("ok");
   const results = messages.filter((m) => m.role === "toolResult");
   if (step === 0 && results.length === 0) {
    step = 1;
    return [
     ...call("bash", { command: "touch one.ready && for i in $(seq 1 100); do [ -f two.ready ] && break; sleep 0.02; done; test -f two.ready && echo \"TMP=$TMPDIR\"" }),
     ...call("bash", { command: "touch two.ready && for i in $(seq 1 100); do [ -f one.ready ] && break; sleep 0.02; done; test -f one.ready && for n in $(seq 1 2500); do echo \"spill-line-$n\"; done" }),
    ];
   }
   if (results.length >= 2) {
    const texts = results.map(content).join("\n");
    const tmpMatch = /TMP=([^\n]+)/.exec(texts);
    if (tmpMatch) tmpSaw = tmpMatch[1]!.trim();
    const diagMatch = /Full output: ([^\n]+)/.exec(texts);
    if (diagMatch) spillDiag = diagMatch[1]!.trim();
    return text("并行执行与临时目录验证通过");
   }
   return text("异常结束");
  },
 });
 try {
  assert.equal(f.app.codingTools.tools?.find((t) => t.name === "read")?.replay, "safe");
  assert.notEqual(f.app.codingTools.tools?.find((t) => t.name === "write")?.replay, "safe");
  assert.notEqual(f.app.codingTools.tools?.find((t) => t.name === "bash")?.replay, "safe");
  const w = await openWork(f.app, "并行与临时目录", "self");
  await eventually(() => reported(f.app, "并行执行与临时目录验证通过"), "parallel bash tools complete", 10000);
  const expectedTmp = join(f.dataDir, "tmp");
  assert.equal(tmpSaw, expectedTmp);
  assert.ok(spillDiag.startsWith(expectedTmp), `spill path ${spillDiag} must live under ${expectedTmp}`);
  assert.ok((await readdir(expectedTmp)).length > 0, "spill temp dir exists before work ends");
  await f.app.reviewWork(w.id, true, ["并行工具与临时目录核对通过"], "全部完成", "review-parallel");
  await eventually(async () => (await readdir(expectedTmp)).length === 0, "tmp cleaned when self is idle");
 } finally {
  await f.cleanup();
 }
});

test("reopening an ended self work reuses the original conversation, formats a clean brief, and deduplicates executionLog", async () => {
 const connector = new FixtureConnector("other");
 let selfRound = 0;
 const f = await fixture({
  persistent: true,
  connectors: [connector],
  script: (messages) => {
   const user = content(messages.filter((m) => m.role === "user").at(-1));
   const last = messages.at(-1);
   if (messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    if (last?.role === "toolResult") return text("已写入并返回");
    if (selfRound === 0) {
     selfRound++;
     return call("write", { path: "stage1.txt", content: "v1" });
    }
    return text("原会话续做完成");
   }
   if (user.includes("派活结构化汇报")) {
    const workId = /"workId":"([^"]+)"/.exec(user)?.[1];
    if (last?.role === "toolResult") return call("pass");
    if (workId && user.includes("原会话续做完成")) {
     return call("work_review", { workId, accepted: true, checks: ["续做已完成"], reply: "续做已交付" });
    }
    if (workId && user.includes("已写入并返回")) {
     return call("work_review", { workId, accepted: true, checks: ["第一阶段已完成"], reply: "第一阶段已交付" });
    }
    return call("pass");
   }
   const workId = /"workId":"([^"]+)"/.exec(user)?.[1];
   if (workId && user.includes("追加功能")) {
    return last?.role === "toolResult" ? call("pass") : call("work_send", { workId, text: "追加一节说明" });
   }
   return last?.role === "toolResult" ? call("pass") : text("ok");
  },
 });
 try {
  await f.app.command({
   type: "bot.upsert",
   requestId: "custom-inst",
   bot: { id: "xiaocai", name: "小菜", instructions: "唯一自定义分身指令ABC" },
  });
  const w = await openWork(f.app, "可复用事项", "self");
  await eventually(async () => (await f.app.ledger()).data.works.find((x) => x.id === w.id)?.phase === "done", "first stage done", 10000);
  const firstAssign = (await f.app.ledger()).data.assignments.find((a) => a.workId === w.id)!;
  const firstPrompt = content(f.mock.calls.find((c) => c.model.provider === "self:test")!.messages.find((m) => m.role === "user"));
  assert.ok(firstPrompt.startsWith("执行派工"));
  assert.ok(!firstPrompt.includes("唯一自定义分身指令ABC"), "bot instructions stay in system prompt only");
  assert.ok(!firstPrompt.includes('\\"messages\\"'), "context is not double-JSON-escaped");

  await f.app.command({
   type: "message.send",
   requestId: "reopen-self",
   botId: "xiaocai",
   threadId: "dm:xiaocai",
   workId: w.id,
   text: "追加功能",
  });
  await eventually(
   async () => (await f.app.ledger()).data.messages.some((m) => m.workId === w.id && m.text === "续做已交付"),
   "reopened work delivered",
   10000,
  );
  const l = await f.app.ledger();
  const assignments = l.data.assignments.filter((a) => a.workId === w.id);
  assert.equal(assignments.length, 2);
  assert.equal(assignments[1]!.sessionRef?.conversationId, firstAssign.sessionRef?.conversationId, "same conversation reused");
  const reopenedReq = f.mock.calls.filter((c) => c.model.provider === "self:test").at(-1)!;
  const reopenedUsers = reopenedReq.messages.filter((m) => m.role === "user").map(content);
  assert.ok(reopenedUsers.some((t) => t.includes("目标：可复用事项")) && reopenedUsers.some((t) => t.includes("追加一节说明")), "previous history preserved alongside follow-up");
  const log = await f.app.executionLog(w.id);
  assert.equal(new Set(log.items.map((x) => x.entryId)).size, log.items.length, "executionLog deduplicates reused conversation");

  await f.app.command({ type: "work.reassign", requestId: "to-other", workId: w.id, assignee: "other" });
  await eventually(() => connector.starts === 1, "cross-connector reassign uses fresh handoff");
 } finally {
  await f.cleanup();
 }
});

test("self auto-continues truncated length responses and stays waiting when report_question shares a turn", async () => {
 let lengthCount = 0;
 let qTurn = 0;
 const f = await fixture({
  script: (messages) => {
   const user = content(messages.filter((m) => m.role === "user").at(-1));
   const last = messages.at(-1);
   if (messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    const allUsers = messages.filter((m) => m.role === "user").map(content).join("\n");
    if (allUsers.includes("超长任务")) {
     if (lengthCount === 0) {
      lengthCount++;
      return { content: text("半截未完"), stopReason: "length" };
     }
     return text("续写后全部完成");
    }
    if (allUsers.includes("混合提问")) {
     if (last?.role === "toolResult") {
      if (qTurn === 1) {
       qTurn = 2;
       return text("已提交问题，正在等待答复");
      }
     }
     if (allUsers.includes("答复：使用 JSON")) {
      return text("已按 JSON 完成");
     }
     if (qTurn === 0) {
      qTurn = 1;
      return [...call("report_progress", { text: "前半段完成" }), ...call("report_question", { question: "选哪种格式？" })];
     }
     return text("已按 JSON 完成");
    }
   }
   if (user.includes("派活结构化汇报")) {
    const workId = /"workId":"([^"]+)"/.exec(user)?.[1];
    if (last?.role === "toolResult") return call("pass");
    if (workId && user.includes('"kind":"question"')) {
     return call("work_send", { workId, text: "答复：使用 JSON" });
    }
    return call("pass");
   }
   return last?.role === "toolResult" ? call("pass") : text("ok");
  },
 });
 try {
  const w1 = await openWork(f.app, "超长任务", "self");
  await eventually(() => reported(f.app, "续写后全部完成"), "length response auto-continued to ready", 10000);
  const w1Reports = (await f.app.ledger()).reports.filter((r) => r.assignmentId === w1.assignmentId);
  assert.ok(!w1Reports.some((r) => r.text === "半截未完"), "truncated output must not be emitted as ready");

  const w2 = await openWork(f.app, "混合提问", "self");
  await eventually(() => reported(f.app, "已按 JSON 完成"), "question wait avoided premature ready and finished after reply", 10000);
  const w2Reports = (await f.app.ledger()).reports.filter((r) => r.assignmentId === w2.assignmentId);
  assert.ok(!w2Reports.some((r) => r.kind === "ready" && r.text.includes("等待答复")), "text after mixed report_question must not emit ready");
 } finally {
  await f.cleanup();
 }
});

test("self loads global AGENTS.md and progressive SKILL.md index with inner override", async () => {
 const project = await mkdtemp(join(tmpdir(), "deepbot-skills-proj-"));
 const f = await fixture({
  script: (messages) =>
   messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))
    ? text("技能说明已加载")
    : messages.at(-1)?.role === "toolResult"
      ? call("pass")
      : text("ok"),
 });
 try {
  await writeFile(join(f.dataDir, "AGENTS.md"), "全局规范G");
  await mkdir(join(f.dataDir, "skills", "global-skill"), { recursive: true });
  await writeFile(
   join(f.dataDir, "skills", "global-skill", "SKILL.md"),
   "---\nname: global-skill\ndescription: 全局技能描述\n---\nSKILL_BODY_SECRET\n",
  );
  await mkdir(join(project, ".claude", "skills", "shared-skill"), { recursive: true });
  await writeFile(
   join(project, ".claude", "skills", "shared-skill", "SKILL.md"),
   "---\nname: shared-skill\ndescription: \"被覆盖的描述\"\n---\n",
  );
  await mkdir(join(project, ".deepbot", "skills", "shared-skill"), { recursive: true });
  await writeFile(
   join(project, ".deepbot", "skills", "shared-skill", "SKILL.md"),
   "---\nname: shared-skill\ndescription: |\n  最终生效的技能描述\n---\nSKILL_BODY_SECRET\n",
  );
  await mkdir(join(project, "sub"), { recursive: true });
  await writeFile(join(project, "sub", "AGENTS.md"), "项目内层说明P");
  await f.app.setFolder("xiaocai", project, true);

  await f.app.createWork("xiaocai", { title: "技能检查", goal: "技能检查", criteria: ["完成"], assignee: "self", folder: join(project, "sub") }, "skills-on");
  await eventually(() => reported(f.app, "技能说明已加载"), "self receives global AGENTS and skills", 10000);
  const sysPrompt = JSON.stringify(
   f.mock.calls.find((c) => c.model.provider === "self:test")!.messages.filter((m) => (m.role as string) === "system"),
  );
  assert.ok(sysPrompt.includes("全局规范G") && sysPrompt.indexOf("全局规范G") < sysPrompt.indexOf("项目内层说明P"));
  assert.ok(sysPrompt.includes("global-skill") && sysPrompt.includes("全局技能描述"));
  assert.ok(sysPrompt.includes("shared-skill") && sysPrompt.includes("最终生效的技能描述"));
  assert.ok(!sysPrompt.includes("被覆盖的描述"), "inner .deepbot/skills overrides .claude/skills");
  assert.ok(!sysPrompt.includes("SKILL_BODY_SECRET"), "progressive disclosure keeps body out of system prompt");

  await f.app.command({
   type: "settings.update",
   requestId: "skills-off",
   settings: { executor: { thinkingLevel: "medium", contextWindow: 0, images: true, projectInstructions: false } },
  });
  await f.app.createWork("xiaocai", { title: "关闭说明", goal: "关闭说明", criteria: ["完成"], assignee: "self", folder: join(project, "sub") }, "skills-off");
  await eventually(() => f.mock.calls.filter((c) => c.model.provider === "self:test").length >= 2, "second self run", 10000);
  const offPrompt = JSON.stringify(
   f.mock.calls.filter((c) => c.model.provider === "self:test").at(-1)!.messages.filter((m) => (m.role as string) === "system"),
  );
  assert.ok(!offPrompt.includes("全局规范G") && !offPrompt.includes("可用技能"));
 } finally {
  await f.cleanup();
  await rm(project, { recursive: true, force: true });
 }
});

test("beforeTool blocks out-of-bounds write/edit and disabled files permission while allowing bash", async () => {
 const outsideDir = await mkdtemp(join(tmpdir(), "deepbot-outside-write-"));
 const outsideTarget = join(outsideDir, "blocked.txt");
 const homeTarget = `~/deepbot-blocked-${Date.now()}.txt`;
 let step = 0;
 const f = await fixture({
  script: (messages) => {
   const isWorker = messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"));
   if (!isWorker) return messages.at(-1)?.role === "toolResult" ? call("pass") : text("ok");
   const user = content(messages.filter((m) => m.role === "user").at(-1));
   const last = messages.at(-1);
   if (user.includes("关闭文件权限后")) {
    if (last?.role === "toolResult" && last.toolName === "write") {
     return call("bash", { command: "echo bash-still-works" });
    }
    if (last?.role === "toolResult" && last.toolName === "bash") {
     return text("权限关闭测试结束");
    }
    return call("write", { path: "inside-when-disabled.txt", content: "nope" });
   }
   step++;
   if (step === 1) return call("write", { path: outsideTarget, content: "bad" });
   if (step === 2) return call("write", { path: homeTarget, content: "bad" });
   if (step === 3) return call("edit", { path: outsideTarget, edits: [{ oldText: "a", newText: "b" }] });
   if (step === 4) return call("write", { path: "@inside/ok.txt", content: "hello" });
   if (step === 5) return call("edit", { path: "inside/ok.txt", edits: [{ oldText: "hello", newText: "world" }] });
   return text("写边界校验完成");
  },
 });
 try {
  await openWork(f.app, "写边界", "self");
  await eventually(() => reported(f.app, "写边界校验完成"), "write/edit boundary checks complete", 10000);
  assert.equal(await stat(outsideTarget).catch(() => undefined), undefined);
  const wsFile = join(f.dataDir, "bots", "xiaocai", "workspace", "inside", "ok.txt");
  assert.equal(await readFile(wsFile, "utf8"), "world");
  const workerCalls = f.mock.calls.filter((c) => c.model.provider === "self:test");
  const toolResults = workerCalls.at(-1)!.messages.filter((m) => m.role === "toolResult");
  assert.equal(toolResults[0]!.isError, true);
  assert.equal(toolResults[1]!.isError, true);
  assert.equal(toolResults[2]!.isError, true);
  assert.equal(toolResults[3]!.isError, false);
  assert.equal(toolResults[4]!.isError, false);

  await f.app.command({
   type: "settings.update",
   requestId: "disable-files",
   settings: { permissions: { files: false, browser: true, confirmPublish: true, deleteFiles: false } },
  });
  await openWork(f.app, "关闭文件权限后", "self");
  await eventually(() => reported(f.app, "权限关闭测试结束"), "disabled files permission blocks write but keeps bash", 10000);
  const disabledMsgs = f.mock.calls.filter((c) => c.model.provider === "self:test").at(-1)!.messages;
  const disabledToolResults = disabledMsgs.filter((m) => m.role === "toolResult");
  const writeRes = disabledToolResults.find((m) => m.toolName === "write")!;
  const bashRes = disabledToolResults.find((m) => m.toolName === "bash")!;
  assert.equal(writeRes.isError, true);
  assert.match(content(writeRes), /已关闭/);
  assert.equal(bashRes.isError, false);
  assert.match(content(bashRes), /bash-still-works/);
 } finally {
  await f.cleanup();
  await rm(outsideDir, { recursive: true, force: true });
 }
});

test("self explore runs read-only child subagent and handoff resets context cleanly", async () => {
 let exploreReqTools: string[] = [];
 let postHandoffMessages: ModelMessage[] = [];
 const f = await fixture({
  script: (messages) => {
   const isExplore = messages.some((m) => (m.role as string) === "system" && JSON.stringify(m).includes("只读代码探索子代理"));
   if (isExplore) {
    exploreReqTools = offeredTools(messages);
    if (messages.at(-1)?.role === "toolResult") return text("找到标记在 marker.txt:1");
    return call("read", { path: "marker.txt" });
   }
   if (messages.some((m) => m.role === "user" && content(m).startsWith("阶段交接摘要"))) {
    postHandoffMessages = messages;
    return text("交接后完成");
   }
   if (messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    const last = messages.at(-1);
    if (last?.role === "toolResult" && last.toolName === "explore") {
     return call("handoff", { summary: `探索结论：${content(last)}` });
    }
    return call("explore", { task: "查看 marker.txt" });
   }
   return messages.at(-1)?.role === "toolResult" ? call("pass") : text("ok");
  },
 });
 try {
  await writeFile(join(f.dataDir, "bots", "xiaocai", "workspace", "marker.txt"), "MAGIC_TOKEN_123");
  await openWork(f.app, "探索与交接", "self");
  await eventually(() => reported(f.app, "交接后完成"), "explore and handoff complete", 10000);
  assert.deepEqual(exploreReqTools, ["bash", "read"], "explore child only gets read and bash");
  const postUsers = postHandoffMessages.filter((m) => m.role === "user").map(content);
  assert.equal(postUsers.length, 1, "handoff starts a fresh context");
  assert.match(postUsers[0]!, /MAGIC_TOKEN_123|找到标记在 marker\.txt:1/);
 } finally {
  await f.cleanup();
 }
});

test("self live tool execution and output tail project onto work.progress while running", async () => {
 const f = await fixture({
  script: (messages) => {
   if (!messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    return messages.at(-1)?.role === "toolResult" ? call("pass") : text("ok");
   }
   const last = messages.at(-1);
   if (last?.role === "toolResult" && last.toolName === "report_progress") {
    return call("bash", { command: "echo 'running step 42'; for i in $(seq 1 150); do [ -f proceed ] && break; sleep 0.02; done" });
   }
   if (last?.role === "toolResult" && last.toolName === "bash") {
    return text("实时进度测试完成");
   }
   return call("report_progress", { text: "阶段一：执行测试" });
  },
 });
 try {
  const w = await openWork(f.app, "实时进度", "self");
  await eventually(async () => {
   const progress = (await f.app.ledger()).data.works.find((x) => x.id === w.id)?.progress ?? "";
   return progress.includes("阶段一：执行测试") && progress.includes("正在执行 bash") && progress.includes("running step 42");
  }, "live progress reflects manual milestone, bash tool, and tail output", 10000);
  await writeFile(join(f.dataDir, "bots", "xiaocai", "workspace", "proceed"), "ok");
  await eventually(() => reported(f.app, "实时进度测试完成"), "live work finishes cleanly", 10000);
 } finally {
  await f.cleanup();
 }
});

test("memory_forget, memory.delete and external connector memory privacy", async () => {
 const connector = new FixtureConnector("ext");
 let badForgetError = "";
 const f = await fixture({
  connectors: [connector],
  script: (messages) => {
   if (messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    return text("self 收到记忆");
   }
   const last = messages.filter((m) => m.role !== "system").at(-1);
   const prompt = content(messages.filter((m) => m.role === "user").at(-1));
   if (last?.role === "toolResult") {
    if (last.toolName === "memory_forget" && last.isError) badForgetError = content(last);
    return call("pass");
   }
   if (prompt.includes('"text":"add-mem"')) {
    const id = /"messageId":"([^"]+)"/.exec(prompt)![1]!;
    return call("memory_set", { id: "mem-pref", text: "偏好使用 TypeScript", sourceMessageIds: [id] });
   }
   if (prompt.includes('"text":"update-mem"')) {
    const id = /"messageId":"([^"]+)"/.exec(prompt)![1]!;
    return call("memory_set", { id: "mem-pref", text: "偏好使用严格 TypeScript", sourceMessageIds: [id] });
   }
   if (prompt.includes('"text":"forget-bad"')) {
    return call("memory_forget", { id: "mem-other" });
   }
   if (prompt.includes('"text":"forget-pref"')) {
    return call("memory_forget", { id: "mem-pref" });
   }
   return text("ok");
  },
 });
 try {
  await send(f.app, "m-add", "add-mem");
  await eventually(async () => (await f.app.ledger()).data.memories.length === 1, "memory created");
  await send(f.app, "m-upd", "update-mem");
  await eventually(async () => (await f.app.ledger()).data.memories[0]?.revision === 2, "memory updated in place");
  assert.equal((await f.app.ledger()).data.memories.length, 1);
  assert.equal((await f.app.ledger()).data.memories[0]!.text, "偏好使用严格 TypeScript");

  await openWork(f.app, "内部隐私测试", "self");
  await eventually(() => f.mock.calls.some((c) => c.model.provider === "self:test"), "self receives memory");
  const selfPrompt = content(f.mock.calls.find((c) => c.model.provider === "self:test")!.messages.find((m) => m.role === "user"));
  assert.match(selfPrompt, /偏好使用严格 TypeScript/);

  const extWork = await openWork(f.app, "外部隐私测试", "ext");
  await eventually(() => connector.records.has(extWork.assignmentId!), "external connector dispatched");
  const extContext = JSON.parse(connector.records.get(extWork.assignmentId!)!.brief.context) as { memory: unknown[] };
  assert.deepEqual(extContext.memory, [], "external connector does not receive personal bot memories");

  await f.app.command({ type: "bot.upsert", requestId: "other-bot", bot: { id: "other", name: "其他" } });
  await f.app.command({
   type: "memory.upsert",
   requestId: "other-mem",
   memory: { id: "mem-other", botId: "other", text: "其他 Bot 的秘密", sourceMessageIds: [], revision: 1 },
  });
  await assert.rejects(f.app.command({
   type: "memory.upsert", requestId: "wrong-owner",
   memory: { id: "mem-other", botId: "xiaocai", text: "不应覆盖", sourceMessageIds: [], revision: 1 },
  }), /记忆不属于当前 Bot/);

  await send(f.app, "m-forget-bad", "forget-bad");
  await eventually(() => badForgetError.length > 0, "forgetting another bot memory is rejected");
  assert.match(badForgetError, /不属于当前 Bot|不存在/);

  await send(f.app, "m-forget-pref", "forget-pref");
  await eventually(async () => !(await f.app.ledger()).data.memories.some((m) => m.id === "mem-pref"), "memory forgotten by tool");

  await send(f.app, "m-after-forget", "after-forget");
  await eventually(() => f.mock.requests.some((r) => content(r.filter((m) => m.role === "user").at(-1)).includes('"text":"after-forget"')), "post-forget request");
  const postForgetState = activeStateSection(f.mock.requests.at(-1)!);
  assert.doesNotMatch(postForgetState, /偏好使用严格 TypeScript/);

  await f.app.command({ type: "memory.delete", requestId: "del-other", memoryId: "mem-other" });
  await f.app.command({ type: "memory.delete", requestId: "del-other", memoryId: "mem-other" });
  assert.equal((await f.app.ledger()).data.memories.length, 0);
  await assert.rejects(
   f.app.command({ type: "memory.delete", requestId: "del-missing", memoryId: "missing" }),
   /记忆不存在/,
  );
 } finally {
  await f.cleanup();
 }
});

test("cross-turn handoff carries plain replyTo, timestamps, recent ended works and bot plan messages", async () => {
 const t3 = new FixtureConnector("t3code", "T3 Code");
 let msgAId = "";
 let msgBId = "";
 const f = await fixture({
  connectors: [t3],
  script: (messages) => {
   if (messages.some((m) => m.role === "user" && content(m).startsWith("执行派工"))) {
    return text("已完成两步拆分");
   }
   const last = messages.filter((m) => m.role !== "system").at(-1);
   const prompt = content(messages.filter((m) => m.role === "user").at(-1));
   if (last?.role === "toolResult") return call("pass");
   if (prompt.includes('"text":"我想重构配置模块"')) {
    return text("建议拆分为 schema 与 loader 两步");
   }
   if (prompt.includes('"text":"不要用 T3，按这个方案做"')) {
    return call("work_start", {
     reply: "已按昨天定下的方案开始拆分",
     title: "重构配置模块",
     goal: "拆分 schema 与 loader",
     criteria: ["拆分完成并自测"],
     assignee: "self",
     sourceMessageIds: [msgAId, msgBId],
     context: "采用两步拆分方案",
    });
   }
   if (prompt.includes("派活结构化汇报")) {
    const workId = /"workId":"([^"]+)"/.exec(prompt)?.[1];
    if (workId) return call("work_review", { workId, accepted: true, checks: ["拆分完成"], reply: "配置模块拆分已交付" });
   }
   return text("已收到新消息");
  },
 });
 try {
  await send(f.app, "msg-a", "我想重构配置模块");
  await eventually(async () => (await f.app.ledger()).data.messages.some((m) => m.author.kind === "bot" && m.text.includes("schema 与 loader")), "bot reply B ready");
  const ledgerAfterB = await f.app.ledger();
  msgAId = ledgerAfterB.data.messages.find((m) => m.requestId === "msg-a")!.id;
  msgBId = ledgerAfterB.data.messages.find((m) => m.author.kind === "bot" && m.text.includes("schema 与 loader"))!.id;

  await f.app.command({
   type: "message.send",
   requestId: "msg-c",
   botId: "xiaocai",
   threadId: "dm:xiaocai",
   replyTo: msgBId,
   text: "不要用 T3，按这个方案做",
  });
  await eventually(() => f.mock.requests.some((r) => content(r.filter((m) => m.role === "user").at(-1)).includes('"text":"不要用 T3，按这个方案做"')), "turn C arrives");
  const turnCPrompt = content(f.mock.requests.find((r) => content(r.filter((m) => m.role === "user").at(-1)).includes('"text":"不要用 T3，按这个方案做"'))!.filter((m) => m.role === "user").at(-1));
  assert.match(turnCPrompt, /当前时间：\d{4}-\d{2}-\d{2}T/);
  assert.match(turnCPrompt, /"sentAt":"/);
  assert.match(turnCPrompt, new RegExp(`"replyTo":\\{"messageId":"${msgBId}","author":"bot","text":"建议拆分为 schema 与 loader 两步"\\}`));

  await eventually(() => f.mock.calls.some((c) => c.model.provider === "self:test"), "self starts work");
  const selfUser = content(f.mock.calls.find((c) => c.model.provider === "self:test")!.messages.find((m) => m.role === "user"));
  assert.match(selfUser, /前序讨论背景：\n采用两步拆分方案/);
  assert.match(selfUser, /- \[用户\] 我想重构配置模块/);
  assert.match(selfUser, /- \[Bot\] 建议拆分为 schema 与 loader 两步/);
  assert.match(selfUser, /- \[用户\] 不要用 T3，按这个方案做/);

  await assert.rejects(
   f.app.createWork("xiaocai", { title: "禁止给 T3", goal: "测试路由", criteria: ["完成"], assignee: "t3code", sourceMessageIds: [msgAId, msgBId] }, "refuse-t3"),
   /不要交给 T3 Code/,
  );

  await eventually(async () => (await f.app.ledger()).data.works.some((w) => w.title === "重构配置模块" && w.outcome === "done"), "work delivered");
  const doneWork = (await f.app.ledger()).data.works.find((w) => w.title === "重构配置模块")!;

  await send(f.app, "msg-d", "再帮我看一下");
  await eventually(() => f.mock.requests.some((r) => content(r.filter((m) => m.role === "user").at(-1)).includes('"text":"再帮我看一下"')), "turn D arrives");
  const turnDPrompt = content(f.mock.requests.at(-1)!.filter((m) => m.role === "user").at(-1));
  assert.match(turnDPrompt, /近期已结束事项：/);
  assert.ok(turnDPrompt.includes(doneWork.id));
  assert.ok(turnDPrompt.includes('"title":"重构配置模块"'));
  assert.ok(turnDPrompt.includes('"outcome":"done"'));
 } finally {
  await f.cleanup();
 }
});

test("history_search finds early messages and ended works within the bot's own thread and resolveModel sets compaction overrides", async () => {
 const toolResults: Record<string, string> = {};
 const worker = new FixtureConnector("worker");
 const f = await fixture({
  connectors: [worker],
  script: (messages) => {
   const last = messages.filter((m) => m.role !== "system").at(-1);
   const prompt = content(messages.filter((m) => m.role === "user").at(-1));
   if (last?.role === "toolResult" && last.toolName === "history_search") {
    if (prompt.includes('"text":"search-all"')) toolResults.all = content(last);
    if (prompt.includes('"text":"search-msgs"')) toolResults.msgs = content(last);
    if (prompt.includes('"text":"search-works"')) toolResults.works = content(last);
    return call("pass");
   }
   if (last?.role === "toolResult") return call("pass");
   if (prompt.includes('"text":"search-all"')) return call("history_search", { query: "9443 备份" });
   if (prompt.includes('"text":"search-msgs"')) return call("history_search", { query: "9443", scope: "messages" });
   if (prompt.includes('"text":"search-works"')) return call("history_search", { query: "backup", scope: "works" });
   return text("已收到");
  },
 });
 try {
  assert.ok(f.app.compactionOverrides.has("test/test-model"), "foreground model registers compaction overrides");

  await send(f.app, "early-port", "秘钥端口配置在 9443 端口");
  await eventually(async () => (await f.app.ledger()).data.messages.some((m) => m.author.kind === "bot"), "early message answered");
  const portMsgId = (await f.app.ledger()).data.messages.find((m) => m.requestId === "early-port")!.id;

  const w = await openWork(f.app, "备份脚本", "worker");
  await eventually(() => worker.records.has(w.assignmentId!), "worker starts");
  await f.app.addArtifact(w.assignmentId!, { text: "/workspace/backup.sh 已验证" }, "hist-art");
  await f.app.acceptReport({ id: "hist-ready", assignmentId: w.assignmentId!, kind: "ready", text: "backup.sh 已生成", createdAt: Date.now() });
  await f.app.reviewWork(w.id, true, ["脚本已核验"], "备份脚本已交付", "hist-review");

  await f.app.command({ type: "bot.upsert", requestId: "other-hist-bot", bot: { id: "other", name: "其他" } });
  await send(f.app, "other-secret", "机密端口 8888 属于别的 Bot", "other");
  await f.app.createWork("other", { title: "其他 Bot 的秘密任务", goal: "保密", criteria: ["完成"], assignee: "worker" }, "other-secret-work");

  await send(f.app, "q-all", "search-all");
  await eventually(() => !!toolResults.all, "search-all completed");
  const allRes = JSON.parse(toolResults.all!) as { messages: { id: string; text: string }[]; works: { id: string; title: string; artifacts: { name: string }[] }[] };
  assert.ok(allRes.messages.some((m) => m.id === portMsgId && m.text.includes("9443")));
  assert.ok(allRes.works.some((x) => x.id === w.id && x.title === "备份脚本"));
  assert.ok(!toolResults.all!.includes("8888") && !toolResults.all!.includes("其他 Bot 的秘密任务"));

  await send(f.app, "q-msgs", "search-msgs");
  await eventually(() => !!toolResults.msgs, "search-msgs completed");
  const msgsRes = JSON.parse(toolResults.msgs!) as { messages?: unknown[]; works?: unknown[] };
  assert.ok(msgsRes.messages?.length && msgsRes.works === undefined);

  await send(f.app, "q-works", "search-works");
  await eventually(() => !!toolResults.works, "search-works completed");
  const worksRes = JSON.parse(toolResults.works!) as { messages?: unknown[]; works?: { id: string }[] };
  assert.ok(worksRes.works?.some((x) => x.id === w.id) && worksRes.messages === undefined);
 } finally {
  await f.cleanup();
 }
});
