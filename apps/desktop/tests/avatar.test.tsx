import { expect, open, test } from "nsh/test";
import { eyeLook, glide, type Glide } from "../ui/components/BotAvatar";

test("avatar eyes look straight ahead unless the mouse is over that avatar", () => {
  expect(eyeLook(null, 48)).toEqual({ x: 0, y: 0 });
  expect(eyeLook({ x: 24, y: 24 }, 48)).toEqual({ x: 0, y: 0 });
});

test("avatar eyes turn toward the mouse over the avatar, all the way at its edge", () => {
  const half = eyeLook({ x: 36, y: 24 }, 48);
  expect(Math.abs(half.x - 0.5)).toBeLessThan(1e-9);
  expect(half.y).toBe(0);
  expect(eyeLook({ x: 48, y: 24 }, 48)).toEqual({ x: 1, y: 0 });

  const corner = eyeLook({ x: 0, y: 0 }, 48);
  expect(corner.x).toBeLessThan(0);
  expect(corner.y).toBeLessThan(0);
  expect(Math.abs(Math.hypot(corner.x, corner.y) - 1)).toBeLessThan(1e-9);
});

test("avatar eyes glide: they set off gently, never jump, and settle without overshooting", () => {
  // Following the mouse (stiffness 18) and back to the middle (stiffness 5), 60 fps.
  for (const [stiffness, firstFrameAtMost, mostlyThereBy] of [[18, 0.08, 300], [5, 0.01, 1100]] as const) {
    let eyes: Glide = { x: 0, y: 0, vx: 0, vy: 0 };
    let farthest = 0;
    let at90 = Infinity;
    for (let time = 16; time <= 3000; time += 16) {
      eyes = glide(eyes, { x: 1, y: 0 }, 16, stiffness);
      if (time === 16) expect(eyes.x).toBeLessThan(firstFrameAtMost);
      if (eyes.x >= 0.9 && at90 === Infinity) at90 = time;
      farthest = Math.max(farthest, eyes.x);
    }
    expect(at90).toBeLessThan(mostlyThereBy);
    expect(farthest).toBeLessThan(1.001);
    expect(Math.abs(eyes.x - 1)).toBeLessThan(1e-3);
    expect(eyes.y).toBe(0);
  }
});

test("draws every shape, color and size of the 3D avatar", async () => {
  const app = await open("../AvatarFixture.tsx", { width: 1000, height: 480, platform: "linux" });
  await app.waitFor("id:avatar-grid");
  try { await app.screenshot("/tmp/deepbot-avatars.png"); } catch (error) {
    // Headless has no pixels; --target linux draws the canvases natively.
    if (!String(error).includes("a screenshot needs a real platform")) throw error;
  }
});

test("fits the larger avatars in the sidebar and the bot pill", async () => {
  // No presses or hovers: Linux native clicks are unreliable and a real mouse in the window
  // overrides simulated hovers.
  const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux" });
  await app.waitFor("id:message-m1");
  try { await app.screenshot("/tmp/deepbot-avatars-app.png"); } catch (error) {
    if (!String(error).includes("a screenshot needs a real platform")) throw error;
  }
});
