import { expect, open, test } from "nsh/test";
import type { Work, WorkPhase } from "../../../packages/agent/src/protocol";

const progress = "第一行：已核对当前执行进度\n第二行：正在整理完整结果\n第三行：这部分只应在详情中显示\n第四行：完整内容结尾";
const work = (id: string, phase: WorkPhase): Work => ({ id, ownerBotId: "xiaocai", threadId: "dm:xiaocai", title: `${id}事项标题`, goal: "完整目标\n目标第二段\n目标第三段", criteria: ["完整验收标准"], scope: "当前目录", state: ["done", "failed", "cancelled"].includes(phase) ? "ended" : "open", phase, revision: 1, artifactIds: [], progress, createdAt: 1, updatedAt: 1, reviewAttempts: 0, sourceMessageIds: [], cwd: "/tmp/deepbot-project" });

test("work dialog expands long cards, previews artifacts and hides stop when ended", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { workDetail: true, longCards: true } } });
 await app.waitFor("id:work-detail-w1");
 expect(app.count("id:work-detail-dialog >> id:cancel-work-w1")).toBe(1);
 expect(app.shows("text:停止")).toBe(false);
 expect(app.shows("label:关闭 Bot 信息")).toBe(true);
 await app.wait(400);
 try { await app.screenshot("/tmp/deepbot-cards-collapsed.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 for (const [id, title, tail] of [["work-detail-w1", "整理资料：用于检查长文卡片标题截断与展开的完整标题", "目标第四段"], ["work-progress-w1", "进度", "完整进度结尾"]]) {
  expect(app.shows(`label:展开${title}`)).toBe(true);
  await app.press(`id:${id}-toggle`);
  await app.waitFor(`label:收起${title}`);
  expect(app.shows(`label:收起${title}`)).toBe(true);
  expect(app.shows(`text:/${tail}/`)).toBe(true);
  try { await app.screenshot(`/tmp/deepbot-cards-${id}-expanded.png`); } catch (error) {
   if (!String(error).includes("a screenshot needs a real platform")) throw error;
  }
  await app.press(`id:${id}-toggle`);
  await app.waitFor(`label:展开${title}`);
  expect(app.shows(`label:展开${title}`)).toBe(true);
 }
 expect(app.shows("text:/完整产物结尾/")).toBe(false);
 await app.press("id:artifact-long-artifact");
 await app.waitFor("id:work-detail-dialog >> text:/完整产物结尾/");
 expect(app.shows("id:library-preview")).toBe(false);
 await app.press("id:work-preview-back");
 await app.waitFor("id:work-detail-w1");
 expect(app.shows("id:work-detail-w1")).toBe(true);
 await app.press("id:cancel-work-w1");
 await app.waitFor("text:已取消");
 expect(app.count("id:cancel-work-w1")).toBe(0);
 expect(app.shows("id:work-detail-dialog >> label:关闭")).toBe(true);
 try { await app.screenshot("/tmp/deepbot-cards-ended.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.press("id:work-detail-dialog >> label:关闭");
 await app.press("id:attention-q1-toggle");
 await app.waitFor("text:/完整动作结尾/");
 expect(app.enabled("id:attention-q1-option-批准")).toBe(true);
});

test("work detail dialog closes without replacing the activity list", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { workDetail: true } } });
 await app.waitFor("id:work-detail-w1");
 expect(app.count("id:bot-info >> id:work-detail-w1")).toBe(0);
 expect(app.shows("id:bot-info >> id:work-w1")).toBe(true);
 await app.wait(400);
 try { await app.screenshot("/tmp/deepbot-work-back-navigation.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 expect(app.count("id:bot-info-navigation >> label:关闭 Bot 信息")).toBe(1);
 await app.press("id:work-detail-dialog >> label:关闭");
 await app.waitFor("id:work-detail-dialog", { state: "gone" });
 await app.waitFor("id:work-w1");
 expect(app.shows("label:关闭 Bot 信息")).toBe(true);
 try { await app.screenshot("/tmp/deepbot-work-back-list.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
});

test("keeps the open assignee picker and expanded work details across progress updates", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { workDetail: true } } });
 const detail = work("w1", "running");
 await app.waitFor("id:work-detail-w1");
 await app.press("id:work-detail-w1-toggle");
 await app.waitFor("label:收起整理资料");
 await app.press("id:work-assignee");
 await app.waitFor("text:T3 Code");
 await app.host.send("agent", { type: "work.updated", work: {
  ...detail, title: "整理资料", phase: "review", progress: "后台更新验收进度", revision: 2,
 } });
 await app.waitFor("text:后台更新验收进度");
 expect(app.shows("text:T3 Code")).toBe(true);
 expect(app.shows("label:收起整理资料")).toBe(true);
});

test("closing the work dialog leaves panel closure as a separate action", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { workDetail: true } } });
 await app.waitFor("id:work-detail-w1");
 await app.wait(400);
 await app.press("id:work-detail-dialog >> label:关闭");
 await app.waitFor("id:work-detail-dialog", { state: "gone" });
 await app.press("label:关闭 Bot 信息");
 await app.waitFor("id:column-divider-1", { state: "gone" });
 expect(app.shows("id:composer-input")).toBe(true);
 await app.wait(400);
 try { await app.screenshot("/tmp/deepbot-work-detail-closed.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
});

test("work list separates every active and ended phase and moves updated works between groups", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux" });
 await app.waitFor("id:message-m1");
 for (const phase of ["queued", "running", "waiting", "review", "done", "failed", "cancelled"] as const) {
  await app.host.send("agent", { type: "work.updated", work: work(phase, phase) });
 }
 await app.press("id:bot-pill");
 await app.waitFor("id:works-ended-toggle");
 expect(app.count("id:works-ended")).toBe(0);
 await app.press("id:works-ended-toggle");
 await app.waitFor("id:works-ended");
 for (const phase of ["queued", "running", "waiting", "review", "done", "failed", "cancelled"] as const) {
  const group = ["done", "failed", "cancelled"].includes(phase) ? "ended" : "active";
  expect(app.count(`id:works-${group} >> id:work-${phase}`)).toBe(1);
  expect(app.count(`id:works-${group === "ended" ? "active" : "ended"} >> id:work-${phase}`)).toBe(0);
  expect(app.count(`id:work-${phase} >> id:work-${phase}-running`)).toBe(phase === "running" ? 1 : 0);
 }
 await app.host.send("agent", { type: "work.updated", work: work("running", "waiting") });
 await app.waitFor("id:work-running-running", { state: "gone" });
 await app.host.send("agent", { type: "work.updated", work: work("running", "running") });
 await app.waitFor("id:work-running-running");
 await app.host.send("agent", { type: "work.updated", work: work("running", "done") });
 await app.waitFor("id:works-ended >> id:work-running");
 expect(app.count("id:works-active >> id:work-running")).toBe(0);
 expect(app.count("id:work-running-running")).toBe(0);
 await app.host.send("agent", { type: "work.updated", work: work("running", "running") });
 await app.waitFor("id:works-active >> id:work-running");
 expect(app.count("id:works-ended >> id:work-running")).toBe(0);
 await app.press("id:bot-other");
 await app.waitFor("label:展开已结束");
 expect(app.count("id:works-ended")).toBe(0);
});

test("work list shows title-only rows and opens full content from both groups", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux" });
 await app.waitFor("id:message-m1");
 const runningTitle = "进行中事项：这是一段用于检查标题省略和状态动画位置的长标题";
 await app.host.send("agent", { type: "work.updated", work: { ...work("w1", "running"), title: runningTitle } });
 await app.host.send("agent", { type: "work.updated", work: work("done", "done") });
 await app.host.send("info-panel", true);
 await app.waitFor("id:work-w1");
 await app.wait(400);
 try {
  for (let frame = 1; frame <= 3; frame++) {
   await app.screenshot(`output/work-activity-collapsed-${frame}.png`);
   await app.wait(180);
  }
 } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 expect(app.texts().filter((text) => ["事项", "即将进行", "电脑", "已结束"].includes(text))).toEqual(["事项", "即将进行", "电脑", "已结束"]);
 expect(app.shows(`text:${runningTitle}`)).toBe(true);
 expect(app.shows("text:执行中")).toBe(false);
 expect(app.shows("text:/已核对当前执行进度/")).toBe(false);
 expect(app.count("id:work-w1 >> id:work-w1-running")).toBe(1);
 expect(app.shows("label:展开已结束")).toBe(true);
 expect(app.count("id:work-done")).toBe(0);
 for (const id of ["w1", "done"]) {
  if (id === "done") {
   await app.press("id:works-ended-toggle");
   await app.waitFor("id:works-ended >> id:work-done");
   expect(app.shows("label:收起已结束")).toBe(true);
   expect(app.shows("text:已交付")).toBe(false);
   expect(app.shows("text:/已核对当前执行进度/")).toBe(false);
   await app.wait(150);
   try { await app.screenshot("output/work-activity-expanded.png"); } catch (error) {
    if (!String(error).includes("a screenshot needs a real platform")) throw error;
   }
  }
  await app.press(`id:work-${id}`);
  await app.waitFor(`id:work-detail-${id}`);
  expect(app.count(`id:bot-info >> id:work-detail-${id}`)).toBe(0);
  expect(app.shows(`id:bot-info >> id:work-${id}`)).toBe(true);
  expect(app.count("id:bot-info-navigation >> label:关闭 Bot 信息")).toBe(1);
  expect(app.count(`id:work-detail-dialog >> id:cancel-work-${id}`)).toBe(id === "w1" ? 1 : 0);
  expect(app.shows("text:停止")).toBe(false);
  expect(app.count(`label:展开${id === "w1" ? runningTitle : "done事项标题"}`)).toBe(1);
  await app.press(`id:work-detail-${id}-toggle`);
  await app.press(`id:work-progress-${id}-toggle`);
  expect(app.shows("text:/目标第三段/")).toBe(true);
  expect(app.shows("text:/完整验收标准/")).toBe(true);
  expect(app.shows("text:/第四行：完整内容结尾/")).toBe(true);
  try { await app.screenshot(`output/work-activity-detail-${id}.png`); } catch (error) {
   if (!String(error).includes("a screenshot needs a real platform")) throw error;
  }
  await app.press("id:work-detail-dialog >> label:关闭");
  await app.waitFor("id:work-detail-dialog", { state: "gone" });
  await app.waitFor(`id:work-${id}`);
  expect(app.shows("label:关闭 Bot 信息")).toBe(true);
 }
 await app.press("id:works-ended-toggle");
 await app.waitFor("id:work-done", { state: "gone" });
 expect(app.shows("label:展开已结束")).toBe(true);

 await app.drag("id:column-divider-1", { x: 80, y: 0 });
 await app.wait(150);
 expect(app.shows("id:work-w1-running")).toBe(true);
 try { await app.screenshot("output/work-activity-narrow.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
});
