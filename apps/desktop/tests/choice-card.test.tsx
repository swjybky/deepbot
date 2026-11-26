import { expect, open, test } from "nsh/test";

const desktop = { width: 1280, height: 800, platform: "linux", host: { params: { choiceCards: true } } } as const;
const commands = (app: { storage(): Record<string, string> }): Record<string, unknown>[] => JSON.parse(app.storage().commands ?? "[]");
const shot = async (app: Awaited<ReturnType<typeof open>>, path: string) => {
 try { await app.screenshot(path); } catch (error) { if (!String(error).includes("a screenshot needs a real platform")) throw error; }
};

test("choice cards list lettered options", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:attention-q2");
 for (const [letter, option] of [["A", "是，正在推进"], ["B", "已完成"], ["C", "遇到卡点"], ["D", "已转做其他任务"], ["E", "其他"]]) {
  expect(app.shows(`text:${letter}`)).toBe(true);
  if (option !== "其他") expect(app.shows(`id:attention-q2-option-${option}`)).toBe(true);
 }
 expect(app.shows("id:attention-q2-input")).toBe(true);
 expect(app.shows("text:你现在还在推进水产设计和智能体迁移吗？")).toBe(true);
 expect(app.shows("id:attention-q2-submit")).toBe(false);
 await app.wait(400);
 await shot(app, "/tmp/deepbot-choice-open.png");
 await app.hover("id:attention-q2-option-遇到卡点");
 await app.wait(200);
 await shot(app, "/tmp/deepbot-choice-hover.png");
});

test("choosing an option answers once and keeps only the chosen row", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:attention-q2");
 // Let the native window finish its first paint before pressing (ERR-006).
 await app.wait(400);
 await app.press("id:attention-q2-option-遇到卡点");
 await app.waitFor("id:attention-q2-answer");
 const replies = commands(app).filter((c) => c.type === "attention.reply");
 expect(replies).toHaveLength(1);
 expect(replies[0]).toMatchObject({ attentionId: "q2", value: "遇到卡点" });
 expect(app.shows("id:attention-q2-answer >> text:遇到卡点")).toBe(true);
 expect(app.shows("id:attention-q2-answer >> text:C")).toBe(true);
 for (const gone of ["是，正在推进", "已完成", "已转做其他任务", "其他"]) expect(app.shows(`id:attention-q2 >> text:${gone}`)).toBe(false);
 expect(app.count("id:attention-q2-input")).toBe(0);
 await app.wait(300);
 await shot(app, "/tmp/deepbot-choice-answered.png");
});

test("the 其他 row sends typed text as the answer", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 await app.waitFor("id:attention-q1");
 await app.type("id:attention-q1-input", "改天再发");
 await app.waitFor("id:attention-q1-submit");
 await app.wait(200);
 await shot(app, "/tmp/deepbot-choice-other-typed.png");
 await app.press("id:attention-q1-submit");
 await app.waitFor("id:attention-q1-answer");
 expect(commands(app).find((c) => c.type === "attention.reply")).toMatchObject({ attentionId: "q1", value: "改天再发" });
 expect(app.shows("id:attention-q1-answer >> text:改天再发")).toBe(true);
 expect(app.shows("id:attention-q1-answer >> text:C")).toBe(true);
 for (const gone of ["批准", "拒绝"]) expect(app.shows(`id:attention-q1 >> text:${gone}`)).toBe(false);
 await app.wait(300);
 await shot(app, "/tmp/deepbot-choice-other-answered.png");
});

test("an answered choice card retains expansion through full snapshots", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { longCards: true } } });
 const expand = "id:attention-q1 >> label:展开需要你批准";
 const collapse = "id:attention-q1 >> label:收起需要你批准";
 await app.waitFor(expand);
 await app.wait(400);
 await app.press(expand);
 await app.waitFor(collapse);
 await app.press("id:attention-q1-option-批准");
 await app.waitFor("id:attention-q1-answer");
 expect(app.shows(collapse)).toBe(true);
 await app.host.send("refresh-snapshot", null);
 expect(app.shows(collapse)).toBe(true);
 expect(app.shows("text:/完整动作结尾/")).toBe(true);
 await app.press(collapse);
 await app.waitFor(expand);
 await app.host.send("refresh-snapshot", null);
 expect(app.shows(expand)).toBe(true);
});

test("remote questions update in place and keep expansion by question id", async () => {
 const app = await open("../FixtureApp.tsx", desktop);
 const question = {
  id: "first",
  question: "请选择\n详细说明第一段\n详细说明第二段",
  options: [{ label: "继续", value: "continue" }],
 };
 const next = { ...question, id: "second", question: "请确认\n下一题详细说明\n下一题全文结尾" };
 const update = (questions: (typeof question)[]) => app.host.send("agent", {
  type: "attention.opened",
  attention: {
   id: "remote-expansion", botId: "xiaocai", threadId: "dm:xiaocai", kind: "decision",
   question: "请确认", options: [], state: "open", createdAt: 3, remoteRequest: { kind: "question", questions },
  },
 });
 const expand = "label:展开T3 Code 提问";
 const collapse = "label:收起T3 Code 提问";
 await app.waitFor("id:attention-q1");
 await update([question]);
 await app.waitFor(expand);
 await app.wait(400);
 await app.press(expand);
 await app.waitFor(collapse);
 await update([{ ...question, question: question.question + "\n刷新后的全文结尾" }]);
 await app.waitFor("text:/刷新后的全文结尾/");
 expect(app.shows(collapse)).toBe(true);
 await update([next]);
 await app.waitFor(expand);
 expect(app.shows(collapse)).toBe(false);

 await update([question, next]);
 const first = "id:attention-remote-expansion-first";
 const second = "id:attention-remote-expansion-second";
 await app.waitFor(`${first} >> ${expand}`);
 await app.press(`${first} >> ${expand}`);
 await app.waitFor(`${first} >> ${collapse}`);
 await update([{ ...question, question: question.question + "\n多题刷新后的全文结尾" }, next]);
 await app.waitFor("text:/多题刷新后的全文结尾/");
 expect(app.shows(`${first} >> ${collapse}`)).toBe(true);
 expect(app.shows(`${second} >> ${expand}`)).toBe(true);
});

test("conversation accents take a darker bot color under white text", async () => {
 for (const [color, file] of [["#F0283C", "red"], ["#9EC5A7", "light"]] as const) {
  const text = "#ffffffff";
  const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { choiceCards: true, botColor: color } } });
  await app.waitFor("id:attention-q2");
  expect(app.spanStyle("id:message-content-m1 >> text:整理资料").color.toLowerCase()).toBe(text);
  await app.type("id:composer-input", "收到");
  expect(app.spanStyle("id:composer-send >> text:发送").color.toLowerCase()).toBe(text);
  await app.wait(400);
  await app.press("id:attention-q2-option-遇到卡点");
  await app.waitFor("id:attention-q2-answer");
  expect(app.spanStyle("id:attention-q2-answer >> text:C").color.toLowerCase()).toBe(text);
  await app.wait(300);
  await shot(app, `/tmp/deepbot-accent-${file}.png`);
 }
});

test("settings switches stay neutral whatever the bot color", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { botColor: "#F0283C", permissionPage: true } } });
 await app.waitFor("text:权限");
 await app.wait(400);
 await shot(app, "/tmp/deepbot-accent-settings.png");
});

test("T3 requests render real choices and keep answers on the same card", async () => {
 const app = await open("../FixtureApp.tsx", { ...desktop, host: { params: { t3Cards: "after" } } });
 await app.waitFor("id:attention-t3-question");
 await app.wait(400);
 await shot(app, "/tmp/deepbot-t3-requests-open.png");
 expect(app.count("id:attention-t3-approval")).toBe(1);
 expect(app.shows("id:attention-t3-approval-input")).toBe(false);
 expect(app.shows("text:git push origin release")).toBe(true);
 expect(app.enabled("id:attention-t3-question-send")).toBe(false);
 await app.press("id:attention-t3-question-branch-option-开发分支");
 await app.press("id:attention-t3-question-tests-option-类型检查");
 await app.press("id:attention-t3-question-tests-option-界面测试");
 await app.press("id:attention-t3-question-send");
 await app.waitFor("id:attention-t3-question-answer");
 await app.press("id:attention-t3-approval-option-拒绝");
 await app.waitFor("id:attention-t3-approval-answer");
 const replies = commands(app).filter(command => command.type === "attention.reply");
 expect(replies).toHaveLength(2);
 expect(replies[0]).toMatchObject({ attentionId:"t3-question", answers:{ branch:["dev"], tests:["check","ui"] } });
 expect(replies[1]).toMatchObject({ attentionId:"t3-approval", value:"拒绝" });
 expect(app.count("id:attention-t3-approval-option-批准")).toBe(0);
 await app.wait(350);
 await shot(app, "/tmp/deepbot-t3-requests-answered.png");
});

test("T3 native screen reference and connection status", async () => {
 const before = await open("../FixtureApp.tsx", { ...desktop, host: { params: { t3Cards: "before" } } });
 await before.waitFor("id:attention-t3-legacy-4");
 await before.wait(350);
 await shot(before, "/tmp/deepbot-t3-requests-before.png");
 const settings = await open("../FixtureApp.tsx", { ...desktop, host: { params: { t3Connections: true } } });
 await settings.waitFor("id:t3-mode-status");
 expect(settings.shows("text:/完全访问/")).toBe(true);
 expect(settings.shows("id:t3-approval-status >> text:/已连接/")).toBe(true);
 await settings.wait(350);
 await shot(settings, "/tmp/deepbot-t3-connection-modes.png");
});
