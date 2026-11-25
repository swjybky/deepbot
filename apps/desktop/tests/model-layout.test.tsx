import type { Bounds } from "nsh";
import { expect, open, test } from "nsh/test";
import { providerPresets } from "../ui/features/settings/models/model-options";
for (const editor of [false, true]) {
 test(`model layout renders ${editor ? "editor" : "provider list"} with project controls`, async () => {
  const app = await open("../ModelLayoutFixture.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { editor } } });
  if (editor) await app.host.send("edit-model");
  await app.waitFor(editor ? "id:model-editor" : "id:model-summary");
  if (editor) {
   const metrics = (): Record<string, Bounds> => JSON.parse(app.storage()["model-layout"] ?? "{}");
   await app.waitUntil(() => !!metrics().editor && !!metrics().provider && !!metrics().slot);
   const { editor, provider } = metrics();
   if (!editor || !provider) throw new Error("Missing model layout measurements");
   expect(editor.size.width).toBeGreaterThanOrEqual(provider.size.width - 34);
   expect(editor.size.width).toBeLessThanOrEqual(provider.size.width - 32);
   expect(app.value("id:model-name")).toBe("OpenAI 模型");
   expect(app.value("id:model-url")).toBe("https://api.openai.com/v1");
  } else {
   expect(app.shows(`text:${providerPresets.length} 个提供方 · ${providerPresets.length} 个模型`)).toBe(true);
   expect(app.shows("id:model-editor")).toBe(false);
  }
  try { await app.screenshot(`/tmp/deepbot-model-${editor ? "editor" : "list"}.png`); }
  catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
 });
}


test("inline Codex editor fills the provider content width", async () => {
 const app = await open("../ModelLayoutFixture.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { editor: true, modelIndex: 2 } } });
 await app.host.send("edit-model");
 const metrics = (): Record<string, Bounds> => JSON.parse(app.storage()["model-layout"] ?? "{}");
 await app.waitUntil(() => !!metrics().editor && !!metrics().provider);
 const { editor, provider } = metrics();
 if (!editor || !provider) throw new Error("Missing Codex editor layout measurements");
 expect(editor.size.width).toBeGreaterThanOrEqual(provider.size.width - 34);
 expect(editor.size.width).toBeLessThanOrEqual(provider.size.width - 32);
 try { await app.screenshot("/tmp/deepbot-model-codex-inline.png"); }
 catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
});
