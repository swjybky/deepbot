import { expect, open, test } from "nsh/test";

test("library renders authorized file content, images and links from the whole row", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: {
  panelActions: true,
  infoTab: "library",
  previewText: "已核对三份交付材料，文件清单与归档记录一致。",
  previewImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAwUBAO+ip1sAAAAASUVORK5CYII=",
 } } });
 await app.waitFor("id:artifact-file-artifact");
 expect(app.shows("id:open-artifact-file-artifact")).toBe(false);
 expect(app.shows("id:artifact-file-artifact-toggle")).toBe(false);
 expect(app.shows("text:/已核对三份交付材料/")).toBe(false);
 await app.wait(400);
 await app.press("id:artifact-file-artifact");
 await app.waitFor("id:library-preview >> text:/已核对三份交付材料/");
 expect(app.shows("id:library-preview-text")).toBe(true);
 await app.wait(300);
 try { await app.screenshot("output/library-file-preview.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.press("id:library-preview >> label:关闭");
 await app.waitFor("id:library-preview", { state: "gone" });
 await app.waitFor("id:artifact-image-artifact");
 await app.press("id:artifact-image-artifact");
 await app.waitFor("id:library-preview-image");
 await app.wait(350);
 expect(app.shows("id:library-preview-image")).toBe(true);
 try { await app.screenshot("output/library-image-preview.png"); } catch (error) {
  if (!String(error).includes("a screenshot needs a real platform")) throw error;
 }
 await app.press("id:library-preview >> label:关闭");
 await app.waitFor("id:library-preview", { state: "gone" });
 await app.press("id:artifact-link-artifact");
 await app.waitFor("id:library-preview-url");
 expect(app.shows("id:library-preview >> text:https://nsh.dev")).toBe(true);
 expect(app.shows("id:library-preview >> text:打开链接")).toBe(true);
 expect(app.openedUrls()).toEqual([]);
 await app.press("id:library-preview >> label:关闭");
 await app.waitFor("id:library-preview", { state: "gone" });
 expect(app.shows("id:artifact-link-artifact")).toBe(true);
});

test("library preview shows a missing-file state and can be closed", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: {
  panelActions: true, infoTab: "library",
 } } });
 await app.waitFor("id:artifact-file-artifact");
 await app.wait(400);
 await app.press("id:artifact-file-artifact");
 await app.waitFor("id:library-preview >> text:找不到文件");
 expect(app.shows("id:library-preview-text")).toBe(false);
 await app.press("id:library-preview >> label:关闭");
 await app.waitFor("id:library-preview", { state: "gone" });
 expect(app.shows("id:artifact-file-artifact")).toBe(true);
});
