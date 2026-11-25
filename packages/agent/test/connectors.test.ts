import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ACPConnector, type ACPOptions } from "../src/connectors/acp.ts";
import { T3CodeConnector, T3_DISPATCH_TOOLS, type T3Options } from "../src/connectors/t3code.ts";
import { T3ApprovalClient, canAutoApprove, liveApprovals } from "../src/connectors/t3-approvals.ts";
import { McpClient } from "../src/connectors/mcp.ts";
import { remoteT3Endpoint } from "../src/connectors/t3-pairing.ts";
import { remoteT3Candidate, remoteT3Connector } from "../src/connectors/t3-remote.ts";
import { McpToolConnector } from "../src/connectors/mcp-tools.ts";
import { readConnectorsConfig } from "../src/connectors/config.ts";
import type { DispatchPort } from "../src/connectors/port.ts";
import { DurableRecords } from "../src/connectors/support.ts";
import type { Brief, Report, SessionRef } from "../src/protocol.ts";
import { startT3Fixture } from "./fixtures/t3-mcp.mjs";

const acpFixture = resolve(import.meta.dirname, "fixtures/acp-peer.mjs");
const stdioFixture = resolve(import.meta.dirname, "fixtures/mcp-stdio.mjs");
function setup(goal = "测试任务") {
 const directory=mkdtempSync(join(tmpdir(),"deepbot-adapter-test-"));
 const brief: Brief={workId:'work1',botId:'bot1',botName:'小菜',threadId:'dm:bot1',goal,criteria:['有实际结果'],scope:'仅测试目录',cwd:directory,instructions:'真实执行',model:'test',provider:'test',permissions:{files:true,browser:true,confirmPublish:true,deleteFiles:false},connectedFolders:[directory],context:''};
 return {directory,brief};
}

test("only remote T3 dispatch allows literal private HTTP IPs", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]", "10.77.0.2", "172.16.0.1", "172.31.255.254", "192.168.0.2", "[fd12::2]"]) {
    assert.equal(remoteT3Endpoint(`http://${host}:3773/mcp/`), `http://${host}:3773/mcp`);
  }
  assert.equal(remoteT3Endpoint(" https://t3.example:3773/ "), "https://t3.example:3773/mcp");
  for (const host of ["8.8.8.8", "172.32.0.2", "100.64.0.2", "t3.local", "0.0.0.0", "[::ffff:192.168.0.2]", "[2001:db8::2]"]) {
    assert.throws(() => remoteT3Endpoint(`http://${host}:3773/mcp`), /派活连接.*HTTPS/);
  }
  for (const input of ["http://10.77.0.2@t3.example/mcp", "http://10.77.0.2/mcp?token=x", "http://10.77.0.2/mcp#", "http://10.77.0.2/other"]) {
    assert.throws(() => remoteT3Endpoint(input), /环境地址或 MCP 地址/);
  }
  assert.throws(() => new McpClient({ url: "http://10.77.0.2/mcp" }, "普通 MCP"), /必须使用 HTTPS/);
  assert.throws(() => new McpClient({ url: "http://8.8.8.8/mcp" }, "T3 Code", { allowPrivateHttp: true }), /必须使用 HTTPS/);
});

test("LAN T3 dispatch pairs without an approval credential and checks identity before using its session", async t => {
  const { directory } = setup();
  const code = "FULL-ABCDEFGHJK23";
  const fixture = await startT3Fixture({ root: "/isolated/lan-project", pairingCodes: { [code]: "full-access" } });
  t.after(() => fixture.close());
  const url = new URL(fixture.url);
  url.hostname = "10.77.0.2";
  const fetch = globalThis.fetch;
  const requests = t.mock.method(globalThis, "fetch", (input: string | URL, init?: RequestInit) => {
    const target = new URL(input);
    assert.equal(target.origin, url.origin);
    assert.equal(init?.redirect, "error");
    target.hostname = "127.0.0.1";
    return fetch(target, init);
  });
  const cmd = {
    type: "connector.t3.save", requestId: "lan", name: "局域网 T3", url: url.href,
    token: `${url.origin}/pair#token=${code}`, runtimeMode: "full-access",
  } as const;
  const signal = AbortSignal.timeout(5000);
  await assert.rejects(remoteT3Candidate({ ...cmd, approvalCredential: "device-fixture" }, "lan", [], [], signal), /审批连接.*HTTPS/);
  assert.equal(requests.mock.callCount(), 0);
  await assert.rejects(remoteT3Candidate({ ...cmd, token: `http://10.77.0.3:${url.port}/pair#token=${code}` }, "lan", [], [], signal),
    /配对链接与当前 T3 Code 地址不匹配/);
  assert.equal(requests.mock.callCount(), 1);
  const config = await remoteT3Candidate(cmd, "lan", [], [], signal);
  assert.equal(config.approvalToken, undefined);
  assert.deepEqual(fixture.state.approvals, ["full-access"]);
  const connector = remoteT3Connector(directory, config);
  await connector.validateRemote(signal);
  assert.equal((await connector.status()).t3?.approvalAvailable, false);
  fixture.state.environmentId = "different-environment";
  const before = requests.mock.callCount();
  await assert.rejects(connector.validateRemote(signal), /与已配对的电脑不匹配/);
  await connector.close();
  assert.deepEqual(requests.mock.calls.slice(before).map(({ arguments: [target] }) =>
    new URL(target instanceof Request ? target.url : target).pathname),
    ["/.well-known/t3/environment", "/.well-known/t3/environment"]);
});
const acp=(directory:string,args:string[],extra:Partial<ACPOptions>={})=>new ACPConnector({dataDir:directory,id:"acp:test",name:"ACP 测试",command:process.execPath,args,...extra});
async function reports(port:DispatchPort,ref:SessionRef,cursor?:string){const result:Report[]=[];for await(const report of port.events(ref,cursor))result.push(report);return result;}
async function waitReport(port:DispatchPort,ref:SessionRef,kind:Report['kind'],timeout=5000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const found=(await reports(port,ref)).findLast(report=>report.kind===kind);if(found)return found;await delay(20);}throw new Error(`timed out waiting ${kind}`);}
async function t3(t:{after(fn:()=>unknown):void},goal?:string){
 const {directory,brief}=setup(goal);const fixture=await startT3Fixture({root:directory});t.after(()=>fixture.close());
 const make=(options: Partial<T3Options> = {})=>{const c=new T3CodeConnector({dataDir:directory,url:fixture.url,token:"secret",pollMs:0,...options});t.after(()=>c.close());return c;};
 return {directory,brief,fixture,make};
}

test("durable connector records dedupe keyed reports and resume from a cursor after restart",()=>{
 const {directory}=setup();type Rec={assignmentId:string;reports:Report[]};
 const a=new DurableRecords<Rec>(directory,"records");const record:Rec={assignmentId:'a',reports:[]};
 a.report(record,{kind:'question',text:'q'},'ask');a.report(record,{kind:'ready',text:'done'},'answer:reply');a.report(record,{kind:'ready',text:'done'},'answer:reply');
 const b=new DurableRecords<Rec>(directory,"records");const restored=b.get('a')!;
 assert.deepEqual(restored.reports.map(r=>r.kind),['question','ready']);
 assert.equal(b.after(restored,restored.reports[1]!.id).length,0);assert.deepEqual(b.after(restored,restored.reports[0]!.id).map(r=>r.kind),['ready']);
});

test("ACP relays a single-use permission before executing a real fixture file write",async(t)=>{
 const {directory,brief}=setup('NEED_PERMISSION');const a=acp(directory,[acpFixture,join(directory,'peer.json')]);t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});const permission=await waitReport(a,ref,'permission');assert.equal(existsSync(join(directory,'artifact.txt')),false);
 await a.respondPermission(ref,permission.id,true);await a.respondPermission(ref,permission.id,true);
 const result=await waitReport(a,ref,'ready');assert.match(result.text,/写入产物/);assert.equal(readFileSync(join(directory,'artifact.txt'),'utf8'),'真实的中文产物');
});

test("ACP permission uses latest settings and cannot bypass delete switch",async(t)=>{
 const {directory,brief}=setup('NEED_PERMISSION DELETE_OPERATION');const a=acp(directory,[acpFixture,join(directory,'peer.json')],{policy:async()=>({permissions:brief.permissions,connectedFolders:[directory]})});t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});const result=await waitReport(a,ref,'ready');assert.match(result.text,/权限拒绝/);assert.equal(existsSync(join(directory,'artifact.txt')),false);assert.equal((await reports(a,ref)).some(r=>r.kind==='permission'),false);
});

test("ACP queues steering, deduplicates input, restores supported sessions and suppresses replayed history",async(t)=>{
 const {directory,brief}=setup('SLOW');const args=[acpFixture,join(directory,'peer.json')];const a=acp(directory,args);t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});await a.send(ref,{inputId:'i1',text:'下一轮'});await a.send(ref,{inputId:'i1',text:'下一轮'});
 await waitReport(a,ref,'ready');for(let i=0;i<80&&(await reports(a,ref)).filter(r=>r.kind==='ready').length<2;i++)await delay(20);
 assert.equal((await reports(a,ref)).filter(r=>r.kind==='ready').length,2);
 await a.close();const b=acp(directory,args);t.after(()=>b.close());assert.equal(await b.reattach(ref),'alive');await b.send(ref,{inputId:'i2',text:'重启后继续'});
 for(let i=0;i<80&&(await reports(b,ref)).filter(r=>r.kind==='ready').length<3;i++)await delay(20);
 assert.equal((await reports(b,ref)).filter(r=>r.kind==='ready').length,3);assert.equal((await reports(b,ref)).some(r=>r.text.includes('old history')),false);
 assert.equal(JSON.parse(readFileSync(join(directory,'peer.json'),'utf8')).prompts,3);
});

test("ACP marks non-loadable sessions lost and rejects bypass-approval modes",async(t)=>{
 const {directory,brief}=setup();const args=[acpFixture,join(directory,'peer.json'),'no-load'];const a=acp(directory,args);t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});await waitReport(a,ref,'ready');await a.close();const b=acp(directory,args);t.after(()=>b.close());assert.equal(await b.reattach(ref),'lost');
 const unsafe=acp(directory,[acpFixture,join(directory,'unsafe.json'),'unsafe'],{id:'acp:unsafe'});t.after(()=>unsafe.close());await assert.rejects(()=>unsafe.start({assignmentId:'unsafe',brief}),/绕过审批/);
});

test("ACP cancellation targets one assignment while another keeps running",async(t)=>{
 const {directory,brief}=setup('SLOW');const a=acp(directory,[acpFixture,join(directory,'peer.json')]);t.after(()=>a.close());
 const first=await a.start({assignmentId:'first',brief});const second=await a.start({assignmentId:'second',brief});
 await a.cancel(first,'只取消 A');await waitReport(a,second,'ready');
 assert.equal((await reports(a,first)).some(r=>r.kind==='ready'),false);assert.equal((await reports(a,second)).some(r=>r.kind==='ready'),true);
 await assert.rejects(()=>a.send(first,{inputId:'after-cancel',text:'继续'}),/取消/);
});

test("ACP a settings change invalidates an outstanding permission before it can execute",async(t)=>{
 const {directory,brief}=setup('NEED_PERMISSION');let files=true;
 const a=acp(directory,[acpFixture,join(directory,'peer.json')],{policy:()=>({permissions:{...brief.permissions,files},connectedFolders:[directory]})});t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});const permission=await waitReport(a,ref,'permission');files=false;
 await assert.rejects(()=>a.respondPermission(ref,permission.id,true),/权限设置拒绝/);
 assert.equal(existsSync(join(directory,'artifact.txt')),false);await a.respondPermission(ref,permission.id,false);await waitReport(a,ref,'ready');
});

test("ACP rejects file writes outside connected folders before asking the user",async(t)=>{
 const {directory,brief}=setup('NEED_PERMISSION');brief.connectedFolders=[];
 const a=acp(directory,[acpFixture,join(directory,'peer.json')]);t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});await waitReport(a,ref,'ready');
 assert.equal(existsSync(join(directory,'artifact.txt')),false);assert.equal((await reports(a,ref)).some(r=>r.kind==='permission'),false);
});

test("ACP opaque commands cannot turn a user approval into a file/network/delete policy bypass",async(t)=>{
 const {directory,brief}=setup('NEED_PERMISSION OPAQUE_COMMAND');
 const a=acp(directory,[acpFixture,join(directory,'peer.json')]);t.after(()=>a.close());
 const ref=await a.start({assignmentId:'a',brief});const result=await waitReport(a,ref,'ready');assert.match(result.text,/权限拒绝/);
 const all=await reports(a,ref);assert.equal(all.some(r=>r.kind==='permission'),false);assert.ok(all.some(r=>r.text.includes('通用命令无法验证权限')));assert.equal(existsSync(join(directory,'artifact.txt')),false);
});



test("T3 over MCP launches once, sends once, keeps one MCP session, matches the result run and stops through interrupt",async(t)=>{
 const {brief,fixture,make}=await t3(t);
 const a=make();assert.equal((await a.status()).available,true);
 const ref=await a.start({assignmentId:'a',brief});await a.start({assignmentId:'a',brief});
 let ready=await waitReport(a,ref,'ready');assert.match(ready.text,/中文结果/);
 assert.equal(fixture.state.initializes,1,"every call reuses the first MCP session");
 assert.match(fixture.state.threads[0]?.thread.title ?? "",/^\[小菜\]/,"the thread names the Bot that sent the work");
 assert.equal(fixture.state.threads[0]?.thread.runtimeMode,"full-access");
 const b=make();assert.deepEqual(await b.start({assignmentId:'a',brief}),ref);assert.equal(await b.reattach(ref),'alive');
 await b.send(ref,{inputId:'i1',text:'补充'});await b.send(ref,{inputId:'i1',text:'补充'});
 ready=await waitReport(b,ref,'ready');assert.equal(ready.text,'补充处理完成');
 assert.equal(fixture.state.launches,1);assert.equal(fixture.state.sends,1);
 const all=await reports(b,ref);assert.equal((await reports(b,ref,all.at(-1)!.id)).length,0);
 await b.cancel(ref,'停止');await b.cancel(ref,'停止');
 assert.equal(fixture.state.interrupts.length,1);assert.equal(fixture.state.interrupts[0]?.clientRequestId,'deepbot:cancel:a');
});

test("T3 sets the MCP session up again after the server drops it",async(t)=>{
 const {fixture,make}=await t3(t);const a=make();
 await a.callTool('t3_project_list',{});fixture.expireSessions();
 assert.ok(await a.callTool('t3_project_list',{}));assert.equal(fixture.state.initializes,2);
});

test("T3 follows a promoted supplement on the active run after its queue run is cancelled", async t => {
 const { brief, fixture, make } = await t3(t, "LONG_RUNNING");
 const connector = make();
 const ref = await connector.start({ assignmentId: "promotion", brief });
 const remote = fixture.state.threads[0]!;
 const active = remote.runs[0]!;
 remote.thread.status = "waiting"; // No provider turn can take steering at this instant.
 const input = { inputId: "supplement", text: "补充验收说明" };
 await connector.send(ref, input);
 const queued = remote.runs[1]!;
 assert.equal(queued.status, "queued");
 const before = await reports(connector, ref);
 remote.thread.status = "running";
 queued.status = "cancelled";
 remote.items.push({ type: "user_message", text: input.text, runId: active.runId, messageId: "message-1" });
 remote.thread.itemCount = remote.items.length;
 // Restart before polling: the acknowledgement and pending message identity must be durable.
 const reopened = make();
 await reopened.send(ref, input);
 const after = await reports(reopened, ref, before.at(-1)!.id);
 assert.ok(!after.some(report => report.kind === "failed"), "cancelling the queue slot does not end the active run");
 assert.ok(before.some(report => report.text.includes("在 T3 Code 排队")));
 assert.ok(after.some(report => report.text.includes("已送达 T3 Code 当前运行")));
 assert.equal(fixture.state.sends, 1);
 Object.assign(remote.thread, { status: "completed", activeRunId: null });
 active.status = "completed";
 remote.items.push({ type: "assistant_message", text: "补充已处理", runId: active.runId });
 assert.equal((await waitReport(reopened, ref, "ready")).text, "补充已处理");
});

test("T3 reports the outcome only after a queued supplement actually runs", async t => {
 const { brief, fixture, make } = await t3(t, "LONG_RUNNING");
 const connector = make();
 const ref = await connector.start({ assignmentId: "queued", brief });
 const remote = fixture.state.threads[0]!;
 remote.thread.status = "waiting";
 await connector.send(ref, { inputId: "pending", text: "后续说明" });
 const [original, queued] = remote.runs;
 assert.ok(original && queued);
 original.status = "completed";
 Object.assign(remote.thread, { status: "queued", activeRunId: null });
 const pending = await reports(connector, ref);
 assert.ok(!pending.some(report => report.kind === "ready" || report.kind === "failed"));

 queued.status = "running";
 Object.assign(remote.thread, { status: "running", activeRunId: queued.runId });
 remote.items.push({ type: "user_message", runId: queued.runId, messageId: "message-1", text: "后续说明" });
 const running = await reports(connector, ref, pending.at(-1)!.id);
 assert.ok(running.some(report => report.text.includes("已送达 T3 Code")));

 queued.status = "failed";
 remote.thread.activeRunId = null;
 const failed = await waitReport(connector, ref, "failed");
 assert.match(failed.text, /执行结束：failed/);
 assert.ok(failed.id.includes(queued.runId));
});

test("T3 reconnect skips a stale failure from a legacy supplement that never started", async t => {
 const { brief, directory, fixture, make } = await t3(t, "LONG_RUNNING");
 const connector = make();
 const ref = await connector.start({ assignmentId: "legacy-queue", brief });
 const remote = fixture.state.threads[0]!;
 const firstRunId = remote.thread.activeRunId!;
 const queueRunId = "legacy-queue-slot";
 remote.thread.latestRunId = queueRunId;
 remote.runs.push({ runId: queueRunId, status: "cancelled", startedAt: null });
 const records = new DurableRecords<{
  assignmentId: string; reports: Report[]; runId: string;
  inputs: { inputId: string; text: string; state: "sent"; runId: string }[];
 }>(directory, "t3code");
 const prior = records.get(ref.id)!;
 prior.runId = queueRunId;
 prior.inputs.push({ inputId: "legacy", text: "原有补充", state: "sent", runId: queueRunId });
 records.report(prior, { kind: "failed", text: "T3 Code 执行结束：cancelled" }, `ended:${queueRunId}:cancelled`);

 const reopened = make();
 const live = await reports(reopened, ref);
 assert.ok(!live.some(report => report.kind === "failed"));
 assert.ok(live.some(report => report.text.includes("送达未确认")));
 assert.equal(records.get(ref.id)?.runId, firstRunId);
});

test("T3 retries dedupe within a thread and allow the same local input ID in another thread", async t => {
 const { brief, fixture, make } = await t3(t, "LONG_RUNNING");
 const connector = make();
 const first = await connector.start({ assignmentId: "first", brief });
 const second = await connector.start({ assignmentId: "second", brief });
 const input = { inputId: "tool-send:21", text: "补充验收" };
 await connector.send(first, input);
 await connector.send(second, input);
 await make().send(second, input);
 assert.equal(fixture.state.sends, 2);
 for (const remote of fixture.state.threads) {
  assert.equal(remote.items.filter(item => item.text === input.text).length, 1);
 }
});

test("T3 without a credential reports the authentication failure",async(t)=>{
 const {directory,fixture}=await t3(t);const a=new T3CodeConnector({dataDir:directory,url:fixture.url});t.after(()=>a.close());
 const status=await a.status();assert.equal(status.available,false);assert.match(status.reason!,/HTTP 401，密钥无效或缺失/);assert.ok(status.dispatch);
});

test("T3 redeems a local pairing link and an MCP code, preserving the granted access", async (t) => {
 const { directory } = setup();
 const plain = "ABCD2345WXYZ";
 const read = "READ-ABCD6789WXYZ";
 const fixture = await startT3Fixture({ root: directory, pairingCodes: { [plain]: "full-access", [read]: "read-only" } });
 t.after(() => fixture.close());
 const connector = new T3CodeConnector({ dataDir: directory, url: fixture.url });
 t.after(() => connector.close());
 const signal = AbortSignal.timeout(5000);
 const link = new URL("/pair", fixture.url);
 link.hostname = "localhost";
 link.hash = new URLSearchParams({ token: plain }).toString();
 const other = new URL(link);
 other.hostname = "outside.example";
 await assert.rejects(connector.configureToken(other.href, signal), /地址不匹配/);
 assert.equal(fixture.state.approvals.length, 0);
 await connector.configureToken(link.href, signal);
 assert.equal((await connector.status()).available, true);
 assert.ok((await connector.status()).dispatch);
 const saved = readFileSync(join(directory, "connectors.json"), "utf8");
 assert.ok(!saved.includes(plain), "only the MCP bearer is persisted");
 await assert.rejects(connector.configureToken(link.href, signal), /配对码已失效/);
 assert.equal(readFileSync(join(directory, "connectors.json"), "utf8"), saved);
 await connector.configureToken(read.toLowerCase(), signal);
 assert.equal((await connector.status()).available, true);
 assert.equal((await connector.status()).dispatch, undefined);
 assert.deepEqual(fixture.state.approvals, ["full-access", "read-only"]);
});

test("T3 reports the old connection's ceiling and requires a grant for full-access launches", async (t) => {
 const {directory,brief}=setup();
 const fixture=await startT3Fixture({root:directory,initialAccess:"approval-required"});t.after(()=>fixture.close());
 const connector=new T3CodeConnector({dataDir:directory,url:fixture.url,token:"secret"});t.after(()=>connector.close());
 assert.deepEqual((await connector.status()).t3,{runtimeMode:"full-access",grantedMode:"approval-required",approvalAvailable:false});
 await assert.rejects(connector.start({assignmentId:"full",brief}),/无法使用完全访问模式/);
 await connector.start({assignmentId:"supervised",brief:{...brief,t3RequireApproval:true}});
 assert.equal(fixture.state.threads[0]?.thread.runtimeMode,"approval-required");
});

test("T3 code mode tools leave out the dispatch tools, which only the dispatch path can use",async(t)=>{
 const {make}=await t3(t);const a=make();
 const names=(await a.tools()).map(x=>x.name);
 assert.ok(names.includes('t3_project_list'));assert.ok(names.includes('t3_thread_read'));
 for(const name of [...T3_DISPATCH_TOOLS,"t3_pending_request"]){assert.ok(!names.includes(name),name);await assert.rejects(a.callTool(name,{}),/事项派活/);}
 assert.equal((await a.status()).tools,names.length);
});

test("T3 pending approval is an external permission report, never a completed result",async(t)=>{
 const {brief,fixture,make}=await t3(t,'WAIT_HUMAN');const a=make();
 const ref=await a.start({assignmentId:'a',brief});const report=await waitReport(a,ref,'permission');assert.equal(report.remoteRequest?.kind,"external");assert.ok(report.externalUrl);
 const peer = fixture.state.threads[0];
 assert.ok(peer?.runs[0]);
 peer.thread.pendingRequestCount=3;
 assert.deepEqual((await reports(a,ref)).filter(r=>r.kind==='permission').map(r=>r.id),[report.id]);
 assert.equal((await reports(a,ref)).some(r=>r.kind==='ready'),false);
 Object.assign(peer.thread,{pendingRequestCount:0,activeRunId:null,status:"running"});peer.runs[0].status="running";
 const all=await reports(a,ref);assert.ok(all.some(entry=>entry.resolvedRequests?.some(resolved=>resolved.reportId===report.id)));
});

test("T3 answers a specific question after restart and replaces a request even when the count stays one",async(t)=>{
 const {brief,fixture,make}=await t3(t,"WAIT_QUESTION");const a=make();
 const ref=await a.start({assignmentId:"a",brief});const first=await waitReport(a,ref,"question");
 assert.equal(first.remoteRequest?.kind,"question");
 const peer = fixture.state.threads[0];
 assert.ok(peer);
 const questions = peer.questions.values().next().value;
 assert.ok(questions);
 peer.questions.clear();
 peer.questions.set("replacement",questions);
 const opened=await reports(a,ref,first.id);const next=opened.find(report=>report.kind==="question")!;
 assert.ok(next);assert.ok(opened.some(report=>report.resolvedRequests?.some(entry=>entry.reportId===first.id)));
 await a.close();const reopened=make();assert.equal(await reopened.reattach(ref),"alive");
 const input={inputId:"answer",value:"开发分支",answers:{branch:["dev"]}};
 assert.deepEqual(await reopened.respondRequest(ref,first.id,input),{value:"T3 Code 已处理"});
 assert.deepEqual(await reopened.respondRequest(ref,next.id,input),{value:"开发分支"});
 await reopened.respondRequest(ref,next.id,input);
 assert.deepEqual(fixture.state.replies,[{action:"respond",threadId:ref.conversationId,requestId:"replacement",answers:{branch:["dev"]}}]);
 await waitReport(reopened,ref,"ready");
});

test("T3 automatically approves only a verified tool call from its own active run", async (t) => {
 const {brief,fixture,make}=await t3(t,"WAIT_HUMAN");
 const connector=make({approvalToken:"approval-fixture",runtimeMode:"approval-required",activePermissions:async()=>brief.permissions});
 const ref=await connector.start({assignmentId:"auto",brief});
 const peer = fixture.state.threads[0];
 assert.ok(peer?.runs[0]);
 const runId = peer.thread.activeRunId;
 assert.ok(runId);
 const nativeItemRef={driver:"codex",nativeId:"tool"};
 const item={id:"item",type:"approval_request" as const,runId,requestId:"need-git",requestKind:"command",nativeItemRef,prompt:"Approve operation"};
 const tool={type:"command_execution" as const,runId,nativeItemRef,input:"/bin/bash -lc 'git status --short'"};
 const projection={thread:{id:ref.conversationId!},runtimeRequests:[{id:item.requestId,kind:"command",status:"pending",responseCapability:{type:"live"}}],turnItems:[item,tool]};
 const own=liveApprovals(projection,new Set([runId]))[0]!;
 assert.equal(await canAutoApprove(own,brief,brief.cwd,brief.permissions),true);
 assert.equal(await canAutoApprove({...own,item:{...item,fullAccessOverride:"ask_rule"}},brief,brief.cwd,brief.permissions),false);
 assert.equal(await canAutoApprove({...own,tool:{...tool,input:"git status; printf done"}},brief,brief.cwd,brief.permissions),false);
 assert.equal(await canAutoApprove({...own,tool:undefined,item:{...item,prompt:"git status"}},brief,brief.cwd,brief.permissions),false);
 assert.equal(await canAutoApprove(own,brief,brief.cwd,{...brief.permissions,files:false}),false);
 assert.equal(liveApprovals(projection,new Set(["other-run"])).length,0);
 t.mock.method(T3ApprovalClient.prototype,"projection",async()=>projection);
 const respond=t.mock.method(T3ApprovalClient.prototype,"respond",async()=>{
   projection.runtimeRequests[0]!.status="resolved";
   Object.assign(peer.thread,{pendingRequestCount:0,activeRunId:null,status:"completed"});
   const run = peer.runs[0];
   assert.ok(run);
   run.status = "completed";
 });
 await waitReport(connector,ref,"ready");
 assert.ok((await reports(connector,ref)).some(report=>report.botApproved));
 assert.ok(!(await reports(connector,ref)).some(report=>report.remoteRequest));
 assert.deepEqual(respond.mock.calls.map(call=>call.arguments),[[ref.conversationId,"need-git","deepbot:auto:auto:need-git","accept"]]);
});

test("T3 attaches approval to the exact pending request and waits for a human when required", async (t) => {
 const {brief,fixture,make}=await t3(t,"WAIT_HUMAN");
 const connector=make({approvalToken:"approval-fixture",activePermissions:async()=>brief.permissions});
 const ref=await connector.start({assignmentId:"manual",brief:{...brief,t3RequireApproval:true}});
 const runId = fixture.state.threads[0]?.thread.activeRunId;
 assert.ok(runId);
 const request={id:"approved-by-user",kind:"command",status:"pending",responseCapability:{type:"live"}};
 const nativeItemRef={driver:"codex",nativeId:"tool"};
 t.mock.method(T3ApprovalClient.prototype,"projection",async()=>({thread:{id:ref.conversationId!},runtimeRequests:[request],turnItems:[
   {id:"one",type:"approval_request" as const,runId,requestId:request.id,requestKind:"command",nativeItemRef},
   {type:"command_execution" as const,runId,nativeItemRef,input:"git status"},
 ]}));
 const respond=t.mock.method(T3ApprovalClient.prototype,"respond",async()=>{request.status="resolved";});
 const card=await waitReport(connector,ref,"permission");
 assert.equal(card.remoteRequest?.kind,"approval");assert.equal(respond.mock.callCount(),0);
 const input={inputId:"user-click",value:"拒绝"};
 await assert.rejects(connector.respondRequest({...ref,conversationId:"wrong-thread"},card.id,input),/派工记录不存在/);
 assert.deepEqual(await connector.respondRequest(ref,card.id,input),{value:"拒绝"});
 await connector.respondRequest(ref,card.id,input);
 assert.deepEqual(respond.mock.calls.map(call=>call.arguments),[[ref.conversationId,request.id,"deepbot:reply:user-click","decline"]]);
});

test("T3 settle check uses the current run, not an earlier ready report",async(t)=>{
 const {brief,fixture,make}=await t3(t);const a=make();
 const ref=await a.start({assignmentId:'a',brief});await waitReport(a,ref,'ready');assert.equal(await a.isSettled(ref),true);
 await a.send(ref,{inputId:'next',text:'LONG_RUNNING second turn'});assert.equal(await a.isSettled(ref),false);
 assert.ok((await reports(a,ref)).some(r=>r.kind==='ready'),'the old ready remains in history');
 assert.equal(await a.isSettled(ref),false,'old ready must not release cancellation/reassignment');
 const thread = fixture.state.threads[0]?.thread;
 assert.ok(thread);
 Object.assign(thread,{status:'completed',activeRunId:null});assert.equal(await a.isSettled(ref),true);
 thread.pendingRequestCount=1;assert.equal(await a.isSettled(ref),false);
});

test("T3 refuses a folder that is not a T3 project and names the tool that registers it",async(t)=>{
 const {brief,make}=await t3(t);const a=make();
 const outside=mkdtempSync(join(tmpdir(),"deepbot-not-project-"));
 await assert.rejects(a.start({assignmentId:'b',brief:{...brief,cwd:outside}}),/t3_project_create/);
});

test("a stdio MCP connector lists and calls tools over one server process",async(t)=>{
 const {directory}=setup();const starts=join(directory,'starts.txt');
 const c=new McpToolConnector({id:'local',name:'本地工具',command:process.execPath,args:[stdioFixture,starts]});t.after(()=>c.close());
 assert.deepEqual((await c.tools()).map(x=>x.name),['echo','fail']);
 assert.equal(await c.callTool('echo',{text:'你好'}),'回声：你好');assert.equal(await c.callTool('echo',{text:'再来'}),'回声：再来');
 await assert.rejects(c.callTool('fail',{}),/故意失败/);
 assert.equal(readFileSync(starts,'utf8'),'start\n');
 const status=await c.status();assert.equal(status.available,true);assert.equal(status.tools,2);assert.equal(status.dispatch,undefined,"user MCP connectors give tools only");
});

test("connectors.json gives user MCP and ACP connectors; T3 settings come from the environment first",()=>{
 const {directory}=setup();
 writeFileSync(join(directory,'connectors.json'),JSON.stringify({t3:{url:'http://127.0.0.1:1/mcp',token:'file'},mcp:[{id:'github',url:'https://example.com/mcp'}],acp:[{id:'hermes',name:'Hermes',command:'hermes',args:['acp']}]}));
 const config=readConnectorsConfig(directory,{DEEPBOT_T3_TOKEN:'env'});
 assert.equal(config.t3.token,'env');assert.equal(config.t3.url,'http://127.0.0.1:1/mcp');
 assert.deepEqual(config.mcp.map(x=>[x.id,x.name]),[['github','github']]);assert.deepEqual(config.acp.map(x=>x.id),['acp:hermes']);
 writeFileSync(join(directory,'connectors.json'),JSON.stringify({mcp:[{id:'t3code',url:'https://example.com'}]}));
 assert.throws(()=>readConnectorsConfig(directory,{}),/id 无效或重复/);
 writeFileSync(join(directory,'connectors.json'),JSON.stringify({}));
 assert.deepEqual(readConnectorsConfig(directory,{DEEPBOT_ACP_COMMAND:'hermes'}).acp.map(x=>x.id),['acp:hermes'],"the old single-ACP variables still work");
 const installed=join(directory,'tools','codex-acp','node_modules','.bin');mkdirSync(installed,{recursive:true});writeFileSync(join(installed,'codex-acp'),'');
 assert.deepEqual(readConnectorsConfig(directory,{}).acp.map(x=>x.id),['acp:codex']);
});
