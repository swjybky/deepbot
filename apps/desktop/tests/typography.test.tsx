import { expect, open, test } from "nsh/test";
import type { TextLayoutLine } from "nsh";

test("reserves Chinese line height for every text token, including clamped and multiline text", async () => {
  const app = await open("../TypographyFixture.tsx", { width: 1280, height: 800, platform: "linux" });
  const metrics = (): Record<string, TextLayoutLine[]> => JSON.parse(app.storage().typography ?? "{}");
  await app.waitUntil(() => Object.keys(metrics()).length === 14);
  expect(app.storage()["typography-font"]).toBe("Noto Sans CJK SC");
  let native = true;
  try { await app.screenshot(); } catch (error) {
    if (!String(error).includes("a screenshot needs a real platform")) throw error;
    native = false;
  }
  const sizes: Record<string, number> = { caption: 12, meta: 12.5, label: 13, body: 14, message: 15, title: 16, heading: 20 };
  for (const [name, size] of Object.entries(sizes)) {
    expect(app.spanStyle(`id:${name}-clamped >> text:/消息/`).fontSize).toBe(size);
    expect(app.spanStyle(`id:${name}-multiline >> text:/发送结果/`).fontSize).toBe(size);
    const measured = metrics();
    const clamped = measured[`${name}-clamped`];
    const multiline = measured[`${name}-multiline`];
    if (!clamped || !multiline) throw new Error(`Missing line metrics for ${name}`);
    expect(clamped).toHaveLength(1);
    expect(multiline.length).toBeGreaterThanOrEqual(1);
    // NSH's headless engine approximates every line as 1.2em and ignores lineHeight.
    // Run with --target linux to check the real font metrics and line spacing.
    if (native) {
      expect(multiline).toHaveLength(2);
      for (const line of [...clamped, ...multiline]) {
        expect(line.bounds.size.height).toBeGreaterThanOrEqual(size * 1.5 - 0.01);
      }
      const [first, second] = multiline;
      if (!first || !second) throw new Error(`Missing native multiline metrics for ${name}`);
      expect(second.bounds.origin.y - first.bounds.origin.y).toBeGreaterThanOrEqual(size * 1.5 - 0.01);
    }
  }
});
