import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startConnectorProcess } from "../src/connectors/support.ts";
import { defaultSettings } from "../src/defaults.ts";
import { pathInRoots } from "../src/policy/gate.ts";
import { hashArtifactFile, openArtifactFile, previewArtifactFile } from "../src/runtime/artifact-files.ts";
import { readHttpText, requestHttp } from "../src/runtime/http.ts";
import { readJson, writePrivateJson } from "../src/runtime/private-json.ts";
import { processStatus, staleProcessLock } from "../src/runtime/process-id.ts";

test("connector environment only inherits baseline variables and explicitly configured values", async t => {
  const key = "DEEPBOT_TEST_PRIVATE_ENV";
  const previous = process.env[key];
  process.env[key] = "synthetic-parent-private-value";
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
  const child = startConnectorProcess(process.execPath, ["-e", `
    process.stdout.write(JSON.stringify({
      parentVariable: Object.hasOwn(process.env, "${key}"),
      configured: process.env.DEEPBOT_TEST_CONNECTOR_SETTING,
      hasPath: process.env.PATH !== undefined,
    }))
  `], { env: { DEEPBOT_TEST_CONNECTOR_SETTING: "explicit-child-value" } });
  const chunks: Buffer[] = [];
  child.stdout.on("data", chunk => chunks.push(chunk));
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), {
    parentVariable: false,
    configured: "explicit-child-value",
    hasPath: process.env.PATH !== undefined,
  });
});

test("stale process locks keep live or inaccessible processes and freshly written locks", t => {
  let probeError: string | undefined;
  const probe = t.mock.method(process, "kill", () => {
    if (probeError) throw Object.assign(new Error("test probe"), { code: probeError });
    return true;
  });
  const now = Date.now();
  for (const bad of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) assert.equal(processStatus(bad), "invalid");
  assert.equal(staleProcessLock(NaN, now), false);
  assert.equal(staleProcessLock(NaN, now - 20_000), true);
  assert.equal(probe.mock.callCount(), 0);
  assert.equal(processStatus(123), "running");
  probeError = "EPERM";
  assert.equal(processStatus(123), "denied");
  assert.equal(staleProcessLock(123, 0), false);
  probeError = "ESRCH";
  assert.equal(staleProcessLock(123, now), true);
});

test("private JSON stays private, survives replacement and cleans a failed write", async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-private-json-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, "config.json");
  writePrivateJson(config, { revision: 1 });
  writePrivateJson(config, { revision: 2 });
  assert.deepEqual(readJson(config), { revision: 2 });
  if (process.platform !== "win32") assert.equal((await stat(config)).mode & 0o777, 0o600);
  const blocked = join(directory, "blocked.json");
  await mkdir(blocked);
  assert.throws(() => writePrivateJson(blocked, { revision: 3 }));
  assert.deepEqual((await readdir(directory)).sort(), ["blocked.json", "config.json"]);
  assert.deepEqual(readJson(config), { revision: 2 });
});

test("a supported file name starting with two dots stays inside its root", async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-file-root-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(await pathInRoots("..draft.txt", directory, [directory]), join(directory, "..draft.txt"));
  await assert.rejects(pathInRoots("../draft.txt", directory, [directory]), /路径不在/);
});

test("Linux file open reports the launcher's result", { skip: process.platform !== "linux" }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-file-opener-"));
  const previousPath = process.env.PATH;
  t.after(async () => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  });
  const context = { cwd: directory, roots: [directory], settings: defaultSettings() };
  const path = join(directory, "交付 报告.md");
  const gio = join(directory, "gio");
  const xdg = join(directory, "xdg-open");
  await writeFile(path, "report");
  await writeFile(gio, "#!/bin/sh\nexit 4\n", { mode: 0o700 });
  await writeFile(xdg, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  process.env.PATH = directory;
  await assert.rejects(openArtifactFile(context, path), /系统打开文件失败，请检查默认应用/);

  await writeFile(gio, '#!/bin/sh\nprintf "%s\\n" "$@" > "$2.args"\n');
  await openArtifactFile(context, path);
  assert.equal(await readFile(path + ".args", "utf8"), `open\n${path}\n`);

  const fallback = join(directory, "fallback");
  await mkdir(fallback);
  process.env.PATH = fallback;
  await assert.rejects(openArtifactFile(context, path), /找不到系统文件打开器/);
  await writeFile(join(fallback, "xdg-open"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$1.args"\n', { mode: 0o700 });
  await openArtifactFile(context, path);
  assert.equal(await readFile(path + ".args", "utf8"), `${path}\n`);
});

test("file previews preserve UTF-8 and distinguish truncation from invalid text", async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-text-preview-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const context = { cwd: directory, roots: [directory], settings: defaultSettings() };
  const path = join(directory, "sample.txt");
  await writeFile(path, "\ufeff文\nline");
  assert.deepEqual(await previewArtifactFile(context, path), { kind: "text", text: "文\nline", truncated: false });

  const prefix = Buffer.alloc(256 * 1024 - 1, "x");
  await writeFile(path, Buffer.concat([prefix, Buffer.from("文\n")]));
  const truncated = await previewArtifactFile(context, path);
  assert.ok(truncated.kind === "text" && truncated.truncated);
  assert.equal(truncated.text, prefix.toString());

  for (const bytes of [Buffer.from([0xe6, 0x96]), Buffer.from("x\0y")]) {
    await writeFile(path, bytes);
    await assert.rejects(previewArtifactFile(context, path), /不支持内置预览/);
  }
});

test("file previews determine image type from content", async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-image-preview-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const context = { cwd: directory, roots: [directory], settings: defaultSettings() };
  const path = join(directory, "sample.txt");
  for (const [mime, bytes] of [
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/webp", Buffer.from("RIFFxxxxWEBP")],
  ] as const) {
    await writeFile(path, bytes);
    assert.deepEqual(await previewArtifactFile(context, path), {
      kind: "image", image: `data:${mime};base64,${bytes.toString("base64")}`,
    });
  }
  await writeFile(path, "RIFFxxxxWAVE");
  assert.deepEqual(await previewArtifactFile(context, path), { kind: "text", text: "RIFFxxxxWAVE", truncated: false });
});

test("artifact hashing supports large files without reading them all into memory", async t => {
  const directory = await mkdtemp(join(tmpdir(), "deepbot-large-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "sample.bin");
  await writeFile(path, "");
  const zeros = Buffer.alloc(1024 * 1024);
  await truncate(path, 40 * zeros.length);
  const expected = createHash("sha256");
  for (let i = 0; i < 40; i++) expected.update(zeros);
  const actual = await hashArtifactFile({ cwd: directory, roots: [directory], settings: defaultSettings() }, path);
  assert.equal(actual.hash, expected.digest("hex"));
});

test("HTTP requests preserve failure responses and enforce redirect, timeout and response size limits", async t => {
  let redirected = false;
  const server = createServer((request, response) => {
    switch (request.url) {
      case "/redirect":
        response.writeHead(302, { Location: "/target" }).end();
        break;
      case "/target":
        redirected = true;
        response.end();
        break;
      case "/large":
        response.end("字".repeat(10));
        break;
      case "/stall":
        break;
      default:
        response.writeHead(503).end("稍后再试");
    }
  });
  server.listen(0, "127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const failed = await requestHttp(base, {});
  assert.equal(failed.status, 503);
  assert.equal(await readHttpText(failed, 64, "响应太大"), "稍后再试");
  await assert.rejects(requestHttp(base + "/redirect", {}));
  assert.equal(redirected, false);
  await assert.rejects(readHttpText(await requestHttp(base + "/large", {}), 12, "响应太大"), /响应太大/);
  await assert.rejects(requestHttp(base + "/stall", {}, 100), { name: "TimeoutError" });
});
