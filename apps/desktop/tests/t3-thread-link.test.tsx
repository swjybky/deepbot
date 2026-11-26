import { expect, open, test } from "nsh/test";

const webUrl = "https://app.t3.codes/threads/test-environment/mcp%3Atest-thread";
const desktopUrl = "t3code://threads/test-environment/mcp%3Atest-thread";
const desktop = "id:t3-open-desktop";
const browser = "id:t3-open-browser";
const fixture = (params: Record<string, string | boolean> = {}) => open("../FixtureApp.tsx", {
 width: 1280, height: 900, platform: "linux", host: { params: { t3ThreadLink: true, ...params } },
});

test("T3 thread link opens the original environment and thread from chat and work detail", async () => {
 const app = await fixture();
 await app.waitFor(desktop);
 await app.press(desktop);
 await app.waitUntil(() => app.openedUrls().length === 1);
 expect(app.openedUrls()).toEqual([desktopUrl]);
 expect(app.shows(browser)).toBe(false);
 await app.press("text:打开对方页面");
 await app.waitUntil(() => app.openedUrls().length === 2);
 expect(app.openedUrls()[1]).toBe("https://example.com/article");

 const detail = await fixture({ workDetail: true });
 const detailButton = `id:work-detail-dialog >> ${desktop}`;
 await detail.waitFor(detailButton);
 await detail.press(detailButton);
 await detail.waitUntil(() => detail.openedUrls().length === 1);
 expect(detail.openedUrls()).toEqual([desktopUrl]);
});

test("T3 thread link falls back only after explicit browser selection", async () => {
 for (const params of [{ t3RemoteLink: true }, { t3NonlocalEndpoint: true }, { t3UnmappedLink: true }]) {
  const app = await fixture(params);
  await app.waitFor(desktop);
  expect(app.shows(browser)).toBe(false);
  await app.press(desktop);
  await app.waitFor(browser);
  expect(app.shows("id:feedback-error")).toBe(true);
  expect(app.openedUrls()).toEqual([]);
  await app.press(browser);
  await app.waitUntil(() => app.openedUrls().length === 1);
  expect(app.openedUrls()).toEqual([webUrl]);
 }
});

test("T3 thread link refuses mismatched thread IDs and unsafe fallback URLs", async () => {
 for (const params of [{ t3ThreadId: "other-thread" }, { t3ThreadLink: "https://user:secret@example.com/threads/environment/mcp%3Atest-thread" }]) {
  const app = await fixture(params);
  await app.waitFor(desktop);
  await app.press(desktop);
  await app.waitFor("id:feedback-error");
  expect(app.shows(browser)).toBe(false);
  expect(app.openedUrls()).toEqual([]);
 }
});

test("T3 thread link keeps its fallback across updates and removes it when resolved", async () => {
 const app = await fixture({ workDetail: true, t3RemoteLink: true });
 const inDetail = "id:work-detail-dialog >> ";
 await app.waitFor(inDetail + desktop);
 await app.press(inDetail + desktop);
 await app.waitFor(inDetail + browser);
 await app.host.send("agent", { type: "attention.opened", attention: {
  id: "t3-link", botId: "xiaocai", threadId: "dm:xiaocai", workId: "w1", assignmentId: "a1",
  question: "更新后的待回复请求", kind: "external", state: "open", options: [], createdAt: 2,
  remoteRequest: { kind: "external" }, externalUrl: webUrl,
 } });
 await app.waitFor(inDetail + "text:更新后的待回复请求");
 expect(app.shows(inDetail + browser)).toBe(true);
 await app.host.send("agent", { type: "attention.resolved", attentionId: "t3-link" });
 await app.waitFor(inDetail + desktop, { state: "gone" });
 expect(app.shows(inDetail + browser)).toBe(false);
});
