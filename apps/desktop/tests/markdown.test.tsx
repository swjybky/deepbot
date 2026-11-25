import { expect, open, test } from "nsh/test";
import { keepLineBreaks } from "../ui/components/MarkdownText";

const desktop = { width: 1280, height: 800, platform: "linux" } as const;
const reply = "执行者其实是三个：\n\n- **我自己（self）**——直接动手\n- **t3code**——代码活重\n\n一句话：小活我上，\n重活派出去。\n\n看 [文档](https://nsh.dev) 和 `read_file`";

test("renders Markdown in bot replies and keeps plain replies and user messages as written", async () => {
  const app = await open("../FixtureApp.tsx", desktop);
  await app.waitFor("id:message-m1");
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [
    { id: "m2", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text: reply, createdAt: 2, requestId: "fixture-m2" },
    { id: "m3", threadId: "dm:xiaocai", author: { kind: "person", id: "me" }, kind: "text", text: "**原样** 显示", createdAt: 3, requestId: "fixture-m3" },
  ] });
  await app.waitFor("id:message-markdown-m2");
  expect(app.shows("text:/\\*\\*我自己/")).toBe(false);
  expect(app.spanStyle("id:message-markdown-m2 >> text:我自己（self）").fontWeight).toBeGreaterThanOrEqual(600);
  expect(app.spanStyle("id:message-markdown-m2 >> text:——直接动手").fontWeight).toBe(500);
  expect(app.spanStyle("id:message-content-m3 >> text:**原样** 显示").fontWeight).toBe(500);
  expect(app.spanStyle("id:message-markdown-m2 >> text:执行者其实是三个：").fontSize).toBe(15);
  expect(app.shows("text:**原样** 显示")).toBe(true);
  expect(app.shows("id:message-markdown-m3")).toBe(false);
  await app.wait(400);
  try { await app.screenshot("/tmp/deepbot-message-weight.png"); } catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
  await app.press("id:message-markdown-m2 >> text:文档");
  expect(app.openedUrls()).toEqual(["https://nsh.dev"]);
});

test("keeps single line breaks outside fenced code", () => {
  expect(keepLineBreaks("一\n二\n\n三")).toBe("一  \n二\n\n三");
  expect(keepLineBreaks("代码：\n```\na\nb\n```\n完")).toBe("代码：  \n```\na\nb\n```\n完");
});

test("sends historical Markdown file links as paths scoped to the clicked message", async () => {
  const app = await open("../FixtureApp.tsx", desktop);
  await app.waitFor("id:message-m1");
  const screenshot = "/tmp/deepbot-project/screenshot.png";
  const text = [
    `[截图](${screenshot})`,
    "[报告](</tmp/deepbot-project/交付 报告.md:12>)",
    "[副本](/tmp/deepbot-project/report%20copy.md:12:2)",
  ].join("\n\n");
  await app.host.send("agent", { type: "thread.delta", threadId: "dm:xiaocai", typing: false, messages: [
    { id: "file-links", threadId: "dm:xiaocai", author: { kind: "bot", id: "xiaocai" }, kind: "text", text, createdAt: 2, requestId: "fixture-links" },
  ] });
  for (const label of ["截图", "报告", "副本"]) {
    const link = `id:message-markdown-file-links >> text:${label}`;
    await app.waitFor(link);
    await app.press(link);
  }
  const commands = JSON.parse(app.storage().commands ?? "[]") as { type: string; messageId?: string; path?: string }[];
  expect(commands.filter(c => c.type === "message.open-file").map(c => [c.messageId, c.path])).toEqual([
    ["file-links", screenshot],
    ["file-links", "/tmp/deepbot-project/交付 报告.md"],
    ["file-links", "/tmp/deepbot-project/report copy.md"],
  ]);
  expect(app.openedUrls()).toEqual([]);
});
