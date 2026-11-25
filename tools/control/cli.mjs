#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  constants, existsSync, fstatSync, openSync, closeSync, lstatSync, mkdirSync, mkdtempSync, readdirSync,
  readFileSync, readSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { prepareWorkspace, runCheck } from './checks.mjs';
import { validateScenario } from './scenario.mjs';
import { apiPolicy } from './api-policy.mjs';
import {
  buildCache, ControlError, createRun, doctor, launch, processTimeout, project, resolveRun, sourceFingerprint, stage, withRunLock,
} from './isolation.mjs';

const noOptions = {};
const flag = type => ({ type });
const dry = { 'dry-run': flag('boolean'), apply: flag('boolean') };
const fields = flags => Object.fromEntries(Object.entries(flags).map(([name, value]) => [name, flag(typeof value === 'boolean' ? 'boolean' : 'string')]));
const commands = {
  'env doctor': ['检查 Linux、Bubblewrap 和界面工具。', '', noOptions, {}, '报告本机依赖，无数据写入'],
  'env start': ['启动真实 Node 后端和本地模型替身。', '', fields({ scenario: '', run: '' }), { scenario: 'model-settings' },
    '默认创建实例。指定 --run 时沿用该轮数据和证据，源码变化时重启'],
  'env status': ['查看测试实例状态、后端代次和源码指纹。', '', noOptions, {}, '返回 ready、backendGeneration、sourceVersion、fresh（实例代码是否等于当前工作区）和日志目录'],
  'env restart': ['保留数据并加载当前代码，ui 仅重新载入桌面源码。', '', fields({ scope: '' }), { scope: 'all' }, 'all 重启隔离进程，ui 保留后端代次，下次 UI 用例打开新页面'],
  'env stop': ['结束 CLI 自己创建的测试实例进程。', '', noOptions, {}, '保留数据库、日志和截图'],
  'api call': ['向测试后端发送 JSON-lines 协议命令。', '<type>', { ...fields({ input: '' }), ...dry }, { input: '-' }, '从 stdin 读取 JSON，返回协议响应。删数据、取消事项或打开系统应用需明确应用'],
  'api snapshot': ['发送 sync，查询当前测试数据。', '', noOptions, {}, '返回快照和序号'],
  'ui run': ['按场景操作真实 UI，断言、截图并检查日志。', '<scenario>', { ...fields({ target: '' }), ...dry }, { target: 'browser' }, 'browser 使用无头 Chromium 和同一后端。native 在私有显示中使用正式入口和独立数据库'],
  'ui serve': ['在宿主 127.0.0.1 端口提供连接本轮测试后端的网页，供浏览器工具打开。', '', { ...fields({ port: '' }), apply: flag('boolean') }, { port: '自动' },
    '返回 url。网页与 CLI 共用本轮后端和合成数据，代码改动不会热更新。删除类操作需 --apply。用完运行 ui close'],
  'ui close': ['关闭 ui serve 提供的网页和端口。', '', noOptions, {}, '返回 serving: false'],
  'logs read': ['读取本轮日志尾部。', '', fields({ source: '', tail: '', 'request-id': '' }), { source: 'agent', tail: '60' }, '返回日志路径和行，可按 requestId 过滤'],
  check: ['全量执行规则、类型检查和离线测试。', '', fields({ run: '', staged: false }), {},
    '默认隔离检查工作区，可通过 --staged 检查暂存区，或用 --run 关联界面验收证据'],
  'check run': ['运行相关类型检查和测试，并执行 .lint 规则。', '', fields({ scope: '' }), { scope: 'all' }, '返回各项退出码和日志'],
  'data reset': ['预演或重置测试数据，然后启动一份干净的实例。', '', dry, { 'dry-run': true }, '默认预演，应用前必须停止实例，截图和日志保留'],
  'data delete': ['预演或删除测试数据。', '', dry, { 'dry-run': true }, '默认预演，应用前必须停止实例，截图和日志保留'],
  'evidence review-input': ['生成本轮所有场景的视觉复核输入。', '', fields({ 'reference-run': '' }), {}, '返回当前源码版本的全部原生截图和 SHA-256、场景状态及设计条目，可指定另一隔离轮次作参照'],
  'evidence review-save': ['保存与当前图片相对应的视觉复核结果。', '', fields({ input: '' }), { input: '-' }, '输入 JSON 含 imageDigests、checks，检查项含 rule、observation 和 status'],
  'evidence report': ['汇总本轮操作、截图、模型复核和日志。', '', noOptions, {}, '返回 status：passed、failed、incomplete（missing 列出缺项）或 stale（工作区在测试后有改动）'],
};
const groupNames = new Set(Object.keys(commands).map(key => key.split(' ')[0]));
const runLess = new Set(['env doctor', 'env start', 'check']);
const testScopes = ['ui', 'agent', 'control', 'all'];

function help(key) {
  const command = commands[key];
  const prefix = 'pnpm --silent verify';
  if (!command) {
    return {
      usage: `${prefix} <group> <command> [options] 或 ${prefix} check [options]`,
      commands: Object.entries(commands).filter(([name]) => !key || name.startsWith(key + ' ')).map(([name, [description]]) => ({ name, description })),
      nextAction: `运行 ${prefix} <group> <command> --help 查看可用参数和示例`,
    };
  }
  const [description, positional, options, defaults, effects] = command;
  const requiredRun = !runLess.has(key);
  return {
    usage: [prefix, key, positional, requiredRun ? '--run <runId>' : '', '[options]'].filter(Boolean).join(' '),
    description, effects, defaults,
    options: { ...(requiredRun ? { run: 'CLI 返回的测试实例 ID，必需' } : {}),
      ...Object.fromEntries(Object.entries(options).map(([name, spec]) => [name, {
        type: spec.type, values: name === 'scope' ? (key === 'env restart' ? ['ui', 'all'] : testScopes) :
          name === 'target' ? ['browser', 'native'] : undefined,
        description: {
          scenario: 'tools/control/scenarios 下的场景名', scope: '选择作用于哪个部分',
          target: '无头浏览器或私有显示中的原生窗口', input: '使用 - 从 stdin 读测试 JSON',
          source: 'agent、ui、browser、native、serve、forward、protocol、worker、native-display 或各检查日志名',
          port: '宿主端网页端口，1024 到 65535，默认自动选择',
          run: key === 'env start' ? '可选，继续使用此测试实例' : '可选，关联现有隔离测试实例的证据',
          staged: '从 Git 暂存区导出待提交源码，与 --run 互斥',
          tail: '返回末尾 N 行，范围 1 到 1000', 'request-id': '仅保留包含此请求 ID 的行',
          'reference-run': '提供同场景修改前的测试轮次',
          'dry-run': '只显示计划', apply: '执行已预览的操作',
        }[name],
      }])) },
    example: `${prefix} ${key}${positional ? key === 'ui run' ? ' model-settings' : ' sync --input -' : ''}${requiredRun ? ' --run <runId>' : ''}`,
    output: { ok: 'boolean', command: 'string', runId: 'string when applicable',
      result: key === 'check' ? '{ scope, source, sourceVersion, summary, checks, logs }' : 'object on success',
      error: '{ code, message, nextAction, details? } on failure' },
    exitCodes: { 0: '成功', 1: '检查或运行失败', 2: '参数不合法', 3: '测试环境未就绪或实例被占用' },
  };
}

function fail(code, message, nextAction, details) {
  throw new ControlError(code, message, nextAction, details);
}

function member(value, choices, label) {
  if (!choices.includes(value)) fail('USAGE', `${label} 可选值为 ${choices.join(', ')}`, '使用 --help 查看参数');
  return value;
}

function input(source) {
  if (source !== '-') fail('USAGE', '测试 JSON 仅通过 stdin 输入', '使用 --input -，将合成的测试 JSON 传入 stdin');
  try {
    const value = process.stdin.isTTY ? {} : JSON.parse(readFileSync(0, 'utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象');
    return value;
  } catch (error) {
    fail('USAGE', `JSON 输入无效：${error.message}`, '修正测试 JSON 后重试');
  }
}

function readOwned(dir, name, tail = false) {
  if (!/^[\w.-]+$/.test(name) || name === '.' || name === '..') fail('USAGE', '文件名不受支持', '仅使用 CLI 产物名称');
  const file = join(dir, name);
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile()) fail('ARTIFACT_INVALID', '产物不是普通文件', '重新运行对应测试获取产物');
    const size = Math.min(info.size, 16 * 1024 * 1024);
    if (!tail && info.size !== size) fail('ARTIFACT_INVALID', '产物超过最大可读大小', '缩小测试输入后重跑');
    const buffer = Buffer.alloc(size);
    const bytes = readSync(fd, buffer, 0, size, tail ? info.size - size : 0);
    return buffer.subarray(0, bytes);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readState(run, name, fallback) {
  try { return JSON.parse(readOwned(run.dir, name).toString()); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function writeState(run, name, value) {
  const temporary = join(run.dir, `.${name}.${randomUUID()}`);
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(temporary, join(run.dir, name));
  } finally {
    rmSync(temporary, { force: true });
  }
}

function rpc(run, payload, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const endpoint = join(run.dir, 'rpc', 'service.sock');
    const req = request({ socketPath: endpoint, method: 'POST', path: '/' }, response => {
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { buffer += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const reply = JSON.parse(buffer);
          if (reply.ok) resolve(reply.result);
          else reject(new ControlError(reply.error.code, reply.error.message, reply.error.nextAction, reply.error.details));
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new ControlError('RUN_TIMEOUT', '测试实例操作超时', '查看本轮日志和 env status，再决定重试或重启')));
    req.end(JSON.stringify(payload));
  });
}

async function status(run) {
  try { return await rpc(run, { type: 'status' }, 1500); }
  catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) return { ready: false, stopped: true };
    throw error;
  }
}

async function ensureReady(run) {
  const current = await status(run);
  if (!current.ready) fail('AGENT_NOT_READY', current.fatal ?? '测试后端未就绪', '查看 logs read --source worker 和 --source agent，再运行 env restart --scope all', { runId: run.id });
  return current;
}

async function start(run, tools = doctor()) {
  for (const name of ['data', 'work']) {
    const directory = join(run.dir, name);
    if (!existsSync(directory)) {
      mkdirSync(directory, { mode: 0o700 });
      if (name === 'data') {
        writeState(run, 'ui-results.json', {});
        rmSync(join(run.dir, 'api-result.json'), { force: true });
      }
    }
    if (!lstatSync(directory).isDirectory()) fail('ISOLATION_UNAVAILABLE', '测试数据根不是目录', '启动新测试实例');
  }
  const socket = join(run.dir, 'rpc', 'service.sock');
  if (existsSync(socket)) rmSync(socket);
  const worker = launch(run, tools);
  const end = Date.now() + 35000;
  do {
    if (worker.exitCode !== null || worker.launchError) fail('SANDBOX_START_FAILED', worker.launchError ?? `隔离进程退出，退出码 ${worker.exitCode}`,
      '查看 logs read --source worker，核对本机依赖后重启测试实例', { runId: run.id });
    const current = await status(run);
    if (current.ready) return current;
    if (current.fatal) fail('AGENT_START_FAILED', current.fatal, '读取 agent 和 worker 日志，修复后执行 env restart --scope all', { runId: run.id });
    await delay(100);
  } while (Date.now() < end);
  fail('AGENT_START_TIMEOUT', '35 秒内未收到 ready 和 snapshot', '运行 logs read --source worker 查隔离启动错误，再查 agent 日志', { runId: run.id });
}

function forwarderPid(run) {
  const state = readState(run, 'serve.json', null);
  if (!Number.isInteger(state?.pid)) return;
  try {
    const command = readFileSync(`/proc/${state.pid}/cmdline`, 'utf8').split('\0');
    if (command.includes(join(project, 'tools/control/forward.mjs')) && command.includes(run.dir)) return state.pid;
  } catch {}
}

async function closeServe(run) {
  const pid = forwarderPid(run);
  if (pid) process.kill(pid, 'SIGTERM');
  rmSync(join(run.dir, 'serve.json'), { force: true });
  if (!(await status(run)).stopped) await rpc(run, { type: 'serve.stop' });
  return { serving: false };
}

async function serve(run, flags) {
  const port = flags.port === undefined ? 0 : Number(flags.port);
  if (!Number.isInteger(port) || port !== 0 && (port < 1024 || port > 65535)) fail('USAGE', '端口需为 1024 到 65535 的整数', '去掉 --port 自动选择，或换一个端口');
  await ensureReady(run);
  await closeServe(run);
  const log = openSync(join(run.dir, 'logs', 'forward.log'), 'a', 0o600);
  const child = spawn(process.execPath, [join(project, 'tools/control/forward.mjs'), run.dir, String(port)],
    { detached: true, stdio: ['ignore', log, log] });
  closeSync(log);
  child.unref();
  let state;
  for (const end = Date.now() + 5000; Date.now() < end && !state; await delay(50)) {
    if (child.exitCode !== null) break;
    state = readState(run, 'serve.json', null);
  }
  if (!state) {
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    fail('SERVE_PORT_FAILED', '宿主端口未能监听', port ? '换一个 --port，或去掉它自动选择' : '查看 logs 目录下的 forward.log');
  }
  try {
    const result = await rpc(run, { type: 'serve', api: `http://127.0.0.1:${state.api}`, apply: flags.apply === true }, processTimeout + 60000);
    return { ...result, url: `http://127.0.0.1:${state.page}/`, api: `http://127.0.0.1:${state.api}` };
  } catch (error) {
    await closeServe(run).catch(() => {});
    throw error;
  }
}

async function stop(run) {
  await closeServe(run);
  if ((await status(run)).stopped) return { stopped: true };
  const result = await rpc(run, { type: 'stop' });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await status(run)).stopped) return result;
    await delay(60);
  }
  fail('RUN_STOP_TIMEOUT', '等待实例退出超时', '查看 env status 和 worker 日志，实例退出前不要重置数据库');
}

function loadScenario(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? '')) fail('USAGE', '场景名无效', '查看 ui run --help');
  const path = join(project, 'tools/control/scenarios', name + '.json');
  if (!existsSync(path)) fail('SCENARIO_NOT_FOUND', `找不到场景 ${name}`, '在 tools/control/scenarios 下选择或添加场景');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  validateScenario(value);
  return value;
}

const aliases = {
  agent: 'agent.log', worker: 'worker.log', browser: 'ui-browser.log', ui: 'ui-browser.log',
  native: 'ui-native.log', serve: 'ui-serve.log', forward: 'forward.log', protocol: 'protocol.jsonl', 'native-display': 'native-display.log',
  'agent-test': 'agent-test.log', 'agent-types': 'agent-types.log', 'ui-test': 'ui-test.log', 'ui-types': 'ui-types.log',
  'map-check': 'map-check.log', 'control-test': 'control-test.log',
  'source-rules': 'source-rules.log', 'rules-test': 'rules-test.log', 'ui-clippy': 'ui-clippy.log',
};

function readLog(run, flags) {
  const source = flags.source ?? 'agent';
  const file = Object.hasOwn(aliases, source) ? aliases[source] : undefined;
  const count = Number(flags.tail ?? 60);
  if (!file || !Number.isInteger(count) || count < 1 || count > 1000) fail('USAGE', '日志源或行数无效', '查看 logs read --help');
  const dir = join(run.dir, 'logs');
  let contents;
  try { contents = readOwned(dir, file, true).toString(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lines = (contents ?? '').trimEnd().split('\n').filter(line => line && (!flags['request-id'] || line.includes(flags['request-id'])));
  return { source, path: join(dir, file), exists: contents !== undefined, lines: lines.slice(-count) };
}

function screenshots(run, results) {
  const names = results ? readdirSync(join(run.dir, 'screenshots')).filter(name => name.startsWith(results.shotPrefix + '-') && name.endsWith('.png')).sort() : [];
  return names.map(name => ({
    path: join(run.dir, 'screenshots', name),
    sha256: createHash('sha256').update(readOwned(join(run.dir, 'screenshots'), name)).digest('hex'),
  }));
}

function visual(run) {
  const evidence = readState(run, 'ui-results.json', {});
  const current = target => [evidence[target] ?? []].flat().filter(result => result.sourceVersion === run.manifest.sourceVersion);
  const ui = { browser: current('browser'), native: current('native') };
  const target = ui.native.length ? 'native' : 'browser';
  const results = ui[target];
  const images = results.flatMap(result => screenshots(run, result).map(image => ({ ...image, scenario: result.scenario })));
  const design = [...new Set(results.flatMap(result => result.design))].map(path => join(project, path));
  return { ui, target, images, design };
}

function recordUi(run, result, scenario) {
  const results = readState(run, 'ui-results.json', {});
  results[result.target] = [results[result.target] ?? []].flat()
    .filter(entry => entry.sourceVersion === run.manifest.sourceVersion);
  results[result.target].push({ ...result, design: scenario.design ?? [], sourceVersion: run.manifest.sourceVersion,
    scenarioVersion: createHash('sha256').update(JSON.stringify(scenario)).digest('hex') });
  writeState(run, 'ui-results.json', results);
}

function sandboxChecks(run) {
  return new Promise((resolve, reject) => {
    const worker = launch(run, doctor(), true);
    let output = '';
    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', chunk => { output += chunk; });
    worker.once('error', reject);
    worker.once('close', (status, signal) => {
      try {
        if (status !== 0) throw new Error(worker.launchError ?? `隔离检查退出 ${status ?? signal}`);
        resolve(JSON.parse(output));
      } catch (error) {
        reject(new ControlError('CHECK_SANDBOX_FAILED', error.message, '检查 worker.log 并核对测试依赖与待测源码',
          { logPath: join(run.dir, 'logs', 'worker.log') }));
      }
    });
  });
}

async function checkProject(run, scope, standalone, staged) {
  const parts = scope === 'all' ? ['agent', 'ui', 'control'] : [scope];
  const logDir = join(run.dir, 'logs');
  const source = staged ? 'index' : standalone ? 'working-tree' : 'run';
  const steps = [];
  try {
    if (standalone) {
      run.manifest.sourceVersion = stage(run, false, staged);
      writeState(run, 'manifest.json', run.manifest);
    }
    if (scope !== 'control') {
      const result = standalone ? await sandboxChecks(run) :
        await rpc(run, { type: 'check', scope }, processTimeout * 8 + 60000);
      steps.push(...result.checks);
    }
    if (parts.includes('control')) {
      // The control tests create their own sandboxes. The driver uses the same source snapshot on the host.
      const cwd = mkdtempSync(join(run.dir, 'work', 'control-'));
      try {
        prepareWorkspace(cwd, join(run.dir, 'project'), project);
        steps.push(await runCheck({ id: 'control-tests', scope: 'control', kind: 'test', command: process.execPath,
          args: ['--test', 'tools/control/cli.test.mjs'], cwd, log: 'control-test.log',
          env: { HOME: homedir(), PATH: process.env.PATH, LANG: 'C.UTF-8', DEEPBOT_VERIFY_XVFB: process.env.DEEPBOT_VERIFY_XVFB },
          nextAction: '查看控制 CLI 回归的失败用例和断言' }, logDir));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(buildCache(cwd), { recursive: true, force: true });
      }
    }
  } finally {
    if (standalone) {
      for (const name of ['project', 'data', 'work', 'staging']) rmSync(join(run.dir, name), { recursive: true, force: true });
    }
  }
  const checks = steps.map(step => ({ ...step, logPath: join(logDir, step.log) }));
  const failures = checks.filter(step => step.status !== 'passed');
  const summary = { total: checks.length, passed: checks.length - failures.length,
    failed: failures.filter(step => step.status === 'failed').length,
    blocked: failures.filter(step => step.status === 'blocked').length };
  const result = { scope, source, sourceVersion: run.manifest.sourceVersion, summary, checks, logs: logDir };
  const stored = readState(run, 'check-results.json', {});
  for (const part of parts) {
    const failed = failures.some(step => step.scope === part || step.scope === 'shared' || scope === 'all' && step.scope === 'control');
    stored[part] = { ...result, status: failed ? 'failed' : 'passed', recordedAt: new Date().toISOString() };
  }
  writeState(run, 'check-results.json', stored);
  if (failures.length) {
    const first = failures[0];
    const code = first.id === 'feature-map' ? 'FEATURE_MAP_STALE' : first.timedOut ? 'CHECK_TIMEOUT' : 'CHECK_FAILED';
    fail(code, `${failures.length} 项检查未通过`, `查看 ${first.logPath}。 ${first.nextAction}`, result);
  }
  return result;
}

async function execute(key, flags, positional, run) {
  if (flags['dry-run'] && flags.apply) fail('USAGE', '--dry-run 与 --apply 只能选一个', '先用 --dry-run 预演，再按需要单独使用 --apply');
  if (key === 'env doctor') {
    const { base, ...tools } = doctor();
    // Report a missing tool as null rather than dropping its key.
    return Object.fromEntries(Object.entries(tools).map(([name, value]) => [name, value ?? null]));
  }
  if (key === 'env start') {
    const scenario = flags.scenario ?? run.manifest.scenario ?? 'model-settings';
    loadScenario(scenario);
    const current = flags.run === undefined ? { stopped: true } : await status(run);
    const fresh = flags.run !== undefined && run.manifest.sourceVersion === sourceFingerprint();
    if (!fresh) {
      if (!current.stopped) await stop(run);
      run.manifest.sourceVersion = stage(run);
    } else if (!current.ready && !current.stopped) {
      await stop(run);
    }
    run.manifest.scenario = scenario;
    writeState(run, 'manifest.json', run.manifest);
    const state = fresh && current.ready ? current : await start(run);
    return { ...state, reused: flags.run !== undefined, sourceVersion: run.manifest.sourceVersion, scenario, logs: join(run.dir, 'logs') };
  }
  if (key === 'env status') {
    return { ...await status(run), ...run.manifest, fresh: run.manifest.sourceVersion === sourceFingerprint(), logs: join(run.dir, 'logs') };
  }
  if (key === 'env stop') return stop(run);
  if (key === 'env restart') {
    const scope = member(flags.scope ?? 'all', ['ui', 'all'], 'scope');
    let state;
    await closeServe(run);
    if (scope === 'ui') {
      state = await ensureReady(run);
      const before = state.backendGeneration;
      run.manifest.sourceVersion = stage(run, true);
      state = await ensureReady(run);
      if (state.backendGeneration !== before) fail('AGENT_RESTARTED', '仅前端重载期间后端代次发生变化', '查看 worker 日志并执行 env restart --scope all');
    } else {
      await stop(run);
      run.manifest.sourceVersion = stage(run);
      writeState(run, 'manifest.json', run.manifest);
      state = await start(run);
    }
    writeState(run, 'manifest.json', run.manifest);
    return { scope, ...state, sourceVersion: run.manifest.sourceVersion };
  }
  if (key === 'logs read') return readLog(run, flags);
  if (key === 'ui serve') return serve(run, flags);
  if (key === 'ui close') return closeServe(run);
  if (key === 'api snapshot' || key === 'api call') {
    const command = key === 'api snapshot' ? { type: 'sync' } : { ...input(flags.input ?? '-'), type: positional };
    command.requestId ??= randomUUID();
    const policy = apiPolicy(command.type);
    if (!policy || typeof command.requestId !== 'string') {
      fail('COMMAND_INVALID', '不支持的协议命令或 requestId 无效', '查看 tools/control/api-policy.mjs 和 packages/agent/src/protocol.ts');
    }
    if (flags['dry-run'] || policy.requiresApply && !flags.apply) {
      return { dryRun: true, type: command.type, requestId: command.requestId,
        target: command.botId ?? command.modelConfigId ?? command.memoryId ?? command.workId ?? command.artifactId, writes: false };
    }
    await ensureReady(run);
    const result = await rpc(run, { type: 'api', command, apply: flags.apply === true });
    writeState(run, 'api-result.json', {
      command: command.type, requestId: result.requestId, response: result.event.type, seq: result.event.seq,
      sourceVersion: run.manifest.sourceVersion,
    });
    return result;
  }
  if (key === 'ui run') {
    const name = positional;
    const scenario = loadScenario(name);
    const target = member(flags.target ?? 'browser', ['browser', 'native'], 'target');
    if (flags['dry-run'] || scenario.destructive && !flags.apply) {
      return { dryRun: true, scenario: name, target, steps: scenario.steps, writes: false };
    }
    await ensureReady(run);
    const shotPrefix = `${target}-${name}-${Date.now()}-${randomBytes(4).toString('hex')}`;
    let result;
    try {
      result = await rpc(run, { type: 'ui', target, scenario: name, steps: scenario.steps,
        expect: scenario.expect, apply: flags.apply === true, shotPrefix }, processTimeout + 60000);
    } catch (error) {
      recordUi(run, { target, scenario: name, shotPrefix, log: error.details?.log,
        agentLog: error.details?.agentLog, status: 'failed', error: error.code }, scenario);
      error.details = { ...error.details, screenshots: screenshots(run, { shotPrefix }) };
      throw error;
    }
    recordUi(run, { ...result, status: 'passed' }, scenario);
    return { ...result, screenshots: screenshots(run, result) };
  }
  if (key === 'check' || key === 'check run') {
    const standalone = key === 'check' && flags.run === undefined;
    if (!standalone) {
      await ensureReady(run);
      if (key === 'check' && run.manifest.sourceVersion !== sourceFingerprint()) {
        fail('CHECK_SOURCE_STALE', '实例源码和当前工作区不一致', '先执行 env restart --scope all，或直接运行 verify check');
      }
    }
    return checkProject(run, member(flags.scope ?? 'all', testScopes, 'scope'), standalone, flags.staged);
  }
  if (key.startsWith('data ')) {
    const target = join(run.dir, 'data');
    const targets = key === 'data delete' ? [target, join(run.dir, 'work')] : [target];
    const running = !(await status(run)).stopped;
    if (!flags.apply) return { dryRun: true, operation: key, targets, running, writes: false };
    if (running) fail('RUN_ACTIVE', '实例正在运行', '先运行 env stop，再执行已核对的 --apply 操作');
    if (targets.some(path => existsSync(path) && !lstatSync(path).isDirectory())) {
      fail('RUN_OWNERSHIP', '测试数据根不是普通目录', '使用新的测试实例');
    }
    for (const path of targets) rmSync(path, { recursive: true, force: true });
    if (key === 'data delete') return { deleted: true, targets };
    return { reset: true, target, ...await start(run) };
  }
  if (key === 'evidence review-input') {
    const current = visual(run);
    if (!flags['reference-run']) return current;
    const baseline = visual(resolveRun(flags['reference-run']));
    if (!baseline.images.length || baseline.target !== current.target ||
      JSON.stringify(baseline.ui[baseline.target].map(entry => entry.scenario)) !==
        JSON.stringify(current.ui[current.target].map(entry => entry.scenario))) {
      fail('REFERENCE_MISMATCH', '参照轮次缺少同一场景和宿主的截图', '重跑同视口、同数据的修改前用例再选择参照轮次');
    }
    return { ...current, reference: baseline.images };
  }
  if (key === 'evidence review-save') {
    const values = input(flags.input ?? '-');
    const current = visual(run);
    if (current.target !== 'native' || !current.images.length) fail('NATIVE_REVIEW_REQUIRED', '没有本轮原生截图', '先运行 ui run --target native 获取截图');
    if (JSON.stringify(values.imageDigests) !== JSON.stringify(current.images.map(image => image.sha256)) ||
      !Array.isArray(values.checks) || !values.checks.length || values.checks.some(check =>
        !check?.rule || !check.observation || !['passed', 'failed', 'unverified'].includes(check.status))) {
      fail('REVIEW_INVALID', '复核结果与当前截图或检查项不匹配', '重新读取 evidence review-input，提交按图顺序排列的 imageDigests 和逐项观察');
    }
    writeState(run, 'visual-review.json', values);
    return { saved: true, path: join(run.dir, 'visual-review.json') };
  }
  if (key === 'evidence report') {
    const current = visual(run);
    const fresh = run.manifest.sourceVersion === sourceFingerprint();
    const stored = readState(run, 'visual-review.json', null);
    const uiFailed = target => current.ui[target].some(entry => entry.status === 'failed');
    const reviewed = current.target === 'native' && current.images.length > 0 && stored &&
      JSON.stringify(stored.imageDigests) === JSON.stringify(current.images.map(image => image.sha256));
    const visualStatus = uiFailed(current.target) || reviewed && stored.checks.some(check => check.status === 'failed') ? 'failed' :
      reviewed && stored.checks.every(check => check.status === 'passed') ? 'passed' : 'unverified';
    const sameSource = state => state?.sourceVersion === run.manifest.sourceVersion ? state : null;
    const storedChecks = readState(run, 'check-results.json', {});
    const checks = Object.fromEntries(['agent', 'ui'].map(part => [part, sameSource(storedChecks[part])]));
    const control = sameSource(storedChecks.control);
    if (control) checks.control = control;
    const failed = [
      ...Object.entries(checks).filter(([, value]) => value?.status === 'failed').map(([part]) => `checks:${part}`),
      ...Object.keys(current.ui).filter(uiFailed).map(target => `ui:${target}`),
      ...(visualStatus === 'failed' && !uiFailed(current.target) ? ['visual-review'] : []),
    ];
    const missing = [
      ...Object.entries(checks).filter(([, value]) => !value).map(([part]) => `checks:${part}`),
      ...(current.ui.native.length ? [] : ['ui:native']),
      ...(visualStatus === 'unverified' ? ['visual-review'] : []),
    ];
    const report = {
      status: !fresh ? 'stale' : failed.length ? 'failed' : missing.length ? 'incomplete' : 'passed',
      fresh, failed, missing,
      sourceVersion: run.manifest.sourceVersion, scenario: run.manifest.scenario, ...current, visualStatus,
      checks, api: sameSource(readState(run, 'api-result.json', null)),
      review: reviewed ? stored : null, logs: join(run.dir, 'logs'), recordedAt: new Date().toISOString(),
    };
    writeState(run, 'report.json', report);
    return { ...report, path: join(run.dir, 'report.json') };
  }
}

const argv = process.argv.slice(2);
let key = '';
let id;
try {
  if (!argv.length || argv[0] === '--help') console.log(JSON.stringify({ ok: true, result: help('') }));
  else if (groupNames.has(argv[0]) && !Object.hasOwn(commands, argv[0]) && (argv.length === 1 || argv[1] === '--help')) {
    console.log(JSON.stringify({ ok: true, result: help(argv[0]) }));
  } else {
    const grouped = argv.slice(0, 2).join(' ');
    key = Object.hasOwn(commands, grouped) || !Object.hasOwn(commands, argv[0]) ? grouped : argv[0];
    if (!Object.hasOwn(commands, key)) fail('USAGE', `未知命令 ${key}`, '运行 pnpm --silent verify --help');
    const parsed = parseArgs({ args: argv.slice(key.split(' ').length), allowPositionals: true,
      options: { ...commands[key][2], help: flag('boolean'), ...(!runLess.has(key) ? { run: flag('string') } : {}) } });
    if (parsed.values.help) console.log(JSON.stringify({ ok: true, command: key, result: help(key) }));
    else {
      const expected = commands[key][1] ? 1 : 0;
      if (parsed.positionals.length !== expected) fail('USAGE', '位置参数数目无效', `运行 ${key} --help`);
      if (key === 'check' && parsed.values.staged && parsed.values.run !== undefined) {
        fail('USAGE', '--staged 与 --run 互斥', '选择暂存区，或关联现有测试实例');
      }
      const newRun = ['env start', 'check'].includes(key) && parsed.values.run === undefined;
      const run = key === 'env doctor' ? undefined : newRun ?
        createRun(randomBytes(8).toString('hex')) : resolveRun(parsed.values.run);
      id = run?.id;
      const action = () => execute(key, parsed.values, parsed.positionals[0], run);
      const result = run && !['env status', 'logs read', 'evidence review-input'].includes(key) ? await withRunLock(run, action) : await action();
      console.log(JSON.stringify({ ok: true, command: key, runId: id, result }));
    }
  }
} catch (error) {
  const code = typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS') ? 'USAGE' : (error.code ?? 'CONTROL_ERROR');
  const nextAction = error.nextAction ?? (code === 'USAGE' ? `运行 pnpm --silent verify ${key} --help` : '查看当前测试实例和日志后重试');
  console.log(JSON.stringify({ ok: false, command: key, runId: id, error: { code, message: error.message, nextAction, details: error.details } }));
  process.exitCode = code === 'USAGE' ? 2 : /NOT_READY|UNAVAILABLE|MISSING|RUN_NOT_FOUND|RUN_BUSY|BUILD_CACHE_BUSY/.test(code) ? 3 : 1;
}
