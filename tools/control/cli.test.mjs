import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun, resolveRun, sourceFingerprint, stage } from './isolation.mjs';
import { validateScenario } from './scenario.mjs';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const mapCheck = fileURLToPath(new URL('../../scripts/check-feature-map.mjs', import.meta.url));
const repo = fileURLToPath(new URL('../..', import.meta.url));
function run(args, input, environment = process.env) {
  const processResult = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', input: JSON.stringify(input), timeout: 45000, env: environment,
  });
  assert.ifError(processResult.error);
  const output = JSON.parse(processResult.stdout);
  assert.equal(processResult.status === 0, output.ok, processResult.stdout);
  return output;
}

test('help is JSON and an arbitrary data path cannot become a run', () => {
  assert.equal(run(['--help']).ok, true);
  assert.equal(run(['data', 'reset', '--help']).result.options['dry-run'].type, 'boolean');
  const result = run(['data', 'delete', '--run', '../real-data', '--apply']);
  assert.equal(result.error.code, 'RUN_ID_REQUIRED');
  assert.match(result.error.nextAction, /env start/);
});

test('isolated sidecar survives UI reload and persists state across a full restart', t => {
  const probe = run(['env', 'doctor']);
  if (!probe.ok) return t.skip(probe.error.message);
  assert.deepEqual(Object.keys(probe.result).sort(), ['browser', 'bwrap', 'isolation', 'nsh', 'xvfb']);

  const developerState = mkdtempSync(join(tmpdir(), 'deepbot-control-trap-'));
  t.after(() => rmSync(developerState, { recursive: true, force: true }));
  writeFileSync(join(developerState, 'models.json'), 'Do not load this file');
  const start = run(['env', 'start'], undefined, { ...process.env, DEEPBOT_DATA_DIR: developerState });
  assert.equal(start.ok, true, JSON.stringify(start));
  const invoke = (args, input) => run([...args, '--run', start.runId], input);
  try {
    const create = invoke(['api', 'call', 'bot.upsert'], { bot: { id: 'verify-test', name: '临时验证 Bot' } });
    assert.equal(create.result.event.type, 'ack');

    for (const field of ['token', 'approvalCredential']) {
      const refused = invoke(['api', 'call', 'connector.t3.configure'], { [field]: '' });
      assert.equal(refused.error.code, 'CREDENTIAL_REFUSED');
    }
    const mode = invoke(['api', 'call', 'connector.t3.configure'], { runtimeMode: 'approval-required' });
    assert.equal(mode.result.event.type, 'ack');

    const reload = invoke(['env', 'restart', '--scope', 'ui']);
    assert.equal(reload.result.backendGeneration, start.result.backendGeneration);
    const restart = invoke(['env', 'restart', '--scope', 'all']);
    assert.notEqual(restart.result.backendGeneration, start.result.backendGeneration);

    const planned = invoke(['api', 'call', 'bot.delete', '--dry-run'], { botId: 'verify-test' });
    assert.equal(planned.result.writes, false);
    for (const [type, target] of [
      ['bot.delete', { botId: 'verify-test' }],
      ['model.delete', { modelConfigId: 'default' }],
      ['memory.delete', { memoryId: 'missing' }],
      ['work.cancel', { workId: 'missing' }],
      ['artifact.open', { artifactId: 'missing' }],
    ]) {
      const request = { requestId: 'dry-run-test', ...target };
      const implicit = invoke(['api', 'call', type], request);
      const explicit = invoke(['api', 'call', type, '--dry-run'], request);
      assert.deepEqual(implicit.result, explicit.result);
      assert.equal(implicit.result.writes, false);
    }
    const invalid = invoke(['api', 'call', 'unknown.command', '--dry-run'], {});
    assert.equal(invalid.error.code, 'COMMAND_INVALID');
    const preview = invoke(['api', 'call', 'artifact.preview'], { artifactId: 'missing' });
    assert.equal(preview.error.code, 'API_REJECTED');
    const state = invoke(['api', 'snapshot']).result.event.snapshot;
    assert.ok(state.bots.some(bot => bot.name === '临时验证 Bot'));
    assert.equal(state.connectors.find(connector => connector.id === 't3code').t3.runtimeMode, 'approval-required');

    const resume = invoke(['env', 'start']);
    assert.equal(resume.runId, start.runId);
    assert.equal(resume.result.reused, true);
    assert.equal(resume.result.backendGeneration, restart.result.backendGeneration);

    const endpoint = invoke(['api', 'call', 'model.test'], { config: { baseUrl: 'https://outside.invalid' } });
    assert.equal(endpoint.error.code, 'EXTERNAL_ENDPOINT');
    const resetPreview = invoke(['data', 'reset', '--dry-run']);
    assert.equal(resetPreview.result.running, true);
    assert.equal(invoke(['data', 'reset', '--apply']).error.code, 'RUN_ACTIVE');

    assert.equal(invoke(['env', 'stop']).result.stopped, true);
    const resumed = invoke(['env', 'start']);
    assert.equal(resumed.runId, start.runId);
    assert.notEqual(resumed.result.backendGeneration, resume.result.backendGeneration);
    assert.ok(invoke(['api', 'snapshot']).result.event.snapshot.bots.some(bot => bot.id === 'verify-test'));
    assert.deepEqual(readdirSync(join(resolveRun(start.runId).dir, 'work')), []);
    assert.equal(invoke(['env', 'stop']).result.stopped, true);
    assert.equal(invoke(['data', 'reset', '--apply']).result.reset, true);
    const reset = invoke(['api', 'snapshot']).result.event.snapshot;
    assert.deepEqual(reset.bots.map(bot => bot.id), ['xiaocai']);
    assert.deepEqual(readdirSync(developerState), ['models.json']);
  } finally {
    invoke(['env', 'stop']);
    invoke(['data', 'delete', '--apply']);
    rmSync(resolveRun(start.runId).dir, { recursive: true, force: true });
  }
});

// A run with synthetic evidence, as the sandbox would leave it after ui run, check run and review-save.
function syntheticRun(t, { source = sourceFingerprint(), native = 'passed', review = 'passed', digest, checks = { agent: 'passed', ui: 'passed' } } = {}) {
  const run = createRun(randomBytes(8).toString('hex'));
  t.after(() => rmSync(run.dir, { recursive: true, force: true }));
  const write = (name, value) => writeFileSync(join(run.dir, name), JSON.stringify(value));
  write('manifest.json', { ...run.manifest, scenario: 'model-settings', sourceVersion: source });
  const shotPrefix = 'native-model-settings-1';
  const image = Buffer.from('synthetic screenshot');
  writeFileSync(join(run.dir, 'screenshots', `${shotPrefix}-01-model-list.png`), image);
  if (native) write('ui-results.json', { native: { target: 'native', scenario: 'model-settings', shotPrefix, status: native, design: [], sourceVersion: source } });
  const imageDigests = [digest ?? createHash('sha256').update(image).digest('hex')];
  if (review) write('visual-review.json', { imageDigests, checks: [{ rule: '合成规则', observation: '合成观察', status: review }] });
  write('check-results.json', Object.fromEntries(Object.entries(checks).map(([part, status]) => [part, { scope: part, status, sourceVersion: source }])));
  return { ...run, imageDigests };
}

const report = synthetic => run(['evidence', 'report', '--run', synthetic.id]);

test('permission toggles run without apply, while delete buttons, menu actions and stop still require a declaration', t => {
  const synthetic = syntheticRun(t);
  const planned = run(['ui', 'run', 'settings-permissions', '--dry-run', '--run', synthetic.id]);
  assert.equal(planned.ok, true);
  assert.ok(planned.result.steps.some(step => step.press === 'label:允许删除文件'));
  assert.doesNotThrow(() => validateScenario({ steps: [{ press: 'id:permission-deleteFiles' }] }));
  for (const step of [
    { press: 'id:settings >> id:model-delete-default >> nth=0' },
    { press: 'label:删除' },
    { press: 'id:cancel-work-123' },
    { press: 'label:停止事项' },
    { chooseMenuItem: '删除' },
  ]) {
    assert.throws(() => validateScenario({ steps: [step] }), { code: 'SCENARIO_INVALID' });
    assert.doesNotThrow(() => validateScenario({ destructive: true, steps: [step] }));
  }
});

test('review and report include every current-source native attempt and retain earlier failures', t => {
  const synthetic = syntheticRun(t);
  const path = join(synthetic.dir, 'ui-results.json');
  const { native: first } = JSON.parse(readFileSync(path, 'utf8'));
  const second = { ...first, scenario: 'bot-routines', shotPrefix: 'native-bot-routines-2', design: ['DESIGN.md'] };
  const old = { ...first, scenario: 'old', shotPrefix: 'native-old-1', sourceVersion: 'stale' };
  for (const entry of [second, old]) {
    writeFileSync(join(synthetic.dir, 'screenshots', entry.shotPrefix + '-01.png'), entry.scenario);
  }
  const history = [old, first, second];
  writeFileSync(path, JSON.stringify({ native: history }));
  const input = run(['evidence', 'review-input', '--run', synthetic.id]).result;
  assert.deepEqual(input.ui.native.map(entry => entry.scenario), ['model-settings', 'bot-routines']);
  assert.deepEqual(input.images.map(image => image.scenario), ['model-settings', 'bot-routines']);
  assert.deepEqual(input.design, [join(repo, 'DESIGN.md')]);
  assert.equal(report(synthetic).result.status, 'incomplete');
  const saved = run(['evidence', 'review-save', '--run', synthetic.id], {
    imageDigests: input.images.map(image => image.sha256),
    checks: [{ rule: '合成规则', observation: '检查了两张图', status: 'passed' }],
  });
  assert.equal(saved.ok, true);
  assert.equal(report(synthetic).result.status, 'passed');
  first.status = 'failed';
  writeFileSync(path, JSON.stringify({ native: history }));
  assert.deepEqual(report(synthetic).result.failed, ['ui:native']);
});

test('staged fingerprint equals the working tree fingerprint', t => {
  const run = createRun(randomBytes(8).toString('hex'));
  t.after(() => rmSync(run.dir, { recursive: true, force: true }));
  assert.equal(stage(run), sourceFingerprint());
});

test('report passes only with fresh source, passed UI, matching review and both check parts', t => {
  const result = report(syntheticRun(t));
  assert.equal(result.result.status, 'passed', JSON.stringify(result.result));
  assert.deepEqual([result.result.failed, result.result.missing], [[], []]);
});

test('a failed native scenario fails the report even with a passed review', t => {
  const result = report(syntheticRun(t, { native: 'failed' })).result;
  assert.equal(result.visualStatus, 'failed');
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failed, ['ui:native']);
});

test('source edited after staging marks the report stale', t => {
  const result = report(syntheticRun(t, { source: 'f'.repeat(64) })).result;
  assert.equal(result.fresh, false);
  assert.equal(result.status, 'stale');
});

test('review for other images and partial checks leave the report incomplete', t => {
  const synthetic = syntheticRun(t, { digest: '0'.repeat(64), checks: { agent: 'passed' } });
  const result = report(synthetic).result;
  assert.equal(result.visualStatus, 'unverified');
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing, ['checks:ui', 'visual-review']);
  const saved = run(['evidence', 'review-save', '--run', synthetic.id],
    { imageDigests: ['0'.repeat(64)], checks: [{ rule: 'r', observation: 'o', status: 'passed' }] });
  assert.equal(saved.error.code, 'REVIEW_INVALID');
});

test('missing native run is reported as missing, not passed', t => {
  const result = report(syntheticRun(t, { native: null, review: null })).result;
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing, ['ui:native', 'visual-review']);
});

test('a lock left by a killed CLI is reclaimed, a live one is refused', t => {
  const synthetic = syntheticRun(t);
  const lock = join(synthetic.dir, 'active-command');
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  writeFileSync(lock, String(dead));
  assert.equal(report(synthetic).ok, true);
  assert.deepEqual(readdirSync(synthetic.dir).filter(name => name === 'active-command'), []);
  writeFileSync(lock, String(process.pid));
  const busy = spawnSync(process.execPath, [cli, 'evidence', 'report', '--run', synthetic.id], { encoding: 'utf8' });
  assert.equal(busy.status, 3);
  assert.equal(JSON.parse(busy.stdout).error.code, 'RUN_BUSY');
});

test('every command and flag in the verify skill and the feature map exists in the CLI help', () => {
  const features = join(repo, 'references/features');
  const docs = [join(repo, 'skills/verify/SKILL.md'), ...readdirSync(features).map(name => join(features, name))];
  const uses = docs.flatMap(path => [...readFileSync(path, 'utf8').matchAll(/pnpm --silent verify ([^`|#\n]*)/g)]
    .map(([, rest]) => rest.trim().split(/\s+/)));
  assert.ok(uses.length > 40, '技能和功能地图里应当有可执行的命令示例');
  for (const words of uses) {
    if (['--help', '<组>'].includes(words[0])) continue;
    const command = words.slice(0, words[0] === 'check' && words[1] !== 'run' ? 1 : 2);
    const help = run([...command, '--help']);
    assert.equal(help.ok, true, `技能引用了不存在的命令：${command.join(' ')}`);
    for (const flag of words.filter(word => word.startsWith('--'))) {
      assert.ok(Object.hasOwn(help.result.options, flag.slice(2)) || flag === '--help', `${command.join(' ')} 没有参数 ${flag}`);
    }
  }
});

test('staged checks snapshot indexed files and omit working-tree changes and secrets', async t => {
  const root = mkdtempSync(join(tmpdir(), 'deepbot-index-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const localGitEnv = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' });
  assert.equal(localGitEnv.status, 0, localGitEnv.stderr);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of localGitEnv.stdout.trim().split(/\s+/)) delete env[key];
  const git = (...args) => {
    const child = spawnSync('git', args, { cwd: root, encoding: 'utf8', env });
    assert.equal(child.status, 0, child.stderr);
  };
  mkdirSync(join(root, 'tools/control'), { recursive: true });
  mkdirSync(join(root, 'packages/agent/src/runtime'), { recursive: true });
  const fixture = join(root, 'tools/control/isolation.mjs');
  cpSync(new URL('./isolation.mjs', import.meta.url), fixture);
  cpSync(join(repo, 'packages/agent/src/runtime/process-id.ts'), join(root, 'packages/agent/src/runtime/process-id.ts'));
  const file = join(root, 'packages/agent/source.ts');
  writeFileSync(file, 'staged source');
  writeFileSync(join(root, 'packages/agent/.env.test'), 'synthetic secret');
  symlinkSync('.env.test', join(root, 'packages/agent/symlink.ts'));
  git('init', '--quiet');
  git('add', '-f', '--', 'packages/agent/source.ts', 'packages/agent/.env.test', 'packages/agent/symlink.ts');
  writeFileSync(file, 'newer source');
  writeFileSync(join(root, 'packages/agent/only-working-tree.ts'), 'untracked source');

  const isolation = await import(pathToFileURL(fixture).href);
  const snapshot = isolation.createRun(randomBytes(8).toString('hex'));
  t.after(() => rmSync(snapshot.dir, { recursive: true, force: true }));
  isolation.stage(snapshot, false, true);
  const agent = join(snapshot.dir, 'project/packages/agent');
  assert.equal(readFileSync(join(agent, 'source.ts'), 'utf8'), 'staged source');
  for (const path of ['only-working-tree.ts', '.env.test', 'symlink.ts']) assert.equal(existsSync(join(agent, path)), false, path);
  assert.equal(readFileSync(file, 'utf8'), 'newer source');
  const usage = run(['check', '--staged', '--run', snapshot.id]);
  assert.equal(usage.error.code, 'USAGE');
});

test('ui serve gives a browser tool the instance backend on loopback only', async t => {
  const probe = run(['env', 'doctor']);
  if (!probe.ok || !probe.result.nsh) return t.skip('需要 Bubblewrap 和 NSH');
  const start = run(['env', 'start']);
  assert.equal(start.ok, true, JSON.stringify(start));
  const invoke = args => run([...args, '--run', start.runId]);
  try {
    const served = invoke(['ui', 'serve']);
    assert.equal(served.ok, true, JSON.stringify(served));
    assert.match(served.result.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal((await fetch(served.result.url)).status, 200);
    const send = command => fetch(`${served.result.api}/command`, { method: 'POST', body: JSON.stringify(command) });
    assert.equal((await send({ type: 'sync', requestId: 'serve-sync' })).status, 200);
    const refused = await send({ type: 'bot.delete', botId: 'xiaocai', requestId: 'serve-delete' });
    assert.equal(refused.status, 400);
    assert.match(await refused.text(), /明确应用/);
    assert.equal(invoke(['env', 'status']).result.serving, true);
    assert.equal(invoke(['ui', 'close']).result.serving, false);
    await assert.rejects(fetch(served.result.url));
    assert.equal(invoke(['env', 'status']).result.serving, false);
  } finally {
    invoke(['env', 'stop']);
    invoke(['data', 'delete', '--apply']);
    rmSync(resolveRun(start.runId).dir, { recursive: true, force: true });
  }
});

test('feature map check fails on an unmapped entry, a stale entry and an unused scenario', t => {
  assert.equal(spawnSync(process.execPath, [mapCheck], { encoding: 'utf8' }).status, 0);
  const root = mkdtempSync(join(tmpdir(), 'deepbot-map-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['apps/desktop/ui/state/ui.ts', 'packages/agent/src/protocol.ts', 'tools/control/scenarios', 'references/features']) {
    cpSync(join(repo, path), join(root, path), { recursive: true });
  }
  const check = () => spawnSync(process.execPath, [mapCheck, root], { encoding: 'utf8' });
  assert.equal(check().status, 0);
  const ui = join(root, 'apps/desktop/ui/state/ui.ts');
  writeFileSync(ui, readFileSync(ui, 'utf8').replace('"settings" | "createBot"', '"settings" | "exportChat" | "createBot"'));
  const protocol = join(root, 'packages/agent/src/protocol.ts');
  writeFileSync(protocol, readFileSync(protocol, 'utf8').replace('  | { type: "memory.delete"; memoryId: string }\n', ''));
  writeFileSync(join(root, 'tools/control/scenarios/orphan.json'), '{"steps":[]}');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`modal:exportChat`.*没有任何功能页覆盖/);
  assert.match(result.stderr, /library\.md 写了 `memory\.delete`，代码里已没有/);
  assert.match(result.stderr, /场景 orphan\.json 没有被任何功能页引用/);
});
