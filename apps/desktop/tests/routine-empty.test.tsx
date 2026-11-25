import { expect, open, test } from "nsh/test";

test("routine empty card renders in the native info panel", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux", host: { params: { routinePanel: true } } });
 await app.waitFor("id:routines-empty");
 await app.wait(400);
 expect(app.shows("id:routines-empty >> text:暂无例行")).toBe(true);
 try { await app.screenshot("/tmp/deepbot-routines-empty-native.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
});

test("routine empty card opens management and follows the current bot routines", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 1000, platform: "linux" });
 await app.waitFor("id:message-m1");
 await app.host.send("info-panel", true);
 await app.waitFor("id:routines-empty");
 await app.wait(400); // Let the info panel finish sliding before native pointer input and screenshots.
 expect(app.shows("id:routines-empty >> text:暂无例行")).toBe(true);
 expect(app.shows("text:管理例行")).toBe(false);
 try { await app.screenshot("/tmp/deepbot-routines-empty.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.hover("id:routines-empty");
 await app.wait(130);
 await app.press("id:routines-empty");
 await app.waitFor("id:routine-name");
 expect(app.shows("id:bot-configuration-dialog >> id:bot-config-routines-editor")).toBe(true);
 expect(app.shows("id:settings")).toBe(false);
 try { await app.screenshot("/tmp/deepbot-bot-config-routine-empty.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.type("id:routine-name", "每日整理");
 await app.type("id:routine-prompt", "整理资料");
 await app.press("id:routine-add");
 const routineId = JSON.parse(app.storage().commands ?? "[]").at(-1).routine.id;
 expect(JSON.parse(app.storage().commands ?? "[]").at(-1)).toMatchObject({ type: "routine.upsert", routine: { botId: "xiaocai", name: "每日整理", prompt: "整理资料", enabled: true } });
 await app.waitFor("label:每日整理");
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.waitFor("id:bot-configuration-dialog", { state: "gone" });
 await app.waitFor("text:每日整理");
 expect(app.shows("id:routines-empty")).toBe(false);
 expect(app.shows("label:每日整理")).toBe(true);
 await app.press("label:每日整理");
 expect(JSON.parse(app.storage().commands ?? "[]").at(-1)).toMatchObject({ type: "routine.upsert", routine: { id: routineId, enabled: false } });
 await app.press("text:管理例行");
 await app.waitFor("text:每日整理");
 expect(app.shows("id:bot-configuration-dialog >> id:bot-config-routines-editor")).toBe(true);
 try { await app.screenshot("/tmp/deepbot-bot-config-routine-saved.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.press("id:bot-other");
 await app.waitFor("id:routines-empty");
 expect(app.shows("text:每日整理")).toBe(false);
 await app.press("id:routines-empty");
 await app.waitFor("id:routine-name");
 expect(app.shows("text:每日整理")).toBe(false);
 expect(app.value("id:routine-name") ?? "").toBe("");
 await app.press("id:bot-configuration-dialog >> label:关闭");
 await app.press("id:bot-xiaocai");
 await app.waitFor("text:每日整理");
 expect(app.shows("id:routines-empty")).toBe(false);
});
