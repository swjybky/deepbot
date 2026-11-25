import { expect, open, test } from "nsh/test";
const options = { width: 1280, height: 800, platform: "linux" as const };
async function shot(app: Awaited<ReturnType<typeof open>>, name: string) {
  try { await app.screenshot(`/tmp/deepbot-sidebar-${name}.png`); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
}
test("sidebar drags bots between pinned and ordinary zones", async () => {
  const app = await open("../FixtureApp.tsx", options);
  await app.wait(2000);
  await shot(app, "before");
  await app.drag("id:bot-other", { x: 0, y: -110 });
  await app.waitFor("id:sidebar-pinned-zone >> id:bot-other");
  await shot(app, "pinned");
  await app.drag("id:bot-xiaocai", { x: 0, y: 210 });
  await app.waitFor("id:sidebar-list-zone >> id:bot-xiaocai");
  await shot(app, "unpinned");
  await app.drag("id:bot-other", { x: 0, y: 210 });
  await app.waitFor("id:sidebar-list-zone >> id:bot-other");
  await shot(app, "empty-pins");
  expect(app.shows("id:sidebar-pinned-zone")).toBe(false);
  expect(app.shows("text:拖到这里置顶")).toBe(false);
  await app.drag("id:bot-other", { x: 0, y: -40 });
  await app.waitFor("id:sidebar-pinned-zone >> id:bot-other");
});
test("sidebar drag previews and outside drops preserve selection and pin state", async () => {
  const app = await open("../FixtureApp.tsx", options);
  await app.dragAndHold("id:bot-other", { x: 0, y: 80 });
  await app.waitFor("id:sidebar-drag-preview");
  expect(app.shows("text:松开移到普通列表")).toBe(false);
  expect(app.shows("text:拖到列表取消置顶")).toBe(false);
  await app.drop();
  expect(app.shows("id:sidebar-drag-preview")).toBe(false);
  expect(app.shows("id:sidebar-list-zone >> id:bot-other")).toBe(true);
  await app.drag("id:bot-other", { x: 400, y: -80 });
  expect(app.shows("id:sidebar-list-zone >> id:bot-other")).toBe(true);
  await app.press("id:bot-other");
  expect(app.shows("id:bot-pill >> text:另一个 Bot")).toBe(true);
});
test("sidebar supports pin dragging with reduced motion", async () => {
  const app = await open("../FixtureApp.tsx", { ...options, reducedMotion: true });
  await app.drag("id:bot-other", { x: 0, y: -110 });
  await app.waitFor("id:sidebar-pinned-zone >> id:bot-other");
});

test("empty pinned zone opens only during dragging and collapses after an outside drop", async () => {
  const app = await open("../FixtureApp.tsx", options);
  await app.drag("id:bot-xiaocai", { x: 0, y: 210 });
  await app.waitFor("id:sidebar-list-zone >> id:bot-xiaocai");
  expect(app.shows("id:sidebar-pinned-zone")).toBe(false);
  await app.dragAndHold("id:bot-other", { x: 400, y: 80 });
  expect(app.shows("id:sidebar-pinned-zone")).toBe(true);
  await app.drop();
  expect(app.shows("id:sidebar-pinned-zone")).toBe(false);
  expect(app.shows("id:sidebar-list-zone >> id:bot-other")).toBe(true);
  await app.dragAndHold("id:bot-other", { x: 0, y: -40 });
  expect(app.shows("id:sidebar-pinned-zone")).toBe(true);
  await app.drop();
  await app.waitFor("id:sidebar-pinned-zone >> id:bot-other");
});

test("dragging the selected bot outside keeps the open conversation and restores the source", async () => {
  const app = await open("../FixtureApp.tsx", options);
  await app.dragAndHold("id:bot-xiaocai", { x: 400, y: 210 });
  expect(app.shows("id:bot-pill >> text:小菜")).toBe(true);
  await app.drop();
  expect(app.shows("id:sidebar-drag-preview")).toBe(false);
  expect(app.shows("id:sidebar-pinned-zone >> id:bot-xiaocai")).toBe(true);
  await app.drag("id:bot-xiaocai", { x: 0, y: 210 });
  await app.waitFor("id:sidebar-list-zone >> id:bot-xiaocai");
  await app.dragAndHold("id:bot-xiaocai", { x: 400, y: -80 });
  expect(app.shows("id:bot-pill >> text:小菜")).toBe(true);
  await app.drop();
  expect(app.shows("id:sidebar-drag-preview")).toBe(false);
  expect(app.shows("id:sidebar-list-zone >> id:bot-xiaocai")).toBe(true);
});
