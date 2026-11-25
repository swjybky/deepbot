import { expect, open, test } from "nsh/test";
const desktop = { width: 1280, height: 800, platform: "linux" } as const;
const commands = (app: { storage(): Record<string, string> }): Record<string, unknown>[] => JSON.parse(app.storage().commands ?? "[]");

test("projects real protocol state and keeps IM sending while work is running", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 expect(app.shows("id:bot-typing")).toBe(true);
 await app.type("id:composer-input", "第一条"); await app.submit("id:composer-input");
 await app.type("id:composer-input", "第二条"); await app.press("id:composer-send");
 const sends = commands(app).filter((c) => c.type === "message.send");
 expect(sends).toHaveLength(2);
 const [first, second] = sends;
 if (!first || !second) throw new Error("Missing either send command");
 expect(first).toMatchObject({ botId: "xiaocai", threadId: "dm:xiaocai", text: "第一条" });
 expect(first.requestId).not.toBe(second.requestId);
 expect(app.shows("text:第二条")).toBe(true);
});

test("keeps pasted multiline drafts across bot switches and preserves newlines on submit", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 const input = "id:composer-input";
 await app.waitFor("id:bot-other");
 await app.paste(input, { text: "第一行\n第二行" });
 expect(app.value(input)).toBe("第一行\n第二行");
 expect(commands(app).filter((c) => c.type === "message.send")).toHaveLength(0);

 await app.press("id:bot-other");
 expect(app.value(input)).toBe("");
 await app.type(input, "另一个草稿");
 await app.press("id:bot-xiaocai");
 expect(app.value(input)).toBe("第一行\n第二行");
 await app.submit(input);
 expect(commands(app).find((c) => c.type === "message.send")).toMatchObject({
  botId: "xiaocai", text: "第一行\n第二行",
 });
 expect(app.value(input)).toBe("");
 await app.press("id:bot-other");
 expect(app.value(input)).toBe("另一个草稿");
});

test("rejects a non-image attachment with the supported formats and keeps the draft", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 const input = "id:composer-input";
 await app.waitFor("id:message-m1");
 await app.paste(input, { text: "保留\n两行" });
 app.onPick(() => [{ name: "note.txt", type: "text/plain", data: new Uint8Array([65]) }]);
 expect(app.shows("label:添加附件")).toBe(true);
 await app.press("id:composer-add-attachment");
 await app.waitFor("text:/当前附件仅支持 PNG、JPEG、WebP 图片/");
 expect(app.shows("id:composer-images")).toBe(false);
 expect(app.value(input)).toBe("保留\n两行");
});

test("ignores a malformed Agent event and continues receiving valid messages", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [null] });
 await app.host.send("agent", {
  type: "thread.delta", threadId: "dm:xiaocai", typing: false,
  messages: [{
   id: "valid-after-malformed", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" },
   kind: "text", text: "后续消息仍会显示", createdAt: 2, requestId: "fixture-valid",
  }],
 });
 await app.waitFor("id:message-valid-after-malformed");
 expect(app.shows("text:后续消息仍会显示")).toBe(true);
});

test("shows a title for work deliveries without labeling ordinary chat", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 const base = { threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, text: "已完成", createdAt: 2 };
 await app.host.send("agent", { type: "thread.delta", threadId: base.threadId, typing: false, messages: [
  { ...base, id: "delivery-new", requestId: "delivery:new", kind: "result", workId: "work-image", workTitle: "修复图片粘贴与发送" },
  { ...base, id: "delivery-legacy", requestId: "delivery:legacy", kind: "result", workId: "w1" },
  { ...base, id: "report-legacy", requestId: "say:legacy", kind: "text", workId: "w1" },
  { ...base, id: "delivery-missing", requestId: "delivery:missing", kind: "result", workId: "work-missing" },
  { ...base, id: "ordinary", requestId: "ordinary", kind: "text" },
  { ...base, id: "work-ack", requestId: "work-ack:w1", kind: "text", workId: "w1" },
 ] });
 await app.waitFor("id:message-work-title-delivery-new");
 expect(app.shows("id:message-content-delivery-new >> text:事项 · 修复图片粘贴与发送")).toBe(true);
 expect(app.shows("id:message-content-delivery-legacy >> text:事项 · 整理资料")).toBe(true);
 expect(app.shows("id:message-work-title-report-legacy")).toBe(true);
 for (const id of ["m1", "delivery-missing", "ordinary", "work-ack"]) {
  expect(app.shows(`id:message-work-title-${id}`)).toBe(false);
 }
 expect(app.texts()).not.toContain("work-image");
 expect(app.texts()).not.toContain("work-missing");
 await app.hover("id:message-content-delivery-new");
 await app.press("id:reply-delivery-new");
 await app.type("id:composer-input", "补充验收结果");
 await app.submit("id:composer-input");
 expect(commands(app).find(c => c.type === "message.send")).toMatchObject({ replyTo: "delivery-new", workId: "work-image" });
});

test("works stay out of the chat and are opened, inspected and stopped from the info panel", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 expect(app.shows("text:正在读取")).toBe(false);
 await app.hover("id:message-content-m1");
 await app.press("id:reply-m1"); await app.type("id:composer-input", "补充要求"); await app.submit("id:composer-input");
 expect(commands(app).find((c) => c.type === "message.send")).toMatchObject({ replyTo: "m1", workId: "w1" });
 await app.press("id:bot-pill"); await app.waitFor("id:work-w1");
 expect(app.count("id:work-w1")).toBe(1);
 await app.press("label:查看事项 整理资料，执行中"); await app.waitFor("id:work-detail-w1");
 expect(app.shows("text:/有结果/")).toBe(true);
 expect(app.shows("text:Bot 自己")).toBe(true);
 expect(app.texts()).toContain("/tmp/deepbot-project");
 expect(app.shows("label:改派 整理资料")).toBe(true);
 await app.press("id:cancel-work-w1");
 expect(commands(app).find((c) => c.type === "work.cancel")).toMatchObject({ workId: "w1" });
 await app.waitFor("text:已取消");
 expect(app.count("id:cancel-work-w1")).toBe(0);
 expect(app.shows("label:改派 整理资料")).toBe(false);
 await app.press("id:work-detail-dialog >> label:关闭");
 await app.waitFor("label:展开已结束");
 expect(app.shows("id:work-w1")).toBe(false);
 await app.press("id:works-ended-toggle");
 await app.waitFor("id:works-ended >> id:work-w1");
 expect(app.shows("id:work-detail-w1")).toBe(false);
});

test("message reply icons appear on hover and stay clickable until leaving the message", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [{ id: "m2", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text: "资料已整理", createdAt: 2, requestId: "fixture-m2", workId: "w1" }] });
 for (const id of ["m1", "m2"]) {
  expect(app.shows(`id:reply-${id}`)).toBe(false);
  await app.hover(`id:message-content-${id}`);
  await app.waitFor(`id:reply-${id}`);
  expect(app.shows(`id:reply-${id}`)).toBe(true);
  expect(app.shows("text:回复")).toBe(false);
  expect(app.shows(`id:reply-${id === "m1" ? "m2" : "m1"}`)).toBe(false);
  await app.hover(`id:reply-${id}`);
  expect(app.shows(`id:reply-${id}`)).toBe(true);
  await app.press(`id:reply-${id}`);
  expect(app.shows(id === "m1" ? "text:回复：整理资料" : "text:回复：资料已整理")).toBe(true);
  await app.hover("id:composer-input");
  await app.waitFor(`id:reply-${id}`, { state: "gone" });
  expect(app.shows(`id:reply-${id}`)).toBe(false);
 }
});

test("copies only the selected Bot reply's unrendered body from its More menu", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 const text = "**资料已整理**\n\n保留原文与 `Markdown`。";
 await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [
  { id: "copy-me", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text, createdAt: 2, requestId: "fixture-copy-me" },
  { id: "later", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text: "另一条回复", createdAt: 3, requestId: "fixture-later" },
 ] });
 await app.waitFor("id:message-copy-me");
 await app.hover("id:message-content-m1");
 expect(app.shows("id:message-more-m1")).toBe(false);
 await app.hover("id:message-content-copy-me");
 expect(app.shows("id:reply-copy-me")).toBe(true);
 expect(app.shows("id:message-more-later")).toBe(false);
 expect(app.shows("text:复制")).toBe(false);
 await app.press("id:message-more-copy-me");
 expect(app.menu()?.map((item) => item.label)).toEqual(["复制"]);
 await app.chooseMenuItem("复制");
 await app.waitFor("text:成功：已复制回复");
 expect(app.clipboard()).toBe(text);
});

test("shows approval content and resolves a one-time answer", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:attention-q1");
 await app.press("id:attention-q1-toggle");
 expect(app.shows("text:/测试内容/")).toBe(true);
 await app.press("id:attention-q1-option-批准");
 await app.waitFor("id:attention-q1-answer");
 expect(commands(app).filter((c) => c.type === "attention.reply")).toHaveLength(1);
 expect(commands(app).find((c) => c.type === "attention.reply")).toMatchObject({ attentionId: "q1", value: "批准" });
});

test("switches bots and creates a persistent bot through a command", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:bot-other"); await app.press("id:bot-other");
 expect(app.shows("text:给 另一个 Bot 发消息")).toBe(true);
 await app.press("id:sidebar-create"); await app.type("id:create-bot-name", "测试 Bot"); await app.press("id:create-bot-submit");
 await app.waitFor("text:给 测试 Bot 发消息");
 expect(commands(app).find((c) => c.type === "bot.upsert")).toMatchObject({ bot: { name: "测试 Bot" } });
});

test("sidebar right-click menu pins, renames, hides and deletes bots", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:bot-other");
 await app.rightClick("id:bot-other");
 expect(app.menu()?.map((m) => m.label)).toEqual(["置顶", "标为未读", "重命名 Bot", "复制对话 ID", "从侧边栏隐藏", "删除"]);
 await app.chooseMenuItem("置顶");
 await app.waitUntil(() => commands(app).some((c) => c.type === "bot.upsert"));
 expect(commands(app).at(-1)).toMatchObject({ type: "bot.upsert", bot: { id: "other", name: "另一个 Bot", pinned: true, hidden: false } });
 await app.rightClick("id:bot-other");
 expect(app.menu()?.[0]?.label).toBe("取消置顶");
 await app.chooseMenuItem("重命名 Bot");
 await app.waitFor("id:rename-bot-name");
 expect(app.value("id:rename-bot-name")).toBe("另一个 Bot");
 await app.clear("id:rename-bot-name"); await app.type("id:rename-bot-name", "新名字"); await app.press("id:rename-bot-submit");
 await app.waitFor("text:新名字");
 expect(commands(app).at(-1)).toMatchObject({ type: "bot.upsert", bot: { id: "other", name: "新名字" } });
 await app.rightClick("id:bot-other"); await app.chooseMenuItem("从侧边栏隐藏");
 await app.waitFor("id:sidebar-hidden-toggle");
 expect(commands(app).at(-1)).toMatchObject({ type: "bot.upsert", bot: { id: "other", hidden: true, pinned: false } });
 expect(app.shows("id:bot-other")).toBe(false);
 await app.press("id:sidebar-hidden-toggle"); await app.waitFor("id:bot-other");
 await app.rightClick("id:bot-other");
 expect(app.menu()?.map((m) => m.label)).toContain("在侧边栏显示");
 app.onDialog((dialog) => dialog.title === "删除 Bot" ? "删除" : null);
 await app.chooseMenuItem("删除");
 await app.waitUntil(() => commands(app).some((c) => c.type === "bot.delete"));
 expect(commands(app).at(-1)).toMatchObject({ type: "bot.delete", botId: "other" });
 await app.waitUntil(() => !app.shows("id:bot-other"));
 expect(app.shows("id:sidebar-hidden-toggle")).toBe(false);
});

test("sidebar marks bots unread from new bot messages and the menu, and opening reads them", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:bot-other");
 expect(app.shows("id:unread-other")).toBe(false);
 const reply = (threadId: string, id: string) => app.host.send("agent", { type: "thread.delta", threadId, typing: false, messages: [{ id, threadId, author: { kind: "bot", id: threadId.slice(3) }, kind: "text", text: id, createdAt: Date.now() + 1000, requestId: id }] });
 await reply("dm:other", "other-reply"); await app.waitFor("id:unread-other");
 await reply("dm:xiaocai", "open-reply"); await app.waitFor("text:open-reply");
 expect(app.shows("id:unread-xiaocai")).toBe(false);
 await app.rightClick("id:bot-other");
 expect(app.menu()?.map((m) => m.label)).toContain("标为已读");
 await app.chooseMenuItem("标为已读");
 await app.waitUntil(() => !app.shows("id:unread-other"));
 await app.rightClick("id:bot-other"); await app.chooseMenuItem("标为未读");
 await app.waitFor("id:unread-other");
 await app.press("id:bot-other");
 await app.waitUntil(() => !app.shows("id:unread-other"));
 await app.rightClick("id:bot-xiaocai"); await app.chooseMenuItem("标为未读");
 await app.waitFor("id:unread-xiaocai");
 expect(JSON.parse(app.storage().readState ?? "{}").marked).toEqual({ xiaocai: true });
});

test("sidebar orders unpinned bots by latest activity", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:bot-other");
 await app.press("id:sidebar-create"); await app.type("id:create-bot-name", "较新的 Bot"); await app.press("id:create-bot-submit");
 await app.waitFor("text:给 较新的 Bot 发消息");
 expect(app.texts().indexOf("较新的 Bot")).toBeLessThan(app.texts().indexOf("另一个 Bot"));
 await app.wait(5);
 await app.press("id:bot-other"); await app.type("id:composer-input", "最新一条"); await app.submit("id:composer-input");
 await app.waitFor("text:最新一条");
 const texts = app.texts();
 expect(texts.indexOf("另一个 Bot")).toBeLessThan(texts.indexOf("较新的 Bot"));
});

test("persists permission and folder commands and shows shared connectors", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1"); await app.press("id:sidebar-account"); await app.press("id:settings-permissions");
 await app.press("label:允许删除文件");
 expect(commands(app).find((c) => c.type === "settings.update")).toMatchObject({ settings: { permissions: { deleteFiles: true } } });
 await app.press("id:settings-computer"); await app.type("id:connected-folder-input", "/tmp/second"); await app.press("id:connected-folder-add");
 expect(commands(app).filter((c) => c.type === "settings.update").slice(-1)[0]).toMatchObject({ settings: { connectedFolders: ["/tmp/deepbot-ui", "/tmp/second"] } });
 await app.press("id:settings-connections");
 expect(app.shows("text:连接器")).toBe(true);
 for (const text of ["HTTP MCP", "已连接", "工具", "42 个", "可用 Bot", "1 个"]) {
  expect(app.shows(`id:connector-github >> text:${text}`)).toBe(true);
 }
 expect(app.shows("id:connector-github >> label:管理 GitHub")).toBe(true);
 expect(app.shows("text:T3 Code MCP HTTP 401，密钥无效或缺失")).toBe(true);
});

test("configures a T3 Code pairing link and keeps the draft on a backend error", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.press("id:sidebar-account");
 await app.press("id:settings-connections");
 expect(app.count("id:t3-configure")).toBe(1);
 await app.press("id:t3-configure");
 expect(app.enabled("id:t3-token-save")).toBe(false);
 await app.type("id:t3-token", "unused-key");
 await app.press("id:t3-token-cancel");
 expect(commands(app).filter(c => c.type === "connector.t3.configure")).toHaveLength(0);
 await app.press("id:t3-configure");
 expect(app.enabled("id:t3-token-save")).toBe(false);
 await app.type("id:t3-token", "old-sidecar");
 await app.press("id:t3-token-save");
 await app.waitFor("text:错误：DeepBot 后台尚未加载此操作，请重启应用后重试");
 expect(app.enabled("id:t3-token-save")).toBe(true);
 await app.clear("id:t3-token");
 const link = "http://localhost:13773/pair#token=ABCD2345WXYZ";
 await app.type("id:t3-token", link);
 await app.submit("id:t3-token");
 await app.waitFor("id:connector-t3code >> text:可用");
 await app.waitFor("id:t3-token-editor", { state: "gone" });
 expect(commands(app).filter(c => c.type === "connector.t3.configure").map(c => c.token)).toEqual(["old-sidecar", link]);
 await app.waitFor("id:feedback-success");
 await app.press("id:t3-configure");
 expect(app.enabled("id:t3-token-save")).toBe(false);
 expect(app.shows("id:connector-github >> text:已连接")).toBe(true);
});

test("manages rules for each Bot from its configuration", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.press("id:sidebar-account"); await app.waitFor("id:settings-general");
 expect(app.shows("id:settings-rules")).toBe(false);
 expect(app.shows("id:settings-routines")).toBe(false);
 expect(app.shows("id:settings-memory")).toBe(false);
 await app.press("label:关闭设置");
 await app.host.send("info-panel", true);
 await app.waitFor("id:routines-empty"); await app.wait(400);
 await app.press("text:配置"); await app.waitFor("id:bot-config-rules");
 await app.press("id:bot-config-rules"); await app.waitFor("id:rule-keywords");
 expect(app.shows("id:bot-configuration-dialog >> id:bot-config-rules-editor")).toBe(true);
 expect(app.shows("text:暂无规矩")).toBe(true);
 await app.type("id:rule-keywords", "代码,仓库");
 await app.press("id:rule-add");
 await app.waitFor("text:代码,仓库");
 expect(commands(app).find((c) => c.type === "rule.upsert")).toMatchObject({ rule: { botId: "xiaocai", confirmed: true, enabled: true, match: { keywords: ["代码", "仓库"] } } });
 await app.press("label:启用 代码,仓库");
 expect(commands(app).filter((c) => c.type === "rule.upsert").at(-1)).toMatchObject({ rule: { botId: "xiaocai", enabled: false } });
 await app.type("id:rule-keywords", "未提交的草稿");
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.waitFor("id:bot-configuration-dialog", { state: "gone" });
 await app.press("id:bot-config-rules");
 expect(app.value("id:rule-keywords") ?? "").toBe("");
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.press("id:bot-other"); await app.waitFor("id:routines-empty");
 await app.press("text:配置"); await app.press("id:bot-config-rules");
 expect(app.shows("text:暂无规矩")).toBe(true);
 expect(app.value("id:rule-keywords") ?? "").toBe("");
 await app.type("id:rule-keywords", "另一个 Bot 的规矩");
 await app.press("id:rule-add"); await app.waitFor("text:另一个 Bot 的规矩");
 expect(commands(app).filter((c) => c.type === "rule.upsert").at(-1)).toMatchObject({ rule: { botId: "other", name: "另一个 Bot 的规矩" } });
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.press("id:bot-xiaocai"); await app.press("text:配置"); await app.press("id:bot-config-rules");
 expect(app.shows("text:代码,仓库")).toBe(true);
 expect(app.shows("text:另一个 Bot 的规矩")).toBe(false);
 await app.press("id:bot-configuration-dialog >> label:关闭"); await app.waitFor("id:bot-config-rules");
 expect(app.shows("label:关闭 Bot 信息")).toBe(true);
});

test("memories live under the library tab of each bot", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { panelActions: true, infoTab: "library" } } });
 await app.waitFor("id:library-memory-mem1");
 const sectionTitles = ["小菜 记住的事", "小菜 保存的资料"];
 expect(app.texts().filter((text) => sectionTitles.includes(text))).toEqual(sectionTitles);
 expect(app.shows("id:library-memory-mem1 >> text:用中文回复")).toBe(true);
 expect(app.shows("id:memory-delete-mem1")).toBe(false);
 expect(app.shows("text:另一个 Bot 的记忆")).toBe(false);
 expect(app.shows("text:管理记忆")).toBe(false);
 await app.wait(400);
 await app.press("id:library-memory-mem1");
 await app.waitFor("id:library-preview-memory");
 expect(app.shows("id:library-preview >> text:用中文回复")).toBe(true);
 await app.wait(250);
 try { await app.screenshot("output/library-memory-preview.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.press("id:library-preview >> text:编辑");
 await app.clear("id:memory-mem1"); await app.type("id:memory-mem1", "用简体中文回复"); await app.submit("id:memory-mem1");
 await app.waitFor("id:library-preview", { state: "gone" });
 expect(commands(app).filter((c) => c.type === "memory.upsert").at(-1)).toMatchObject({ memory: { id: "mem1", text: "用简体中文回复", revision: 2 } });
 await app.type("id:memory-input", "周报发在周五"); await app.press("id:memory-add");
 const added = commands(app).filter((c) => c.type === "memory.upsert").at(-1) as { memory: { id: string; text: string; botId: string; revision: number } };
 expect(added).toMatchObject({ memory: { text: "周报发在周五", botId: "xiaocai", revision: 1 } });
 expect(app.value("id:memory-input")).toBe("");
 await app.press("id:bot-other"); await app.press("text:资料库");
 await app.waitFor("id:library-memory-mem-other >> text:另一个 Bot 的记忆");
 expect(app.shows("id:library-memory-mem1")).toBe(false);
 await app.press("id:bot-xiaocai"); await app.press("text:资料库");
 await app.press("id:library-memory-mem1");
 await app.waitFor("id:library-preview >> text:用简体中文回复");
 await app.press("id:memory-delete-mem1");
 expect(commands(app).filter((c) => c.type === "memory.delete").at(-1)).toMatchObject({ memoryId: "mem1" });
 await app.waitFor("id:library-memory-mem1", { state: "gone" });
 await app.press(`id:library-memory-${added.memory.id}`);
 await app.press(`id:memory-delete-${added.memory.id}`);
 await app.waitFor("text:还没有长期记忆，可以在下面添加或在聊天里交代");
});


test("reconnect replays the same request id after a transport failure", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.host.send("fail-next");
 await app.type("id:composer-input", "不能丢的消息"); await app.submit("id:composer-input");
 await app.waitFor("id:agent-reconnect"); await app.press("id:agent-reconnect");
 await app.waitFor("text:不能丢的消息");
 const sends = commands(app).filter((c) => c.type === "message.send");
 const [first, replay] = sends;
 if (!first || !replay) throw new Error("Missing the initial send or its replay");
 expect(first.requestId).toBe(replay.requestId);
});

test("bot configuration lives in the right panel and commits to the selected bot", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:bot-other"); await app.press("id:sidebar-account");
 await app.waitFor("id:settings");
 expect(app.shows("id:settings-bot")).toBe(false);
 await app.press("label:关闭设置");
 await app.press("id:bot-other"); await app.press("id:bot-pill"); await app.press("text:配置");
 expect(app.shows("id:settings")).toBe(false);
 expect(app.shows("label:配置 Bot")).toBe(false);
 expect(app.value("id:bot-config-name")).toBe("另一个 Bot");
 await app.clear("id:bot-config-instructions"); await app.type("id:bot-config-instructions", "严谨完成工作"); await app.submit("id:bot-config-instructions");
 expect(commands(app).find((c) => c.type === "bot.upsert")).toMatchObject({ bot: { id: "other", instructions: "严谨完成工作" } });
 await app.press("text:资料库");
 expect(app.shows("id:bot-config-name")).toBe(false);
 expect(app.shows("text:还没有资料，工作产物会出现在这里")).toBe(true);
 await app.press("text:配置");
 expect(app.value("id:bot-config-instructions")).toBe("严谨完成工作");
 await app.press("label:打开 小菜");
 expect(app.shows("id:bot-config-name")).toBe(false);
 await app.press("text:配置");
 expect(app.value("id:bot-config-name")).toBe("小菜");
 expect(app.value("id:bot-config-instructions")).toBe("协助完成任务");
 await app.clear("id:bot-config-name"); await app.type("id:bot-config-name", "小助手"); await app.submit("id:bot-config-name");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { id: "xiaocai", name: "小助手" } });
 expect(app.value("id:bot-config-instructions")).toBe("协助完成任务");
 expect(app.texts()).toContain("/tmp/deepbot-data/bots/xiaocai/workspace"); expect(app.texts()).toContain("/tmp/deepbot-data/shared");
 await app.type("id:bot-folder-input", "/tmp/bot-work"); await app.press("id:bot-folder-add");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { id: "xiaocai", folders: ["/tmp/deepbot-project", "/tmp/bot-work"] } });
 await app.waitUntil(() => app.texts().includes("/tmp/bot-work"));
 await app.press("id:bot-folder-remove-/tmp/deepbot-project");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { id: "xiaocai", folders: ["/tmp/bot-work"] } });
 await app.press("text:动态");
 expect(app.shows("text:事项")).toBe(true);
 expect(app.shows("text:配置 Bot")).toBe(false);
});

test("bot configuration fits the default and minimum right panel widths", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { botConfiguration: true } } });
 await app.waitFor("id:bot-configuration");
 expect(app.value("id:bot-config-name")).toBe("小菜");
 expect(app.shows("text:deepseek/deepseek-flash · 专用模型配置")).toBe(true);
 for (const width of [320, 240]) {
  if (width === 240) await app.drag("id:column-divider-1", { x: 80, y: 0 });
  expect(app.shows("id:bot-config-model")).toBe(true);
  expect(app.shows("id:bot-configuration >> text:例行")).toBe(false);
  expect(app.texts()).toContain("/tmp/deepbot-project");
  // The native surface paints the resized controls after the layout event.
  await app.wait(100);
  try { await app.screenshot(`/tmp/deepbot-bot-configuration-${width}.png`); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 }
 await app.press("id:bot-folder-remove-/tmp/deepbot-project");
 await app.waitUntil(() => commands(app).some(c => c.type === "bot.upsert"));
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { id: "xiaocai", folders: [] } });
 await app.waitFor("text:暂无关联文件夹");
 await app.clear("id:bot-config-name"); await app.type("id:bot-config-name", "窄栏助手"); await app.submit("id:bot-config-name");
 await app.waitUntil(() => commands(app).some(c => (c.bot as { name?: string } | undefined)?.name === "窄栏助手"));
 await app.press("label:Bot 模型配置"); await app.waitFor("text:备用模型"); await app.press("text:备用模型");
 await app.waitUntil(() => commands(app).some(c => (c.bot as { modelConfigId?: string } | undefined)?.modelConfigId === "second"));
});


test("reattaches to an existing sidecar without another ready event", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { noReady: true } } });
 await app.waitFor("id:message-m1");
 await app.type("id:composer-input", "继续对话"); await app.submit("id:composer-input");
 expect(commands(app).find((c) => c.type === "message.send")).toMatchObject({ text: "继续对话" });
});


for (const event of ["fatal", "disconnect"]) {
 test(`keeps controls and reconnect alive after ${event}`, async () => {
  const app = await open("../FixtureApp.tsx", desktop);
  await app.waitFor("id:message-m1");
  await app.host.send(event);
  await app.waitFor("id:agent-reconnect");
  expect(app.shows("id:message-m1")).toBe(true);
  await app.press("id:sidebar-account");
  await app.waitFor("id:settings");
  await app.press("label:关闭设置");
  await app.waitFor("id:settings", { state: "gone" });
  await app.press("id:agent-reconnect");
  await app.waitFor("id:agent-reconnect", { state: "gone" });
  await app.type("id:composer-input", "恢复后继续对话");
  await app.submit("id:composer-input");
  expect(commands(app).find((c) => c.type === "message.send")).toMatchObject({ text: "恢复后继续对话" });
 });
}

test("new bots use the configured default and allow a different model", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1");
 await app.press("id:sidebar-account"); await app.press("id:settings-models");
 await app.press("id:model-group-openai"); await app.press("id:model-default-second");
 expect(commands(app).find(c => c.type === "model.default")).toMatchObject({ modelConfigId: "second" });
 await app.press("label:关闭设置");
 await app.press("id:sidebar-create"); await app.type("id:create-bot-name", "默认 Bot");
 expect(app.shows("text:备用模型（默认）")).toBe(true);
 await app.press("id:create-bot-submit");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { name: "默认 Bot", modelConfigId: "second" } });
 await app.press("id:sidebar-create"); await app.type("id:create-bot-name", "指定 Bot");
 await app.press("label:新 Bot 模型配置"); await app.press("text:默认模型"); await app.press("id:create-bot-submit");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { name: "指定 Bot", modelConfigId: "default" } });
 await app.press("id:bot-pill"); await app.press("text:配置");
 expect(app.shows("id:bot-config-provider")).toBe(false);
 await app.press("label:Bot 模型配置"); await app.press("text:备用模型");
 expect(commands(app).filter(c => c.type === "bot.upsert").at(-1)).toMatchObject({ bot: { name: "指定 Bot", modelConfigId: "second" } });
});

test("model deletion explains default and Bot protections with switching instructions", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings"); await app.press("id:model-group-openai");
 expect(app.enabled("id:model-delete-default")).toBe(true);
 await app.press("id:model-delete-default");
 await app.waitFor("text:/这是默认模型，请先将其他模型设为默认/");
 expect(app.shows("text:/在右侧「配置」中切换模型/")).toBe(true);
 expect(app.shows("text:/「小菜」、「另一个 Bot」/")).toBe(true);
 await app.press("label:关闭提示");
 await app.press("id:model-default-second"); await app.press("id:model-delete-default");
 await app.waitFor("text:/正在被.*使用，请选中对应 Bot/");
 expect(app.dialogs()).toHaveLength(0);
 expect(commands(app).filter(c => c.type === "model.delete")).toHaveLength(0);
 expect(commands(app).filter(c => c.type === "bot.upsert")).toHaveLength(0);
});

test("model deletion explains the single profile and active assignment protections", async () => {
 for (const params of [{ singleModel: true }, { modelInUse: true }]) {
  const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true, ...params } } });
  await app.waitFor("id:model-settings"); await app.press("id:model-group-openai");
  await app.press(params.singleModel ? "id:model-delete-default" : "id:model-delete-second");
  await app.waitFor(params.singleModel ? "text:/请先添加其他模型并设为默认/" : "text:/请先结束相关事项后再删除/");
  expect(app.dialogs()).toHaveLength(0);
  expect(commands(app).filter(c => c.type === "model.delete")).toHaveLength(0);
 }
});

test("model deletion confirms unused profiles and preserves canceled models", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings"); await app.press("id:model-group-openai");
 app.onDialog(() => "取消"); await app.press("id:model-delete-second");
 expect(app.dialogs()[0]).toMatchObject({ title: "删除模型配置", message: "删除「备用模型」" });
 expect(commands(app).filter(c => c.type === "model.delete")).toHaveLength(0);
 expect(app.shows("id:model-card-second")).toBe(true);
 app.onDialog(() => "删除"); await app.press("id:model-delete-second");
 await app.waitFor("id:model-card-second", { state: "gone" });
 expect(commands(app).find(c => c.type === "model.delete")).toMatchObject({ modelConfigId: "second" });
 await app.waitFor("text:成功：模型配置已删除");
});

test("model settings group providers and edit only on explicit save", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings");
 expect(app.shows("text:1 个提供方 · 2 个模型")).toBe(true);
 expect(app.shows("id:model-editor")).toBe(false);
 await app.press("id:model-group-openai"); await app.press("id:model-edit-default");
 await app.clear("id:model-name"); await app.type("id:model-name", "共享模型");
 await app.type("id:model-url", "http://localhost:1234/v1");
 await app.press("id:model-input-mode"); await app.press("text:文本和图片");
 expect(commands(app).filter(c => c.type === "model.upsert")).toHaveLength(0);
 await app.press("id:model-group-openai"); await app.press("id:model-group-openai");
 await app.press("id:model-save");
 await app.waitFor("id:model-editor", { state: "gone" });
 expect(commands(app).find(c => c.type === "model.upsert")).toMatchObject({ config: { id: "default", name: "共享模型", baseUrl: "http://localhost:1234/v1", inputMode: "image" } });
 expect(commands(app).filter(c => c.type === "bot.upsert")).toHaveLength(0);
 await app.press("id:model-edit-default"); await app.clear("id:model-name"); await app.type("id:model-name", "不保存"); await app.press("id:model-editor-cancel");
 expect(commands(app).filter(c => c.type === "model.upsert")).toHaveLength(1);
});

test("model editor applies provider presets, discovers models and tests an unsaved draft", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings");
 await app.press("id:model-add");
 await app.press("label:模型提供方"); await app.press("text:DeepSeek");
 await app.press("id:model-fetch"); await app.waitFor("id:model-remote");
 await app.press("label:可用模型"); await app.press("text:remote-second");
 await app.press("id:model-remote-done");
 await app.scroll("id:model-test", 350);
 await app.press("id:model-test"); await app.waitFor("text:成功：连接成功，模型已返回响应");
 expect(commands(app).find(c => c.type === "model.test")).toMatchObject({ config: { provider: "deepseek", model: "remote-second", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1" } });
 expect(commands(app).filter(c => c.type === "model.upsert")).toHaveLength(0);
 await app.press("id:model-save"); await app.waitFor("id:model-editor", { state: "gone" });
 expect(commands(app).find(c => c.type === "model.upsert")).toMatchObject({ config: { name: "remote-second", model: "remote-second", provider: "deepseek", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1" } });
});

test("model catalog batches selections only when the new model name is blank", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings"); await app.press("id:model-add");
 await app.type("id:model-name", " ");
 await app.press("label:模型提供方"); await app.press("text:DeepSeek");
 await app.type("id:model-key", "test-batch-key");
 await app.press("id:model-fetch"); await app.waitFor("id:model-remote");
 await app.press("label:可用模型");
 await app.press("label:remote-first");
 await app.type("id:model-remote-search", "second");
 expect(app.shows("label:remote-first")).toBe(false);
 await app.press("label:remote-second");
 await app.press("label:remote-second");
 expect(app.shows("text:已选 1 个模型")).toBe(true);
 await app.press("label:remote-second");
 await app.press("id:model-remote-done");
 await app.type("id:model-name", "具名模型");
 await app.press("label:可用模型");
 expect(app.shows("id:model-remote-search")).toBe(false);
 await app.press("text:remote-second");
 await app.clear("id:model-name");
 await app.press("label:可用模型"); await app.press("label:remote-first"); await app.press("id:model-remote-done");
 expect(app.shows("text:添加 2 个模型")).toBe(true);
 expect(app.enabled("id:model-test")).toBe(false);
 expect(commands(app).filter(c => c.type === "model.add-many")).toHaveLength(0);
 await app.scroll("id:model-save", 350); await app.press("id:model-save");
 await app.waitFor("id:model-editor", { state: "gone" });
 const saved = commands(app).filter(c => c.type === "model.add-many");
 expect(saved).toHaveLength(1);
 expect(saved[0]).toMatchObject({ config: { provider: "deepseek", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1" }, models: ["remote-second", "remote-first"], apiKey: "test-batch-key" });
 expect(app.shows("text:1 个提供方 · 2 个模型")).toBe(false);
 expect(app.shows("text:2 个提供方 · 4 个模型")).toBe(true);
});


test("Magpie preset pulls its model catalog from the local gateway", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings");
 await app.press("id:model-add");
 await app.press("label:模型提供方"); await app.press("text:Magpie");
 expect(app.value("id:model-url")).toBe("http://127.0.0.1:3425/v1");
 await app.press("id:model-fetch"); await app.waitFor("id:model-remote");
 expect(commands(app).find(c => c.type === "model.list")).toMatchObject({ config: { provider: "magpie", api: "openai-completions", baseUrl: "http://127.0.0.1:3425/v1" } });
});

test("model discovery failure preserves the draft and allows manual model IDs", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings"); await app.press("id:model-add");
 await app.type("id:model-name", "保留草稿");
 await app.host.send("fail-model"); await app.press("id:model-fetch");
 await app.waitFor("text:错误：拉取失败，可手动填写模型 ID");
 expect(app.value("id:model-name")).toBe("保留草稿");
 expect(app.enabled("id:model-fetch")).toBe(true);
 await app.type("id:model-id", "manual-model");
 expect(app.value("id:model-id")).toBe("manual-model");
 await app.scroll("id:model-save", 250); await app.press("id:model-save");
 expect(commands(app).find(c => c.type === "model.upsert")).toMatchObject({ config: { name: "保留草稿", model: "manual-model" } });
});

test("model results use a dismissible floating notice in settings", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:model-settings"); await app.press("id:model-group-openai");
 await app.press("id:model-test-default");
 await app.waitFor("id:feedback-success");
 expect(app.shows("id:model-test-result-default")).toBe(false);
 expect(app.shows("text:成功：连接成功，模型已返回响应")).toBe(true);
 try { await app.screenshot("/tmp/deepbot-feedback-settings.png"); }
 catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 await app.press("label:关闭提示");
 await app.waitFor("id:feedback-success", { state: "gone" });
 expect(app.shows("id:settings")).toBe(true);
 await app.host.send("agent", { type: "error", requestId: "failed-save", message: "保存失败，请重试" });
 await app.waitFor("id:feedback-error");
 expect(app.shows("id:agent-error")).toBe(false);
 expect(app.shows("id:model-error")).toBe(false);
 expect(app.count("id:feedback-error")).toBe(1);
 await app.keyboard.press("escape"); await app.waitFor("id:feedback-error", { state: "gone" });
 expect(app.shows("id:settings")).toBe(true);
 await app.keyboard.press("escape"); await app.waitFor("id:settings", { state: "gone" });
});

test("feedback levels have distinct colors and lifetimes without blocking chat", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, clock: {} });
 await app.waitFor("id:message-m1");
 const colors: Record<string, string> = {};
 for (const [level, timeout] of Object.entries({ success: 4000, info: 5000, warning: 6000, error: 8000 })) {
  await app.host.send("feedback", { level, message: "操作反馈" });
  await app.waitFor(`id:feedback-${level}`);
  colors[level] = app.spanStyle("id:feedback-message >> text:/操作反馈/").color;
  expect(app.spanStyle("id:feedback-message >> text:/操作反馈/").fontSize).toBe(14);
  await app.wait(timeout - 400);
  expect(app.shows(`id:feedback-${level}`)).toBe(true);
  if (level === "error") {
   await app.type("id:composer-input", "提示期间继续操作"); await app.submit("id:composer-input");
   expect(commands(app).find(c => c.type === "message.send")).toMatchObject({ text: "提示期间继续操作" });
  }
  await app.wait(1200);
  expect(app.shows(`id:feedback-${level}`)).toBe(false);
 }
 expect(new Set(Object.values(colors)).size).toBe(4);
 await app.type("id:composer-input", "继续操作"); await app.submit("id:composer-input");
 expect(commands(app).filter(c => c.type === "message.send").at(-1)).toMatchObject({ text: "继续操作" });
});

test("a repeated error gets its own full lifetime while a different error expires", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, clock: {} });
 await app.waitFor("id:message-m1");
 await app.host.send("agent", { type: "error", requestId: "repeated", message: "旧错误" });
 await app.host.send("agent", { type: "error", requestId: "independent", message: "独立错误" });
 await app.waitFor("text:错误：独立错误");
 await app.wait(4500);
 await app.host.send("agent", { type: "error", requestId: "repeated", message: "重试错误" });
 await app.waitFor("text:错误：重试错误");
 expect(app.shows("text:错误：旧错误")).toBe(false);
 await app.wait(4000);
 expect(app.shows("text:错误：独立错误")).toBe(false);
 expect(app.shows("text:错误：重试错误")).toBe(true);
 await app.wait(3600);
 expect(app.shows("text:错误：重试错误")).toBe(true);
 await app.wait(1200);
 expect(app.shows("text:错误：重试错误")).toBe(false);
});

test("floating feedback pauses on hover and follows the active modal", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, clock: {} });
 await app.waitFor("id:message-m1");
 await app.host.send("feedback", { level: "success", message: "保持可读" });
 await app.hover("id:feedback-success"); await app.wait(6000);
 expect(app.shows("id:feedback-success")).toBe(true);
 await app.hover("id:composer-input"); await app.wait(6000);
 expect(app.shows("id:feedback-success")).toBe(false);
 await app.host.send("feedback", { level: "error", message: "需要处理" });
 await app.press("id:sidebar-account");
 expect(app.count("id:feedback-error")).toBe(1);
 await app.press("label:关闭提示"); await app.waitFor("id:feedback-error", { state: "gone" });
 expect(app.shows("id:settings")).toBe(true);
});

test("feedback renders over the native settings surface", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { modelPage: true } } });
 await app.waitFor("id:settings");
 await app.host.send("feedback", { level: "error", message: "连接失败，请检查服务地址后重试" });
 await app.waitFor("id:feedback-error");
 expect(app.count("id:feedback-error")).toBe(1);
 expect(app.shows("id:model-editor-error")).toBe(false);
 try { await app.screenshot("/tmp/deepbot-feedback-native-settings.png"); }
 catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
});

test("executor settings show self's defaults and commit each change", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:message-m1"); await app.press("id:sidebar-account"); await app.press("id:settings-connections");
 expect(app.shows("text:Bot 自己")).toBe(true);
 await app.press("id:self-configure");
 expect(app.shows("text:中")).toBe(true); expect(app.shows("text:跟随模型")).toBe(true);
 await app.press("id:executor-thinking"); await app.press("text:高");
 expect(commands(app).filter((c) => c.type === "settings.update").slice(-1)[0]).toMatchObject({ settings: { executor: { thinkingLevel: "high", contextWindow: 0, images: true, projectInstructions: true } } });
 await app.press("id:executor-context"); await app.press("text:1M");
 expect(commands(app).filter((c) => c.type === "settings.update").slice(-1)[0]).toMatchObject({ settings: { executor: { thinkingLevel: "high", contextWindow: 1000000 } } });
 await app.press("label:图片输入");
 expect(commands(app).filter((c) => c.type === "settings.update").slice(-1)[0]).toMatchObject({ settings: { executor: { images: false, contextWindow: 1000000 } } });
 await app.press("label:读取项目说明");
 expect(commands(app).filter((c) => c.type === "settings.update").slice(-1)[0]).toMatchObject({ settings: { executor: { images: false, projectInstructions: false } } });
 expect(app.shows("text:1M")).toBe(true);
});
