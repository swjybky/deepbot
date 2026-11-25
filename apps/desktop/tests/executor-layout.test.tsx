import { expect, open, test } from "nsh/test";
const shot = async (app: { screenshot(path?: string | null): Promise<Uint8Array> }, path: string) => {
 try { await app.screenshot(path); }
 catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
};
test("executor page renders self's settings and commits a change", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { executorPage: true } } });
 await app.press("id:self-configure");
 await app.waitFor("id:executor-thinking");
 await app.wait(500);
 expect(app.shows("text:Bot 自己")).toBe(true);
 expect(app.shows("text:/SKILL\\.md/")).toBe(true);
 await shot(app, "/tmp/deepbot-executor-page.png");
 await app.press("id:executor-context"); await app.wait(300);
 await shot(app, "/tmp/deepbot-executor-context-menu.png");
 await app.press("text:1M"); await app.wait(300);
 await app.press("label:图片输入"); await app.wait(500);
 const updates = JSON.parse(app.storage().commands ?? "[]").filter((c: { type: string }) => c.type === "settings.update");
 expect(updates.slice(-1)[0]).toMatchObject({ settings: { executor: { contextWindow: 1000000, images: false } } });
 await shot(app, "/tmp/deepbot-executor-after.png");
 await app.press("id:self-configure");
 expect(app.shows("id:connector-self >> text:1M")).toBe(true);
 expect(app.shows("id:connector-self >> text:关 · 开")).toBe(true);
});

test("connection tiles pair in order, with an add card after the executors and a full row for inline editors", async () => {
 const app = await open("../FixtureApp.tsx", {
  width: 1280, height: 800, platform: "linux", host: { params: { executorPage: true, emptyMcp: true } },
 });
 await app.waitFor("id:executor-grid-row-0 >> id:connector-t3code");
 expect(app.shows("id:executor-grid-row-0 >> id:connector-self")).toBe(true);
 expect(app.shows("id:executor-grid-row-1 >> id:connector-acp:codex")).toBe(true);
 expect(app.shows("id:executor-grid-row-1 >> id:executor-add")).toBe(true);
 expect(app.shows("id:mcp-grid-row-0 >> id:mcp-add >> text:暂无连接器")).toBe(true);
 expect(app.shows("id:mcp-grid-row-0 >> id:mcp-grid-placeholder")).toBe(true);

 await app.press("id:self-configure");
 expect(app.shows("id:executor-grid-row-0 >> id:executor-thinking")).toBe(true);
 expect(app.shows("id:executor-grid-row-0 >> id:executor-grid-placeholder")).toBe(false);
 expect(app.shows("id:executor-grid-row-1 >> id:connector-t3code")).toBe(true);
 expect(app.shows("id:executor-grid-row-1 >> id:connector-acp:codex")).toBe(true);
 await app.press("id:self-configure");

 await app.press("id:t3-configure");
 expect(app.shows("id:executor-grid-row-1 >> id:t3-token-editor")).toBe(true);
 expect(app.shows("id:executor-grid-row-1 >> id:executor-grid-placeholder")).toBe(false);
 expect(app.shows("id:executor-grid-row-2 >> id:connector-acp:codex")).toBe(true);
 expect(app.shows("id:t3-mode-status")).toBe(false);
 await app.type("id:t3-token", "test-draft");
 await app.press("id:self-configure");
 expect(app.value("id:t3-token")).toBe("test-draft");
 await app.press("label:关闭设置");
 await app.press("id:sidebar-account");
 await app.press("id:settings-connections");
 expect(app.shows("id:t3-token-editor")).toBe(false);
 expect(app.shows("id:executor-thinking")).toBe(false);
 await app.press("id:executor-add");
 await app.waitFor("id:remote-t3-editor");
 await app.press("id:remote-t3-cancel");
 await app.waitFor("id:executor-add");

 await app.press("label:暂无连接器，添加连接器");
 await app.waitFor("id:mcp-editor");
 await app.press("id:mcp-cancel");
 expect(app.shows("id:mcp-add >> text:暂无连接器")).toBe(true);
});

test("work detail renders self two-line live progress summary", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { workDetail: true } } });
 await app.waitFor("id:work-detail-w1");
 await app.host.send("agent", {
  type: "work.updated",
  work: {
   id: "w1",
   ownerBotId: "xiaocai",
   threadId: "dm:xiaocai",
   title: "整理资料",
   goal: "整理资料",
   criteria: ["有结果"],
   scope: "当前目录",
   state: "open",
   phase: "running",
   revision: 2,
   artifactIds: [],
   progress: "阶段一：核对测试\n第 3 轮 · 正在执行 bash：npm test (12/12 passed)",
   createdAt: 1,
   updatedAt: 2,
   reviewAttempts: 0,
   sourceMessageIds: ["m1"],
   assignmentId: "a1",
   cwd: "/tmp/deepbot-project",
  },
 });
 await app.waitFor("text:/正在执行 bash/");
 await app.wait(300);
 await shot(app, "/tmp/deepbot-work-live-progress.png");
});
