import { expect, open, test } from "nsh/test";
import type { Bounds } from "nsh";
const desktop = { width: 1280, height: 800, platform: "linux" } as const;
const widths = (app: { storage(): Record<string, string> }) => {
 const metrics: Record<string, Bounds> = JSON.parse(app.storage()["column-layout"] ?? "{}");
 return { left: metrics.left?.size.width ?? 0, center: metrics.center?.size.width ?? 0, right: metrics.right?.size.width ?? 0 };
};

test("column panel keeps its content width while sliding and reverses repeated toggles", async () => {
 const app = await open("../ColumnLayoutFixture.tsx", { ...desktop, host: { params: { closed: true } } });
 await app.waitUntil(() => widths(app).center === 1000);
 // Closed content remains laid out at its expanded width, clipped offscreen.
 expect(widths(app).right).toBe(320);
 await app.host.send("info-panel", true);
 await app.wait(70);
 expect(widths(app).right).toBe(320);
 await app.host.send("info-panel", false);
 await app.wait(70);
 await app.host.send("info-panel", true);
 await app.wait(350);
 expect(widths(app)).toMatchObject({ left: 280, center: 680, right: 320 });
 await app.host.send("info-panel", false);
 await app.wait(350);
 expect(widths(app)).toMatchObject({ left: 280, center: 1000, right: 320 });
});

test("column panel opens and closes with reduced motion", async () => {
 const app = await open("../ColumnLayoutFixture.tsx", { ...desktop, reducedMotion: true, host: { params: { closed: true } } });
 await app.press("id:bot-pill");
 await app.waitFor("id:column-divider-1");
 expect(widths(app)).toMatchObject({ left: 280, center: 680, right: 320 });
 await app.press("label:关闭 Bot 信息");
 await app.waitFor("id:column-divider-1", { state: "gone" });
 expect(widths(app)).toMatchObject({ left: 280, center: 1000, right: 320 });
});

test("resizes both column dividers and retains widths when reopening the info panel", async () => {
 const app = await open("../ColumnLayoutFixture.tsx", desktop);
 await app.waitFor("id:column-divider-1");
 await app.waitUntil(() => widths(app).center > 0);
 expect(widths(app)).toMatchObject({ left: 280, center: 680, right: 320 });
 await app.drag("id:column-divider-0", { x: 80, y: 0 });
 await app.waitUntil(() => widths(app).left >= 359);
 expect(widths(app).right).toBe(320);
 await app.drag("id:column-divider-1", { x: -60, y: 0 });
 await app.waitUntil(() => widths(app).right >= 379);
 const resized = widths(app);
 expect(resized.center).toBeGreaterThanOrEqual(320);
 await app.host.send("info-panel", false);
 await app.waitFor("id:column-divider-1", { state: "gone" });
 await app.waitUntil(() => widths(app).center > resized.center + 370);
 expect(widths(app).left).toBe(resized.left);
 await app.drag("id:column-divider-0", { x: 40, y: 0 });
 const closedWidth = widths(app).left;
 expect(closedWidth).toBeGreaterThanOrEqual(resized.left + 39);
 await app.host.send("info-panel", true);
 await app.waitFor("id:column-divider-1");
 await app.waitUntil(() => Math.abs(widths(app).right - resized.right) < 1);
 expect(widths(app).left).toBe(closedWidth);
});

test("updates column widths before releasing a captured drag", async () => {
 const app = await open("../ColumnLayoutFixture.tsx", desktop);
 await app.waitFor("id:column-divider-0");
 await app.dragAndHold("id:column-divider-0", { x: 160, y: 0 });
 expect(widths(app).left).toBeGreaterThanOrEqual(439);
 await app.drop();
 const released = widths(app).left;
 await app.hover("id:composer-input");
 expect(widths(app).left).toBe(released);
});

test("column drags preserve minimum widths and the center absorbs window resizing", async () => {
 const app = await open("../ColumnLayoutFixture.tsx", desktop);
 await app.waitFor("id:column-divider-1");
 await app.drag("id:column-divider-0", { x: -600, y: 0 });
 await app.waitUntil(() => widths(app).left === 180);
 await app.drag("id:column-divider-1", { x: 600, y: 0 });
 await app.waitUntil(() => widths(app).right === 240);
 await app.drag("id:column-divider-0", { x: 1100, y: 0 });
 expect(widths(app).center).toBeGreaterThanOrEqual(320);
 expect(widths(app).right).toBeGreaterThanOrEqual(240);
 await app.setViewport(1600, 800);
 expect(widths(app).center).toBeGreaterThanOrEqual(639);
 await app.setViewport(900, 800);
 expect(widths(app).center).toBeGreaterThanOrEqual(319);
 expect(widths(app).left + widths(app).center + widths(app).right).toBeLessThanOrEqual(901);
});
