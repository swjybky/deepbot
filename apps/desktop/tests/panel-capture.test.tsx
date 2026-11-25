import { open, test } from "nsh/test";
test("capture panel animation without driver steps between toggles", async () => {
 const app = await open("../FixtureApp.tsx", { width: 1280, height: 800, platform: "linux", host: { params: { floatingHeader: true, panelMotion: true } } });
 await app.wait(13000);
});
