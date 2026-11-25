import { expect, open, test } from "nsh/test";

const desktop = { width: 1280, height: 800, platform: "linux" } as const;

test("shows thinking dots only for the pending conversation and removes them when the reply ends", async () => {
  const app = await open("../FixtureApp.tsx", desktop);
  await app.waitFor("id:bot-typing");
  expect(app.shows("text:正在处理")).toBe(true);
  for (let index = 0; index < 3; index++) expect(app.count(`id:thinking-dot-${index}`)).toBe(1);
  expect(app.enabled("id:composer-input")).toBe(true);

  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: true, chatActivity: "tool", messages: [] });
  await app.waitFor("text:正在使用工具");
  await app.press("id:bot-other");
  await app.waitFor("text:给 另一个 Bot 发消息");
  expect(app.shows("id:bot-typing")).toBe(false);
  await app.press("label:打开 小菜");
  await app.waitFor("text:正在使用工具");
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [] });
  await app.waitFor("id:bot-typing", { state: "gone" });
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: true, chatActivity: "reply", messages: [] });
  await app.waitFor("text:正在组织回复");
  expect(app.count("id:bot-typing")).toBe(1);
});

test("keeps the thinking status readable with reduced motion", async () => {
  const app = await open("../FixtureApp.tsx", { ...desktop, reducedMotion: true });
  await app.waitFor("id:bot-typing");
  expect(app.shows("text:正在处理")).toBe(true);
  expect(app.shows("id:thinking-dot-0")).toBe(true);
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [] });
  await app.waitFor("id:bot-typing", { state: "gone" });
});

test("keeps thinking animated across repeated cycles", async () => {
  const app = await open("../FixtureApp.tsx", { ...desktop, clock: {} });
  await app.waitFor("id:bot-typing");
  await app.clock!.runFor(100);
  let first: Uint8Array | undefined;
  try { first = await app.screenshot(); } catch (error) {
    // Headless has no pixels; --target linux verifies the native animation.
    if (!String(error).includes("a screenshot needs a real platform")) throw error;
  }
  await app.clock!.runFor(160);
  if (first) {
    const second = await app.screenshot();
    expect(first.length !== second.length || first.some((value, index) => value !== second[index])).toBe(true);
  }
  await app.clock!.runFor(2400);
  expect(app.shows("id:bot-typing")).toBe(true);
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [] });
  await app.waitFor("id:bot-typing", { state: "gone" });
});
