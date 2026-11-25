import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionKey, allowedPath, type WorkingContext } from "../src/policy/gate.ts";

async function fixture() {
 const dir = await mkdtemp(join(tmpdir(), "deepbot-policy-test-")), cwd = join(dir, "allowed"); await mkdir(cwd);
 const context: WorkingContext = { workId: "w1", assignmentId: "a1", cwd, roots: [cwd], settings: { permissions: { files: true, browser: true, deleteFiles: false, confirmPublish: true }, executor: { thinkingLevel: "medium", contextWindow: 0, images: true, projectInstructions: true }, connectedFolders: [cwd], debounceMs: 0, foregroundMaxTurns: 4, maxConcurrent: 2 } };
 return { dir, cwd, context, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
test("file boundary rejects traversal, symlink escape, dangling links, and disabled permission", async () => {
 const f = await fixture(); try {
  assert.equal(await allowedPath(f.context, "new/f.txt"), join(f.cwd,"new/f.txt"));
  assert.equal(await allowedPath(f.context, "@new/at.txt"), join(f.cwd,"new/at.txt"));
  await assert.rejects(allowedPath(f.context, "../outside"), /已连接/);
  await assert.rejects(allowedPath(f.context, "@../outside"), /已连接/);
  await assert.rejects(allowedPath(f.context, "~/outside"), /已连接/);
  await assert.rejects(allowedPath(f.context, "file:///etc/passwd"), /已连接/);
  await writeFile(join(f.dir,"secret"),"secret"); await symlink(f.dir,join(f.cwd,"escape"));
  await assert.rejects(allowedPath(f.context,"escape/secret"),/已连接/);
  await symlink(join(f.dir,"missing"),join(f.cwd,"dangling")); await assert.rejects(allowedPath(f.context,"dangling"),/悬空/);
  f.context.settings.permissions.files = false; await assert.rejects(allowedPath(f.context,"new"),/已关闭/);
 } finally { await f.cleanup(); }
});
test("approval digest binds exact content, destination, assignment and work", () => {
 const a = { kind: "publish" as const, destination: "https://example.org/submit", content: "a", description: "publish" };
 const key = actionKey("w","a",a);
 for (const value of [actionKey("w","b",a),actionKey("v","a",a),actionKey("w","a",{...a,content:"b"}),actionKey("w","a",{...a,destination:"https://evil.test"})]) assert.notEqual(value,key);
});
test("the work's folder is readable for verification even when it is not among the roots", async () => {
 const f = await fixture(); try {
  const work = join(f.dir, "bot-work"); await mkdir(work); await writeFile(join(work, "out.txt"), "x");
  const context = { ...f.context, cwd: work };
  assert.equal(await allowedPath(context, "out.txt"), join(work, "out.txt"));
  assert.equal(await allowedPath(context, join(f.cwd, "inside.txt")), join(f.cwd, "inside.txt"));
  await assert.rejects(allowedPath(context, join(f.dir, "elsewhere.txt")), /不在事项目录/);
 } finally { await f.cleanup(); }
});
