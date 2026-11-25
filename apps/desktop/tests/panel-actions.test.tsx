import { expect, open, test } from "nsh/test";

// Each tab opens from a fixture param: native clicks on Linux are not reliable enough to switch tabs (ERR-006).
for (const [tab, ready] of [["activity", "text:每日整理"], ["library", "text:资料汇总.md"], ["configuration", "id:bot-configuration"]] as const) {
 test(`bot info ${tab} tab renders its actions natively`, async () => {
  const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { panelActions: true, infoTab: tab } } });
  await app.waitFor(ready);
  expect(app.shows(ready)).toBe(true);
  await app.wait(400);
  try { await app.screenshot(`/tmp/deepbot-panel-${tab}.png`); } catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 });
}
