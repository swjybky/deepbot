import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  accessSync, chmodSync, closeSync, constants, copyFileSync, cpSync, existsSync,
  mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { artifactName, capture, json, releaseVersion, run, sha256 } from "./common.mjs";
import { nativeTarget, nodeVersion, nshVersion, unpackNode } from "./toolchain.mjs";

const version = releaseVersion(process.argv[2]);
const deploy = resolve(process.argv[3] || "dist/release-agent");
const output = resolve(process.argv[4] || "dist/release");
const commit = capture("git", ["rev-parse", "HEAD"]);
assert(!process.env.BUILD_COMMIT || commit === process.env.BUILD_COMMIT, "Unexpected source commit");
assert.equal(capture("git", ["status", "--porcelain"]), "", "Build requires a clean Git checkout");
assert(nativeTarget, `Unsupported build host ${process.platform}/${process.arch}`);
assert(!existsSync(output), `Output already exists: ${output}`);
assert.equal(json(join(deploy, "package.json")).name, "@deepbot/agent");
const nsh = capture("nsh", ["--version"]);
assert(nsh.startsWith(`nsh ${nshVersion} (`), `Unexpected NSH version: ${nsh}`);

const target = nativeTarget.split("-")[0];
const work = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "deepbot package "));
const native = join(work, "native");
const name = artifactName(version, nativeTarget);
const artifact = join(work, name);
const config = json("apps/desktop/nsh.json");
const windows = target === "windows";
const mac = target === "macos";
const nodeName = windows ? "node.exe" : "node";
const exeName = windows ? "DeepBot.exe" : "DeepBot";
console.log(`Building ${name} from ${commit}. Build and smoke logs: ${work}`);
run("nsh", ["package", "apps/desktop", "--target", target, "--app-version", version, "-o", native]);

const app = join(native, mac ? "DeepBot.app" : "DeepBot");
const build = { version, commit, target: nativeTarget, nsh, node: nodeVersion };

function layout(app) {
  const resources = mac ? join(app, "Contents", "Resources") : app;
  const bin = mac ? join(app, "Contents", "MacOS") : app;
  const runtime = join(resources, "deepbot-runtime");
  return {
    resources, runtime,
    agent: join(runtime, "agent"),
    node: join(mac ? bin : runtime, nodeName),
    executable: join(bin, exeName),
  };
}

const staged = layout(app);
mkdirSync(staged.agent, { recursive: true });
for (const entry of ["src", "package.json", "node_modules"]) {
  cpSync(join(deploy, entry), join(staged.agent, entry), { recursive: true, verbatimSymlinks: true });
}
const nodeDist = await unpackNode(work);
copyFileSync(windows ? join(nodeDist, nodeName) : join(nodeDist, "bin", nodeName), staged.node);
if (!windows) chmodSync(staged.node, 0o755);
copyFileSync(join(nodeDist, "LICENSE"), join(staged.runtime, "LICENSE-Node"));
copyFileSync("LICENSE", join(staged.runtime, "LICENSE-DeepBot"));
writeFileSync(join(staged.runtime, "build-info.json"), JSON.stringify(build, null, 2) + "\n");

const install = join(work, "Installed DeepBot");
mkdirSync(install);
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(DEEPBOT_|NSH_|NODE_OPTIONS$|NODE_PATH$)/i.test(key)) delete env[key];
}
env.HOME = join(work, "Smoke Home");
env.XDG_DATA_HOME = join(env.HOME, "data");
env.XDG_CONFIG_HOME = join(env.HOME, "config");
env.XDG_CACHE_HOME = join(env.HOME, "cache");
mkdirSync(env.HOME);
const checks = [];
let installed;
if (windows) {
  run("ISCC.exe", [`/DVersion=${version}`, `/DSetupName=${basename(name, ".exe")}`, `/DAppDir=${app}`,
    `/O${work}`, resolve("scripts/release/setup.iss")]);
  const productVersion = capture("pwsh", ["-NoProfile", "-Command", "(Get-Item -LiteralPath $env:DEEPBOT_SETUP).VersionInfo.ProductVersion"],
    { env: { ...env, DEEPBOT_SETUP: artifact } });
  assert.equal(productVersion, version);
  installed = join(install, "app");
  run(artifact, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", `/DIR=${installed}`,
    `/LOG=${join(work, "installer.log")}`], { timeout: 180_000 });
  assert(statSync(join(installed, "unins000.exe")).isFile());
  checks.push("Windows installer version and per-user installation");
} else if (mac) {
  run("codesign", ["--force", "--sign", "-", "--timestamp=none", "--preserve-metadata=entitlements", staged.node]);
  run("codesign", ["--force", "--sign", "-", "--timestamp=none", app]);
  run("ditto", ["-c", "-k", "--keepParent", app, artifact]);
  run("ditto", ["-x", "-k", artifact, install]);
  installed = join(install, "DeepBot.app");
  run("codesign", ["--verify", "--deep", "--strict", installed]);
  const plist = join(installed, "Contents", "Info.plist");
  assert.equal(capture("plutil", ["-extract", "CFBundleShortVersionString", "raw", plist]), version);
  assert.equal(capture("plutil", ["-extract", "CFBundleExecutable", "raw", plist]), exeName);
  assert.equal(capture("plutil", ["-extract", "CFBundleIdentifier", "raw", plist]), config.id);
  assert.equal(capture("lipo", ["-archs", layout(installed).executable]), "arm64");
  checks.push("macOS app bundle version, arm64 and ad hoc signature");
} else {
  const folder = `DeepBot-${version}-${nativeTarget}`;
  const packageDir = join(work, folder);
  mkdirSync(packageDir);
  renameSync(app, join(packageDir, "app"));
  copyFileSync("scripts/release/install-linux.sh", join(packageDir, "install.sh"));
  chmodSync(join(packageDir, "install.sh"), 0o755);
  run("tar", ["-czf", artifact, "-C", work, folder]);
  run("tar", ["-xzf", artifact, "-C", install]);
  const installer = join(install, folder, "install.sh");
  run("bash", [installer], { env });
  run("bash", [installer], { env });
  installed = join(env.HOME, ".local", "opt", "DeepBot", version);
  const entry = join(env.XDG_DATA_HOME, "applications", `${config.id}.desktop`);
  run("desktop-file-validate", [entry]);
  assert(readFileSync(entry, "utf8").includes(`Exec="${join(installed, exeName)}"\n`));
  const libraries = capture("ldd", [join(installed, exeName)]);
  assert(!libraries.includes("not found"), libraries);
  checks.push("Linux archive, desktop entry, repeat installation and shared libraries");
}

const actual = layout(installed);
assert.deepEqual(json(join(actual.runtime, "build-info.json")), build);
const nshConfig = join(actual.resources, "nsh", "app.json");
assert.equal(json(nshConfig).version, version);
assert.equal(json(nshConfig).id, config.id);
assert(statSync(join(actual.resources, "nsh", "bundle.nshc")).size > 0);
accessSync(actual.executable, constants.X_OK);
const platform = capture(actual.node, ["-p", 'process.version + " " + process.platform + " " + process.arch'], { env });
assert.equal(platform, `v${nodeVersion} ${process.platform} ${process.arch}`);
checks.push("Installed NSH bundle, build metadata and bundled Node version and architecture");

const agent = json(join(actual.agent, "package.json"));
const dependencies = json("packages/agent/package.json").dependencies;
assert.deepEqual(agent.dependencies, dependencies);
for (const [dependency, expected] of Object.entries(dependencies)) {
  assert.equal(json(join(actual.agent, "node_modules", dependency, "package.json")).version, expected);
}
const stdout = capture(actual.node, [join(actual.agent, "src", "main.ts")], {
  cwd: actual.agent, env: { ...env, DEEPBOT_DATA_DIR: join(work, "protocol-data") }, timeout: 30_000,
  input: '{"type":"sync","requestId":"package-smoke"}\n', stdio: ["pipe", "pipe", "inherit"],
});
const events = stdout.split(/\r?\n/).map(JSON.parse);
assert(events.some((event) => event.type === "ready" && event.version === 2));
assert(events.filter((event) => event.type === "snapshot").length >= 2, "Agent did not respond to sync");
assert(!events.some((event) => ["error", "fatal"].includes(event.type)));
checks.push("Bundled Agent production dependencies and JSON-lines ready and sync");

const data = join(work, "desktop-data");
const lock = join(data, "agent.lock");
const log = join(work, "desktop.log");
const fd = openSync(log, "w");
const runner = spawn(actual.executable, [], {
  env: { ...env, DEEPBOT_DATA_DIR: data }, cwd: install, stdio: ["ignore", fd, fd], windowsHide: true,
});
closeSync(fd);
const exited = once(runner, "exit");
// Attach a handler immediately so spawn errors can surface through the startup race.
void exited.catch(() => {});
try {
  const deadline = Date.now() + 45_000;
  const database = join(data, "session.sqlite");
  while (Date.now() < deadline && !(existsSync(lock) && existsSync(database) && statSync(database).size > 0)) {
    await Promise.race([
      delay(250),
      exited.then(([code]) => { throw new Error(`Desktop exited with ${code}. See ${log}`); }),
    ]);
  }
  assert(existsSync(lock) && existsSync(database) && statSync(database).size > 0, `Agent startup timed out. See ${log}`);
  const pid = Number(readFileSync(lock, "utf8"));
  assert(Number.isSafeInteger(pid) && pid > 0);
  process.kill(pid, 0);
  const node = realpathSync(actual.node);
  if (windows) {
    const executable = capture("pwsh", ["-NoProfile", "-Command",
      `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').ExecutablePath`]);
    assert.equal(realpathSync(executable), node);
  } else if (mac) {
    const textFiles = capture("lsof", ["-a", "-p", String(pid), "-d", "txt", "-Fn"]).split("\n");
    assert(textFiles.includes(`n${node}`), "Desktop did not launch the bundled Node");
  } else {
    assert.equal(realpathSync(`/proc/${pid}/exe`), node);
  }
} finally {
  if (runner.pid && runner.exitCode === null && runner.signalCode === null) runner.kill();
  await exited;
}
checks.push("Installed native executable starts its Agent with bundled Node and isolated data");

mkdirSync(output, { recursive: true });
copyFileSync(artifact, join(output, name));
const result = { ...build, name, checks, sha256: await sha256(artifact) };
writeFileSync(join(output, "build.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
