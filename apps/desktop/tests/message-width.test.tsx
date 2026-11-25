import { expect, open, test } from "nsh/test";

// Real AppShell and protocol projection; isolated messages, no user data or sidecar.
test("reply bubbles follow the chat width across window and panel resizing", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux" });
 await app.waitFor("id:message-m1");
 await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [
  { id: "width-user-long", threadId: "dm:xiaocai", author: { kind: "person", id: "me" }, kind: "text", text: "请整理这个项目最近的提交记录，列出提交时间范围和主要改动。请按功能分组，给出每组的代表性提交，并把需要继续跟进的事项列在最后。", createdAt: 2, requestId: "fixture-width-user-long" },
  { id: "width-long", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text: "**项目提交记录**\n\n已按功能归纳近期提交，并把每一组的代表性改动和需要跟进的事项单独列出。窗口变窄时，正文会自然换行，保留左右边距和回复按钮的位置。\n\n`git log --oneline` · [文档](https://nsh.dev)", createdAt: 3, requestId: "fixture-width-long" },
  { id: "width-user", threadId: "dm:xiaocai", author: { kind: "person", id: "me" }, kind: "text", text: "请展示完整结果", createdAt: 4, requestId: "fixture-width-user" },
  { id: "width-short", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text: "收到，已整理", createdAt: 5, requestId: "fixture-width-short" },
 ] });
 await app.waitFor("id:message-content-width-short");
 const shot = async (name: string) => {
  await app.wait(350);
  try { await app.screenshot(`/tmp/deepbot-message-cap-${name}.png`); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 };
 await shot("1280");
 await app.setViewport(1600, 800);
 await shot("1600");
 await app.setViewport(900, 800);
 await shot("900");
 await app.host.send("info-panel", true);
 await app.waitFor("id:column-divider-1");
 await shot("panel");
});

test("long message wrapping stops changing at the width cap for both roles", async () => {
 const app = await open("../MessageWidthFixture.tsx", { width: 660, height: 800, platform: "linux" });
 const heights = () => ({
  reply: Number(app.storage()["reply-height"] ?? 0),
  question: Number(app.storage()["question-height"] ?? 0),
 });
 await app.waitUntil(() => heights().reply > 0 && heights().question > 0);
 const initial = heights();
 await app.setViewport(1100, 800);
 const wide = heights();
 await app.setViewport(1500, 800);
 expect(heights()).toEqual(wide);
 expect(wide.reply).toBeLessThan(initial.reply);
 expect(wide.question).toBeLessThan(initial.question);
 await app.setViewport(360, 800);
 expect(heights().reply).toBeGreaterThan(initial.reply);
 expect(heights().question).toBeGreaterThan(initial.question);
 await app.setViewport(660, 800);
 expect(heights()).toEqual(initial);
});


test("reply width remains contained with the information panel open", async () => {
 const app = await open("../FixtureApp.tsx", { width: 900, height: 800, platform: "linux", host: { params: { routinePanel: true, floatingHeader: true } } });
 await app.waitFor("id:column-divider-1");
 await app.setViewport(900, 800);
 await app.wait(400);
 try { await app.screenshot("/tmp/deepbot-reply-width-panel.png"); }
 catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 expect(app.shows("id:composer-input")).toBe(true);
});
