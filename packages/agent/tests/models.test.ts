import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ModelSettings } from "../src/runtime/model-config.ts";
import { createModelRuntime } from "../src/runtime/models.ts";
import { DeepBotApp } from "../src/runtime/app.ts";
import type { AgentMessage, ModelConfig } from "../src/protocol.ts";

async function fixture() {
 const dir = await mkdtemp(join(tmpdir(), "deepbot-models-"));
 const requests: { url: string; key: string; model: string }[] = [];
 const imageRequests: { model: string; urls: string[] }[] = [];
 const server = createServer(async (req, res) => {
  if (req.method === "GET") {
   requests.push({ url: req.url!, key: req.headers.authorization!, model: "" });
   if (req.url?.startsWith("/denied")) { res.writeHead(401); res.end("private-remote-error-and-key"); return; }
   if (req.url?.startsWith("/slow")) await new Promise(resolve => setTimeout(resolve, 150));
   res.writeHead(200, { "Content-Type": "application/json" });
   res.end(JSON.stringify({ data: [{ id: "beta" }, { id: "alpha" }, { id: "alpha" }] })); return;
  }
  let body = ""; for await (const chunk of req) body += chunk;
  const input = JSON.parse(body); requests.push({ url: req.url!, key: req.headers.authorization!, model: input.model });
  const userContent = input.messages.findLast((message: { role: string }) => message.role === "user")?.content;
  const urls = Array.isArray(userContent) ? userContent.filter(part => part.type === "image_url").map(part => part.image_url.url) : [];
  if (urls.length) imageRequests.push({ model: input.model, urls });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify({ id: "response", object: "chat.completion.chunk", model: input.model, choices: [{ index: 0, delta: { role: "assistant", content: "端点回复" }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: "response", object: "chat.completion.chunk", model: input.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
 });
 await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
 const address = server.address() as { port: number };
 const base = `http://127.0.0.1:${address.port}`;
 const path = join(dir, ".deepbot", "models.json");
 const open = (overrides: NodeJS.ProcessEnv = {}) => ModelSettings.open({ path, env: { DEEPBOT_PROVIDER: "openai", DEEPBOT_MODEL: "shared", DEEPBOT_API: "openai-completions", DEEPBOT_BASE_URL: `${base}/first`, DEEPBOT_API_KEY: "first-private-key", DEEPBOT_USE_CODEX_AUTH: "0", ...overrides }, legacyConfigPath: join(dir, "missing-config.json"), loadDotEnv: false });
 return { dir, path, base, open, requests, imageRequests, cleanup: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); } };
}
const second = (base: string): Omit<ModelConfig, "hasApiKey"> => ({ id: "second", name: "第二份配置", provider: "openai", model: "shared", api: "openai-completions", baseUrl: `${base}/second`, apiKeyEnv: "", useCodexAuth: false });
async function eventually(check: () => Promise<boolean>) {
 const end = Date.now() + 5000;
 while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 15)); }
 throw new Error("模型响应超时");
}

test("legacy gateway IDs and declared image models reach the selected Bot endpoint after reload", async () => {
 const f = await fixture();
 const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP438AAAAQBAYDFKhhdAAAAAElFTkSuQmCC";
 const send = { type: "message.send-images", botId: "xiaocai", threadId: "dm:xiaocai", text: "", images: [{ name: "fixture.png", data }] } as const;
 const openApp = async () => {
  const settings = await f.open();
  return DeepBotApp.open({ dataDir: f.dir, modelSettings: settings, models: settings.models, provider: "openai", modelId: "shared", debounceMs: 0, tickMs: 20 });
 };
 let app: DeepBotApp | undefined;
 try {
  const settings = await f.open();
  const gateway = { ...second(f.base), provider: "custom" };
  await settings.apply({ type: "model.upsert", requestId: "known", config: { ...gateway, id: "default", model: "gpt-4o" }, apiKey: "fixture-key" }, []);
  await settings.apply({ type: "model.upsert", requestId: "opaque", config: { ...gateway, model: "fixture-vision" }, apiKey: "fixture-key" }, []);
  await settings.apply({ type: "model.upsert", requestId: "text", config: { ...gateway, id: "text", model: "gpt-4" }, apiKey: "fixture-key" }, []);
  app = await openApp();
  assert.equal((await app.ledger()).data.modelConfigs.find(c => c.id === "default")?.inputMode, undefined);
  const imageCommand = { ...send, images: [...send.images] };
  await app.command({ ...imageCommand, requestId: "known-image" });
  await eventually(async () => (await app!.ledger()).data.messages.some(m => m.text === "端点回复"));
  await app.command({ type: "bot.upsert", requestId: "pick-opaque", bot: { id: "xiaocai", name: "小菜", modelConfigId: "second" } });
  await assert.rejects(app.command({ ...imageCommand, requestId: "unknown-input" }), /无法识别.*图片能力/);
  await app.command({ type: "model.upsert", requestId: "enable-images", config: { id: "second", inputMode: "image" } });
  await app.close(); app = await openApp();
  const ledger = (await app.ledger()).data;
  assert.equal(ledger.modelConfigs.find(c => c.id === "second")?.inputMode, "image");
  assert.equal(ledger.bots.find(b => b.id === "xiaocai")?.modelConfigId, "second");
  await app.command({ ...imageCommand, requestId: "declared-image" });
  await eventually(async () => (await app!.ledger()).data.messages.filter(m => m.text === "端点回复").length === 2);
  assert.deepEqual(f.imageRequests, ["gpt-4o", "fixture-vision"].map(model => ({ model, urls: [`data:image/png;base64,${data}`] })));
  await app.command({ type: "model.upsert", requestId: "back-to-auto", config: { id: "second", inputMode: "auto" } });
  await assert.rejects(app.command({ ...imageCommand, requestId: "auto-input" }), /无法识别.*图片能力/);
  await app.command({ type: "bot.upsert", requestId: "pick-text", bot: { id: "xiaocai", name: "小菜", modelConfigId: "text" } });
  await assert.rejects(app.command({ ...imageCommand, requestId: "text-only" }), /模型不支持图片输入/);
  assert.equal((await app.ledger()).data.messages.filter(m => m.author.kind === "person").length, 2);
  assert.equal(f.requests.length, 2);
 } finally { await app?.close(); await f.cleanup(); }
});

test("Pi configurations isolate identical provider/model endpoints and keys, persist edits and redact views", async () => {
 const f = await fixture();
 try {
  let settings = await f.open();
  const cmd = { type: "model.upsert" as const, requestId: "add", config: second(f.base), apiKey: "second-private-key" };
  await settings.apply(cmd, []); await settings.apply(cmd, []);
  await assert.rejects(settings.apply({ ...cmd, apiKey: "changed" }, []), /requestId/);
  for (const id of ["default", "second"]) {
   const model = settings.models.getModel(settings.providerId(id), "shared")!;
   const response = await settings.models.completeSimple(model, { messages: [{ role: "user", content: "hello", timestamp: Date.now() }] });
   assert.equal(response.stopReason, "stop", response.errorMessage);
  }
  assert.deepEqual(f.requests, [{ url: "/first/chat/completions", key: "Bearer first-private-key", model: "shared" }, { url: "/second/chat/completions", key: "Bearer second-private-key", model: "shared" }]);
  await settings.apply({ type: "model.upsert", requestId: "edit", config: { ...second(f.base), baseUrl: `${f.base}/edited` }, apiKey: "" }, []);
  await settings.apply({ type: "model.upsert", requestId: "rename", config: { id: "second", name: "重命名配置" } }, []);
  await settings.apply({ type: "model.upsert", requestId: "model-change", config: { id: "second", model: "shared" } }, []);
  assert.equal(settings.view().modelConfigs.find(c => c.id === "second")!.name, "重命名配置");
  await settings.apply({ type: "model.default", requestId: "default", modelConfigId: "second" }, []);
  settings = await f.open({ DEEPBOT_API: "retired-api", DEEPBOT_MODEL: "retired-model" }); // Old launch env must not override the persisted settings.
  assert.equal(settings.view().defaultModelConfigId, "second");
  const model = settings.models.getModel(settings.providerId("second"), "shared")!;
  const response = await settings.models.completeSimple(model, { messages: [{ role: "user", content: "again", timestamp: Date.now() }] });
  assert.equal(response.stopReason, "stop", response.errorMessage);
  assert.deepEqual(f.requests.at(-1), { url: "/edited/chat/completions", key: "Bearer second-private-key", model: "shared" });
  assert.doesNotMatch(JSON.stringify(settings.view()), /private-key/);
  assert.match(await readFile(f.path, "utf8"), /second-private-key/);
  assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  const before = await readFile(f.path, "utf8");
  await assert.rejects(settings.apply({ ...cmd, requestId: "invalid", config: { ...cmd.config, baseUrl: "not-a-url" } }, []), /地址/);
  await assert.rejects(settings.apply({ type: "model.delete", requestId: "delete-default", modelConfigId: "second" }, []), /默认/);
  await assert.rejects(settings.apply({ type: "model.delete", requestId: "delete-used", modelConfigId: "default" }, ["default"]), /使用/);
  assert.equal(await readFile(f.path, "utf8"), before);
 } finally { await f.cleanup(); }
});

test("batch model creation persists every profile together and replays without duplicates", async () => {
 const f = await fixture();
 try {
  let settings = await f.open();
  const { name: _name, model: _model, ...config } = second(f.base);
  const cmd = { type: "model.add-many" as const, requestId: "batch", config, models: ["vendor/alpha", "vendor/beta"], apiKey: "batch-private-key" };
  await settings.apply({ type: "model.upsert", requestId: "existing", config: { ...second(f.base), id: "occupied-2" } }, []);
  const before = await readFile(f.path, "utf8");
  await assert.rejects(settings.apply({ ...cmd, requestId: "invalid", models: ["vendor/alpha", " "] }, []), /有效模型/);
  await assert.rejects(settings.apply({ ...cmd, requestId: "duplicate", models: ["vendor/alpha", " vendor/alpha "] }, []), /重复/);
  await assert.rejects(settings.apply({ ...cmd, requestId: "collision", config: { ...config, id: "occupied" } }, []), /编号已存在/);
  assert.equal(await readFile(f.path, "utf8"), before);
  assert.ok(!settings.models.getProvider(settings.providerId("occupied-1")));
  await settings.apply(cmd, []);
  settings = await f.open();
  await settings.apply(cmd, []);
  await assert.rejects(settings.apply({ ...cmd, models: ["vendor/alpha", "vendor/other"] }, []), /requestId/);
  assert.equal(settings.view().defaultModelConfigId, "default");
  assert.deepEqual(settings.view().modelConfigs.map(c => c.id), ["default", "occupied-2", "second-1", "second-2"]);
  for (const [index, model] of cmd.models.entries()) {
   const id = `second-${index + 1}`;
   assert.deepEqual(settings.view().modelConfigs.find(c => c.id === id), { ...config, id, name: model, model, hasApiKey: true });
   assert.equal((await settings.inspect("model.test", { id }, undefined, AbortSignal.timeout(5000))).ok, true);
   assert.deepEqual(f.requests.at(-1), { url: "/second/chat/completions", key: "Bearer batch-private-key", model });
  }
  assert.doesNotMatch(JSON.stringify(settings.view()), /batch-private-key/);
 } finally { await f.cleanup(); }
});

test("model deletion protects default, Bot and active assignment references, then persists an unused deletion", async () => {
 const f = await fixture(); let app: DeepBotApp | undefined;
 const open = async () => {
  const settings = await f.open();
  return DeepBotApp.open({ dataDir: f.dir, modelSettings: settings, models: settings.models, provider: "openai", modelId: "shared", tickMs: 20 });
 };
 try {
  app = await open();
  await app.command({ type: "model.upsert", requestId: "add", config: second(f.base) });
  const remove = { type: "model.delete", requestId: "delete", modelConfigId: "default" } as const;
  const beforeDefault = await readFile(f.path, "utf8");
  await assert.rejects(app.command(remove), /先将其他模型设为默认/);
  assert.equal(await readFile(f.path, "utf8"), beforeDefault);
  await app.command({ type: "model.default", requestId: "default", modelConfigId: "second" });
  const beforeUsed = await readFile(f.path, "utf8");
  await assert.rejects(app.command(remove), /右侧「配置」中切换模型/);
  assert.equal((await app.ledger()).data.bots[0]!.modelConfigId, "default");
  assert.equal(await readFile(f.path, "utf8"), beforeUsed);
  await app.command({ type: "bot.upsert", requestId: "switch", bot: { id: "xiaocai", name: "小菜", modelConfigId: "second" } });
  await app.mutate(l => {
   const bot = l.data.bots[0]!;
   l.data.assignments.push({
    id: "active", workId: "work", assignee: "self", state: "pending", attempt: 1, inputIds: [], createdAt: 1,
    brief: {
     modelConfigId: "default", workId: "work", botId: bot.id, botName: bot.name, threadId: bot.threadId,
     goal: "模型配置引用", criteria: [], scope: "", cwd: f.dir, instructions: "", model: "shared",
     provider: "openai", permissions: l.data.settings.permissions, connectedFolders: [], context: "",
    },
   });
  });
  await assert.rejects(app.command(remove), /结束.*运行事项/);
  assert.equal(await readFile(f.path, "utf8"), beforeUsed);
  await app.mutate(l => { l.data.assignments = []; });
  await app.command(remove); await app.command(remove);
  assert.deepEqual((await app.ledger()).data.modelConfigs.map(c => c.id), ["second"]);
  await app.close(); app = await open();
  assert.deepEqual((await app.ledger()).data.modelConfigs.map(c => c.id), ["second"]);
  assert.equal((await app.ledger()).data.defaultModelConfigId, "second");
  assert.equal((await app.ledger()).data.bots[0]!.modelConfigId, "second");
 } finally { await app?.close(); await f.cleanup(); }
});

test("Bot default, explicit selection, shared model edits and legacy migration survive actual ledger restart", async () => {
 const f = await fixture(); let app: DeepBotApp | undefined;
 const events: AgentMessage[] = [];
 const open = async () => {
  const settings = await f.open();
  return DeepBotApp.open({ dataDir: f.dir, modelSettings: settings, models: settings.models, provider: "openai", modelId: "shared", debounceMs: 0, tickMs: 20, emit: e => events.push(e) });
 };
 try {
  app = await open();
  await app.command({ type: "model.upsert", requestId: "add", config: second(f.base), apiKey: "second-private-key" });
  await app.command({ type: "model.default", requestId: "default", modelConfigId: "second" });
  await app.command({ type: "bot.upsert", requestId: "create", bot: { id: "new", name: "默认 Bot" } });
  await app.command({ type: "bot.upsert", requestId: "create-explicit", bot: { id: "explicit", name: "指定 Bot", modelConfigId: "default" } });
  await assert.rejects(app.command({ type: "bot.upsert", requestId: "invalid-bot", bot: { id: "bad", name: "无效", modelConfigId: "missing" } }), /不存在/);
  assert.deepEqual((await app.ledger()).data.bots.map(b => b.modelConfigId), ["default", "second", "default"]);
  await app.mutate(l => { l.data.typing["dm:xiaocai"] = true; });
  const originalConfig = (await app.ledger()).data.modelConfigs.find(c => c.id === "default")!;
  await assert.rejects(app.command({ type: "model.upsert", requestId: "busy-edit", config: { ...originalConfig, name: "运行中不可修改" } }), /正在运行/);
  await app.mutate(l => { l.data.typing["dm:xiaocai"] = false; });
  await app.command({ type: "model.upsert", requestId: "edit", config: { ...second(f.base), baseUrl: `${f.base}/edited` } });
  await app.command({ type: "message.send", requestId: "message", botId: "new", threadId: "dm:new", text: "验证实际端点" });
  await eventually(async () => (await app!.ledger()).data.messages.some(m => m.author.id === "new" && m.text === "端点回复"));
  assert.deepEqual(f.requests.at(-1), { url: "/edited/chat/completions", key: "Bearer second-private-key", model: "shared" });
  const work = await app.createWork("new", { title: "验证内部执行", goal: "仅回复", criteria: ["模型回复"] }, "self-check");
  await eventually(async () => (await app!.ledger()).reports.some(r => r.kind === "ready"));
  const assignment = (await app.ledger()).data.assignments.find(a => a.workId === work.id)!;
  assert.equal(assignment.brief.modelConfigId, "second");
  assert.ok(f.requests.filter(r => r.url === "/edited/chat/completions").length >= 2);
  await app.command({ type: "work.cancel", requestId: "cancel-work", workId: work.id });
  // Simulate a pre-extraction ledger without replacing any existing conversation.
  const thread = (await app.ledger()).data.threads[0]!.conversationId;
  await app.mutate(l => {
   const [bot, ...others] = l.data.bots;
   assert.ok(bot);
   const { modelConfigId: _modelConfigId, ...profile } = bot;
   Object.assign(l.data, { bots: [{ ...profile, provider: "openai", model: "legacy-model" }, ...others] });
  });
  await app.close(); app = await open();
  const state = (await app.ledger()).data;
  assert.equal(state.defaultModelConfigId, "second");
  assert.equal(state.bots.find(b => b.id === "new")!.modelConfigId, "second");
  const legacy = state.bots[0]!;
  assert.equal(state.modelConfigs.find(c => c.id === legacy.modelConfigId)!.model, "legacy-model");
  assert.ok(!("provider" in legacy) && !("model" in legacy));
  assert.equal(state.threads[0]!.conversationId, thread);
  assert.doesNotMatch(JSON.stringify(await app.ledger()), /private-key/);
  assert.doesNotMatch(JSON.stringify(events), /private-key/);
  await app.command({ type: "model.upsert", requestId: "add", config: second(f.base), apiKey: "second-private-key" }); // Replay cannot roll back the later edit.
  assert.equal((await app.ledger()).data.modelConfigs.find(c => c.id === "second")!.baseUrl, `${f.base}/edited`);
 } finally { await app?.close(); await f.cleanup(); }
});


test("Magpie uses local gateway auth without inheriting other providers' keys", async () => {
 const f = await fixture();
 const env = { OPENAI_API_KEY: "unrelated-openai-key", MAGPIE_API_KEY: "magpie-env-key" };
 try {
  let settings = await f.open(env);
  const config = { ...second(f.base), id: "default", provider: "magpie", model: "vendor/model", baseUrl: `${f.base}/v1` };
  const signal = AbortSignal.timeout(5000);
  assert.deepEqual((await settings.inspect("model.list", config, undefined, signal)).models, ["alpha", "beta"]);
  assert.deepEqual(f.requests.at(-1), { url: "/v1/models", key: "Bearer magpie-deepbot", model: "" });
  assert.equal((await settings.inspect("model.test", config, "magpie-explicit-key", signal)).ok, true);
  assert.deepEqual(f.requests.at(-1), { url: "/v1/chat/completions", key: "Bearer magpie-explicit-key", model: "vendor/model" });
  await settings.apply({ type: "model.upsert", requestId: "magpie", config }, []);
  settings = await f.open(env);
  assert.match(await readFile(f.path, "utf8"), /"provider": "magpie"/);
  assert.equal(settings.view().modelConfigs[0]!.hasApiKey, false);
  assert.equal((await settings.inspect("model.test", { id: "default" }, undefined, signal)).ok, true);
  assert.deepEqual(f.requests.at(-1), { url: "/v1/chat/completions", key: "Bearer magpie-deepbot", model: "vendor/model" });
  const remote = { ...config, baseUrl: "https://magpie.example/v1" };
  assert.equal((await createModelRuntime({ env, config: remote, loadDotEnv: false })).configured, false);
  assert.equal((await createModelRuntime({ env, config: { ...remote, apiKeyEnv: "MAGPIE_API_KEY" }, loadDotEnv: false })).configured, true);
 } finally { await f.cleanup(); }
});

test("model discovery and connection tests use the unsaved draft without writing profiles or the ledger", async () => {
 const f = await fixture(); let app: DeepBotApp | undefined;
 try {
  const settings = await f.open();
  const before = await readFile(f.path, "utf8");
  const draft = { ...second(f.base), baseUrl: `${f.base}/draft`, model: "draft-model" };
  const listed = await settings.inspect("model.list", draft, "draft-private-key", AbortSignal.timeout(1000));
  assert.deepEqual(listed.models, ["alpha", "beta"]);
  assert.deepEqual(f.requests.at(-1), { url: "/draft/models", key: "Bearer draft-private-key", model: "" });
  const tested = await settings.inspect("model.test", draft, "draft-private-key", AbortSignal.timeout(1000));
  assert.equal(tested.ok, true);
  assert.deepEqual(f.requests.at(-1), { url: "/draft/chat/completions", key: "Bearer draft-private-key", model: "draft-model" });
  const savedKey = await settings.inspect("model.list", { id: "default" }, undefined, AbortSignal.timeout(1000));
  assert.equal(savedKey.ok, true);
  assert.equal(f.requests.at(-1)!.key, "Bearer first-private-key");
  await assert.rejects(settings.inspect("model.list", { ...draft, api: "anthropic-messages", baseUrl: `${f.base}/denied` }, undefined, AbortSignal.timeout(1000)), /HTTP 401/);
  assert.equal(f.requests.at(-1)!.url, "/denied/v1/models");
  assert.equal(await readFile(f.path, "utf8"), before);
  assert.ok(!settings.models.getProvider(settings.providerId("second")));
  const events: AgentMessage[] = [];
  app = await DeepBotApp.open({ dataDir: f.dir, modelSettings: settings, models: settings.models, provider: "openai", modelId: "shared", debounceMs: 0, tickMs: 20, emit: e => events.push(e) });
  const query = { type: "model.list", requestId: "slow-list", config: { ...draft, baseUrl: `${f.base}/slow` }, apiKey: "draft-private-key" };
  await app.command(query); await app.command(query);
  await assert.rejects(app.command({ ...query, config: { ...draft, baseUrl: `${f.base}/changed` } }), /requestId/);
  await assert.rejects(app.command({ type: "message.send", requestId: "slow-list", botId: "xiaocai", threadId: "dm:xiaocai", text: "冲突请求" }), /requestId/);
  assert.equal(events.filter(e => e.type === "model.result").length, 0); // Reader stays free while the endpoint is slow.
  await app.command({ type: "message.send", requestId: "during-query", botId: "xiaocai", threadId: "dm:xiaocai", text: "继续聊天" });
  assert.ok((await app.ledger()).data.messages.some(m => m.requestId === "during-query"));
  await eventually(async () => events.some(e => e.type === "model.result" && e.requestId === "slow-list"));
  assert.equal(f.requests.filter(r => r.url === "/slow/models").length, 1);
  assert.equal(await readFile(f.path, "utf8"), before);
  assert.doesNotMatch(JSON.stringify(events), /private-key|private-remote-error/);
  assert.doesNotMatch(JSON.stringify(await app.ledger()), /draft-private-key/);
 } finally { await app?.close(); await f.cleanup(); }
});
