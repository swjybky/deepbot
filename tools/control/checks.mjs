import { spawn, spawnSync } from 'node:child_process';
import { closeSync, constants, cpSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ControlError, processTimeout } from './isolation.mjs';

const target = '/work/target';
const lockName = '.deepbot-verify.lock';
const targetLimit = 24 * 1024 ** 3;

function trimBuildCache() {
  const result = spawnSync('du', ['-sxB1', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('无法读取验证构建缓存的占用');
  if (Number(result.stdout.split('\t', 1)[0]) <= targetLimit) return;
  for (const name of readdirSync(target)) {
    if (name !== lockName) rmSync(join(target, name), { recursive: true, force: true });
  }
}

export async function withBuildCache(action) {
  // Keep the lock through source preparation and test execution. Cargo releases its
  // own lock as soon as the binary is built, while NSH still needs to run that binary.
  const holder = spawn('flock', ['-x', '-w', '45', join(target, lockName),
    '/bin/sh', '-c', 'printf ready; cat >/dev/null'], { stdio: ['pipe', 'pipe', 'ignore'] });
  holder.stdin.on('error', () => {});
  try {
    await new Promise((resolve, reject) => {
      holder.stdout.once('data', resolve);
      holder.once('error', reject);
      holder.once('close', () => reject(new ControlError('BUILD_CACHE_BUSY', '未获得验证构建缓存锁',
        '等待其他原生验收或全量检查结束，然后重试')));
    });
    trimBuildCache();
    try { return await action(); }
    finally { trimBuildCache(); }
  } finally {
    holder.stdin.end();
  }
}

export function prepareWorkspace(path = '/work/source', source = '/project', dependencies = source) {
  rmSync(path, { recursive: true, force: true });
  cpSync(source, path, { recursive: true, filter: file => !file.endsWith('/node_modules') });
  for (const name of ['node_modules', 'packages/agent/node_modules']) {
    symlinkSync(join(dependencies, name), join(path, name));
  }
  return path;
}

export function runProcess(command, args, { cwd, env = process.env, input, log, logDir = '/logs' }) {
  return new Promise((resolve, reject) => {
    const fd = openSync(join(logDir, log), constants.O_WRONLY | constants.O_CREAT |
      constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    const child = spawn(command, args, {
      cwd, env, detached: true, stdio: [input ? 'pipe' : 'ignore', fd, fd],
    });
    closeSync(fd);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, processTimeout);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', (status, signal) => {
      clearTimeout(timeout);
      resolve(timedOut ? { status, signal, timedOut } : { status, signal });
    });
    if (input) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

export function logViolations(output, rules) {
  const text = output.toLowerCase();
  return rules.filter(rule => text.includes(rule.pattern.toLowerCase()));
}

export function logRules(root) {
  return JSON.parse(readFileSync(join(root, '.lint/verify.json'), 'utf8')).rules;
}

export async function runCheck(step, logDir) {
  const { id, scope, kind, command, args, cwd, log, rules = [], env } = step;
  const start = Date.now();
  const result = { id, scope, kind, log };
  try {
    const processResult = await runProcess(command, args, { cwd, log, logDir, env });
    const output = readFileSync(join(logDir, log), 'utf8');
    const violations = logViolations(output, rules);
    const skipped = kind === 'test' ? [...output.matchAll(/(?:^ℹ skipped (\d+)|\b(\d+) skipped)/gm)]
      .reduce((sum, [, node, native]) => sum + Number(node ?? native), 0) : 0;
    const problems = output.match(/\berror TS\d+:|^error\[E\d+\]:/gm)?.length ?? 0;
    const failed = processResult.status !== 0 || violations.length > 0;
    const nextAction = violations[0]?.nextAction ?? (processResult.timedOut ? '查看日志定位超时的构建或测试' :
      failed ? step.nextAction : skipped ? '根据日志补齐跳过用例所需的依赖并重跑' : undefined);
    return {
      ...result, status: failed ? 'failed' : skipped ? 'blocked' : 'passed',
      exitCode: processResult.status, signal: processResult.signal, timedOut: processResult.timedOut,
      durationMs: Date.now() - start, diagnostics: kind === 'typecheck' ? problems : undefined,
      skipped: kind === 'test' ? skipped : undefined, rules: violations.map(rule => rule.id), nextAction,
    };
  } catch (error) {
    return { ...result, status: 'blocked', exitCode: null, durationMs: Date.now() - start,
      diagnostic: error.message, nextAction: `核对 ${command} 和检查目录后重跑` };
  }
}

async function checkWorkspace(scope) {
  const cwd = prepareWorkspace();
  let rules = [];
  try { rules = logRules(cwd); }
  catch { /* source-rules reports the configuration error. Other checks can still run. */ }
  const agent = join(cwd, 'packages/agent');
  const steps = [
    { id: 'feature-map', scope: 'shared', kind: 'lint', command: 'node',
      args: ['scripts/check-feature-map.mjs'], log: 'map-check.log',
      nextAction: '根据日志更新 references/features 下的覆盖行和场景引用' },
    { id: 'source-rules', scope: 'shared', kind: 'lint', command: 'node',
      args: ['scripts/check-rules.mjs'], log: 'source-rules.log',
      nextAction: '按日志的文件、行号和处理提示修复规则违规或登记问题' },
    { id: 'rules-tests', scope: 'shared', kind: 'test', command: 'node',
      args: ['--test', 'scripts/check-rules.test.mjs'], log: 'rules-test.log',
      nextAction: '查看失败的规则回归和断言' },
  ];
  if (scope !== 'ui') {
    steps.push(
      { id: 'agent-types', scope: 'agent', kind: 'typecheck', command: 'node',
        args: ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], cwd: agent, log: 'agent-types.log',
        nextAction: '按 Agent TypeScript 诊断修复源码或测试' },
      { id: 'agent-tests', scope: 'agent', kind: 'test', command: 'node',
        args: ['--test', 'tests/*.test.ts', 'test/*.test.ts'], cwd: agent, log: 'agent-test.log',
        nextAction: '查看 Agent 失败用例和断言' },
    );
  }
  if (scope !== 'agent') {
    steps.push(
      { id: 'desktop-clippy', scope: 'ui', kind: 'lint', command: 'cargo',
        args: ['clippy', '--manifest-path', 'apps/desktop/Cargo.toml', '--all-targets', '--no-deps', '--', '-D', 'warnings'],
        log: 'ui-clippy.log', nextAction: '查看 Rust lint 并核对项目指定的 Clippy 工具链' },
      { id: 'desktop-types', scope: 'ui', kind: 'typecheck', command: 'nsh',
        args: ['check', 'apps/desktop', '--', '--pretty', 'false'], log: 'ui-types.log', rules,
        nextAction: '查看桌面 TypeScript 或 Rust 诊断，并核对 NSH 和 Rust 工具链' },
      { id: 'desktop-tests', scope: 'ui', kind: 'test', command: 'nsh',
        args: ['test', 'apps/desktop'], log: 'ui-test.log', rules,
        nextAction: '查看桌面失败用例及 NSH 日志' },
    );
  }
  const checks = [];
  for (const step of steps) checks.push(await runCheck({ cwd, ...step }, '/logs'));
  return { checks };
}

export async function runChecks(scope) {
  const check = async () => {
    try { return await checkWorkspace(scope); }
    finally { rmSync('/work/source', { recursive: true, force: true }); }
  };
  return scope === 'agent' ? check() : withBuildCache(check);
}

if (process.argv[1] === import.meta.filename) {
  const result = await runChecks('all');
  console.log(JSON.stringify(result));
}
