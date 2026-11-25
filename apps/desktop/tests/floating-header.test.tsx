import { expect, open, test } from "nsh/test";

test("floating bot pill stays clickable above scrolling conversation", async () => {
  const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { floatingHeader: true } } });
  await app.waitFor("id:message-floating-13");
  await app.scroll("id:message-floating-13", -280);
  expect(app.shows("id:bot-pill")).toBe(true);
  try { await app.screenshot("/tmp/deepbot-floating-header.png"); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
  await app.press("id:bot-pill");
  await app.waitFor("id:bot-info");
  await app.press("id:bot-pill");
  await app.waitFor("id:bot-info", { state: "gone" });
});
