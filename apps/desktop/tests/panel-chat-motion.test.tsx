import { expect, open, test } from "nsh/test";

test("panel motion keeps long chat settled during horizontal sliding", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { floatingHeader: true } } });
 await app.waitFor("id:message-floating-13");
 const shot = async (name: string) => {
  try { await app.screenshot(`/tmp/deepbot-panel-chat-${name}.png`); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 };
 await app.wait(350);
 await shot("closed");
 await app.host.send("info-panel", true);
 await app.wait(35);
 await shot("opening-1");
 await app.wait(45);
 await shot("opening-2");
 await app.wait(350);
 await shot("open");
 expect(app.shows("id:message-floating-13")).toBe(true);
 await app.host.send("info-panel", false);
 await app.wait(35);
 await shot("closing-1");
 expect(app.shows("id:message-floating-13")).toBe(true);
 await app.wait(45);
 await shot("closing-2");
 await app.wait(350);
 await shot("closed-again");
 await app.host.send("info-panel", true);
 await app.wait(70);
 await app.host.send("info-panel", false);
 await app.wait(70);
 await app.host.send("info-panel", true);
 await app.wait(350);
 expect(app.shows("id:column-divider-1")).toBe(true);
 await shot("reversed-open");
});
