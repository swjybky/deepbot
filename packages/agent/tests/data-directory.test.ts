import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory, prepareDataDirectory } from "../src/runtime/data-directory.ts";

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "deepbot-home-test-"));
  const legacy = join(home, ".local", "share", "deepbot"), target = join(home, ".deepbot");
  mkdirSync(legacy, { recursive: true });
  return { home, legacy, target, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
test("all default data lives in .deepbot and explicit isolation remains supported", () => {
  assert.equal(dataDirectory({}, "/user"), "/user/.deepbot");
  assert.equal(dataDirectory({ DEEPBOT_DATA_DIR: "/isolated" }, "/user"), "/isolated");
});
test("migration preserves SQLite WAL, executor records, tools and config; repeat startup is safe", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(join(f.legacy, "session.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE messages(text); INSERT INTO messages VALUES ('retained')");
    // Keep the uncheckpointed WAL, as it would be after a crash.
    const files = ["session.sqlite", "session.sqlite-wal", "session.sqlite-shm"];
    const contents = files.map(name => readFileSync(join(f.legacy, name)));
    db.close();
    files.forEach((name, i) => writeFileSync(join(f.legacy, name), contents[i]!));
    for (const name of ["executors/human", "tools/codex-acp"]) mkdirSync(join(f.legacy, name), { recursive: true });
    writeFileSync(join(f.legacy, "executors/human/record.json"), "record");
    const config = join(f.home, ".config", "deepbot"); mkdirSync(config, { recursive: true });
    writeFileSync(join(config, "config.json"), '{"provider":"test"}');
    mkdirSync(f.target); writeFileSync(join(f.target, "models.json"), "existing models");
    assert.equal(prepareDataDirectory({}, f.home), f.target);
    assert.equal(realpathSync(f.legacy), f.target);
    assert.equal(realpathSync(config), f.target);
    assert.equal(readFileSync(join(f.target, "models.json"), "utf8"), "existing models");
    assert.equal(readFileSync(join(f.target, "executors/human/record.json"), "utf8"), "record");
    assert.ok(existsSync(join(f.target, "tools/codex-acp")));
    assert.equal(readFileSync(join(f.target, "config.json"), "utf8"), '{"provider":"test"}');
    const restored = new DatabaseSync(join(f.target, "session.sqlite"));
    assert.equal(restored.prepare("SELECT text FROM messages").get()!.text, "retained"); restored.close();
    assert.equal(prepareDataDirectory({}, f.home), f.target);
  } finally { f.cleanup(); }
});
test("conflicts abort before any legacy file moves", () => {
  const f = fixture();
  try {
    mkdirSync(f.target); writeFileSync(join(f.legacy, "session.sqlite"), "old");
    writeFileSync(join(f.target, "session.sqlite"), "new"); writeFileSync(join(f.legacy, "extra"), "untouched");
    assert.throws(() => prepareDataDirectory({}, f.home), /同名/);
    assert.equal(readFileSync(join(f.legacy, "session.sqlite"), "utf8"), "old");
    assert.equal(readFileSync(join(f.target, "session.sqlite"), "utf8"), "new");
    assert.ok(existsSync(join(f.legacy, "extra")));
  } finally { f.cleanup(); }
});
test("isolated startup never imports real user data", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.legacy, "session.sqlite"), "old");
    const isolated = join(f.home, "isolated");
    assert.equal(prepareDataDirectory({ DEEPBOT_DATA_DIR: isolated }, f.home), isolated);
    assert.ok(!existsSync(join(isolated, "session.sqlite")));
    assert.ok(existsSync(join(f.legacy, "session.sqlite")));
  } finally { f.cleanup(); }
});
test("migration waits for the old sidecar to exit", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.legacy, "agent.lock"), String(process.pid));
    assert.throws(() => prepareDataDirectory({}, f.home), /退出/);
    assert.ok(existsSync(join(f.legacy, "agent.lock")));
  } finally { f.cleanup(); }
});
test("legacy config and saved model profiles use the same isolated root", async () => {
  const f = fixture();
  try {
    const dir = join(f.home, "isolated"); mkdirSync(dir);
    writeFileSync(join(dir, "config.json"), JSON.stringify({ provider: "openai", model: "root-test", api: "openai-completions", baseUrl: "http://127.0.0.1:1", useCodexAuth: false }));
    const { ModelSettings } = await import("../src/runtime/model-config.ts");
    const settings = await ModelSettings.open({ env: { DEEPBOT_DATA_DIR: dir, DEEPBOT_USE_CODEX_AUTH: "0" }, loadDotEnv: false });
    assert.equal(settings.path, join(dir, "models.json"));
    assert.equal(settings.view().modelConfigs[0]!.model, "root-test");
    assert.ok(existsSync(join(dir, "models.json")));
    const reopened = await ModelSettings.open({ env: { DEEPBOT_DATA_DIR: dir, DEEPBOT_USE_CODEX_AUTH: "0" }, loadDotEnv: false });
    assert.equal(reopened.view().modelConfigs[0]!.model, "root-test");
  } finally { f.cleanup(); }
});
