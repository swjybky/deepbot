import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync, chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { connect, createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { ControlError, processTimeout } from './isolation.mjs';
import { logRules, logViolations, prepareWorkspace, runChecks, runProcess, withBuildCache } from './checks.mjs';
import { apiPolicy } from './api-policy.mjs';

const socket = '/control/service.sock';
const fixturePort = 23112;
const fixtureURL = `http://127.0.0.1:${fixturePort}/v1`;
const browserPort = 23113;
const browserURL = `http://127.0.0.1:${browserPort}`;
// The web dev host `ui serve` runs; the host reaches it and the backend through sockets in /control.
const servePort = 23114;
const modelEnv = {
  DEEPBOT_PROVIDER: 'openai', DEEPBOT_API: 'openai-completions',
  DEEPBOT_MODEL: 'verify-local', DEEPBOT_BASE_URL: fixtureURL,
  DEEPBOT_API_KEY: 'deepbot-control-fixture',
};
const artifactName = '验证产物.txt';
const artifactContent = '这是隔离环境的资料库验证文件。';
const activityReadPath = '/verify-chat-activity';
const activityBackgroundGoal = 'DEEPBOT_VERIFY_BACKGROUND_ACTIVITY';
const turns = [];
let agent, ready, snapshot, fatal, busy, uiScope = false, eventNumber = 0, stopRequested = false, served;

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(data));
}

async function body(request) {
  let buffer = '';
  for await (const chunk of request) {
    buffer += chunk;
    if (buffer.length > 1024 * 1024) throw new ControlError('INPUT_TOO_LARGE', 'JSON 超过 1 MiB', '缩小单次命令的输入');
  }
  return JSON.parse(buffer || '{}');
}

function startAgent() {
  const child = spawn(process.execPath, ['/project/packages/agent/src/main.ts'], {
    cwd: '/project', env: { ...process.env, ...modelEnv }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  agent = child;
  child.stdout.setEncoding('utf8');
  child.stderr.on('data', chunk => appendFileSync('/logs/agent.log', chunk));
  child.stdin.on('error', error => { fatal = error.message; });
  child.on('error', error => { fatal = error.message; });
  child.on('exit', (status, signal) => { fatal ??= `后台退出 ${status ?? signal}`; ready = undefined; });
  createInterface({ input: child.stdout }).on('line', line => {
    appendFileSync('/logs/protocol.jsonl', line + '\n');
    let event;
    try { event = JSON.parse(line); }
    catch {
      fatal = '后台输出了无效 JSON-lines';
      return;
    }
    if (event.type === 'ready' && event.storage === '/data/agent/session.sqlite') ready = event;
    if (event.type === 'snapshot') snapshot = event.snapshot;
    if (event.type === 'fatal') fatal = event.message;
    turns.push({ cursor: ++eventNumber, event, line });
    if (turns.length > 4096) turns.shift();
  });
}

async function waitFor(read, timeout = 15000) {
  const deadline = Date.now() + timeout;
  do {
    const value = read();
    if (value !== undefined) return value;
    await delay(45);
  } while (Date.now() < deadline);
}

function validateCommand(command, apply) {
  const policy = apiPolicy(command?.type);
  if (!policy || typeof command.requestId !== 'string') {
    throw new ControlError('COMMAND_INVALID', '不支持的协议命令或缺少 requestId', '查看 api call --help 和 packages/agent/src/protocol.ts');
  }
  if (policy.requiresApply && !apply) {
    throw new ControlError('DRY_RUN_REQUIRED', '此操作需要明确应用', '先用 api call --dry-run 检查计划，再加 --apply');
  }
  if (!ready || fatal) throw new ControlError('AGENT_NOT_READY', fatal ?? '未收到后台 ready', '先运行 env status 和 logs read --source agent，再运行 env restart --scope all');
  const baseUrl = command.config?.baseUrl;
  if (baseUrl && baseUrl !== fixtureURL) {
    throw new ControlError('EXTERNAL_ENDPOINT', '测试模型地址必须是沙箱内的模拟服务', `把模型地址改成 ${fixtureURL}`);
  }
  if (command.apiKey || command.config?.useCodexAuth || command.config?.apiKeyEnv && command.config.apiKeyEnv !== 'OPENAI_API_KEY' ||
    command.type === 'connector.t3.configure' && ('token' in command || 'approvalCredential' in command)) {
    throw new ControlError('CREDENTIAL_REFUSED', '请求携带了非测试凭据配置', '清空密钥和本机登录选项，保留种子模型配置');
  }
}

function send(command, apply = false) {
  validateCommand(command, apply);
  agent.stdin.write(JSON.stringify(command) + '\n');
}

async function call(command, apply) {
  const start = eventNumber;
  send(command, apply);
  const found = await waitFor(() => turns.find(({ cursor, event }) =>
    cursor > start && (command.type === 'sync' ? event.type === 'snapshot' :
      event.requestId === command.requestId && (event.type === 'error' ||
        event.type === (command.type === 'artifact.preview' ? 'artifact.previewed' :
          command.type === 'model.test' || command.type === 'model.list' ? 'model.result' : 'ack')))));
  if (!found) throw new ControlError('API_TIMEOUT', '协议没有在 15 秒内返回结果', '用 logs read --source protocol 核对 requestId，再用 api snapshot 核对状态', { requestId: command.requestId });
  if (found.event.type === 'error' || found.event.type === 'model.result' && !found.event.ok) {
    throw new ControlError('API_REJECTED', found.event.message, '查看 api snapshot 和协议命令的参数，再发起修正后的请求', { event: found.event });
  }
  return { requestId: command.requestId, event: found.event };
}

function display() {
  if (!existsSync('/toolbin/Xvfb')) throw new ControlError('NATIVE_DISPLAY_MISSING', '缺少独立 Xvfb 显示服务', '安装 Xvfb，或设置 DEEPBOT_VERIFY_XVFB 指向 Xvfb 可执行文件，然后执行 env restart --scope all 并重跑 ui run --target native');
  mkdirSync('/tmp/.X11-unix', { recursive: true, mode: 0o1777 });
  chmodSync('/tmp/.X11-unix', 0o1777);
  return new Promise((resolve, reject) => {
    const child = spawn('/toolbin/Xvfb', ['-displayfd', '1', '-screen', '0', '1440x900x24', '-nolisten', 'tcp', '-extension', 'GLX'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', chunk => appendFileSync('/logs/native-display.log', chunk));
    const timeout = setTimeout(() => {
      child.kill();
      reject(new ControlError('NATIVE_DISPLAY_FAILED', '私有显示未就绪', '读取 native-display 日志，修复 Xvfb 依赖后重试'));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new ControlError('NATIVE_DISPLAY_FAILED', '私有显示提前退出', '读取 native-display 日志，修复 Xvfb 依赖后重试'));
    });
    child.stdout.once('data', chunk => {
      clearTimeout(timeout);
      resolve({ child, name: `:${Number(String(chunk).trim())}` });
    });
  });
}

// The web host has no Rust crate: the app talks to the sandbox backend over HTTP instead.
function browserEntry(desktop, entry, endpoint = browserURL) {
  const configPath = join(desktop, 'nsh.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  delete config.rust;
  writeFileSync(configPath, JSON.stringify(config));
  // Run after the NSH web host has installed the app's custom tokens.
  writeFileSync(join(desktop, entry), `import { startBrowserApp } from "./tests/verify/BrowserApp";\nsetTimeout(() => startBrowserApp(${JSON.stringify(endpoint)}), 0);\n`);
}

function bridge(path, port) {
  rmSync(path, { force: true });
  const server = createSocketServer(client => {
    const upstream = connect(port, '127.0.0.1');
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => resolve(server));
  });
}

function reachable(port) {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

function stopServe() {
  if (!served) return { serving: false };
  const { child, bridges } = served;
  served = undefined;
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  for (const server of bridges) server.close();
  for (const name of ['web.sock', 'api.sock']) rmSync(`/control/${name}`, { force: true });
  return { serving: false };
}

async function serve({ api, apply }) {
  stopServe();
  if (!existsSync('/home/verify/.nsh/bin/nsh')) {
    throw new ControlError('NSH_MISSING', '缺少 NSH CLI', '安装与仓库版本匹配的 nsh，重启测试实例再重跑');
  }
  if (typeof api !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) throw new ControlError('COMMAND_INVALID', '缺少宿主端接口地址', '使用 ui serve 启动网页');
  const desktop = join(prepareWorkspace('/work/serve'), 'apps/desktop');
  browserEntry(desktop, 'App.tsx', api);
  const log = 'ui-serve.log';
  const fd = openSync(`/logs/${log}`, 'w', 0o600);
  const child = spawn('nsh', ['run', '--target', 'web', '--port', String(servePort), 'App.tsx'],
    { cwd: desktop, env: { ...process.env, ...modelEnv }, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  served = { child, bridges: [], apply: apply === true };
  child.once('exit', () => { if (served?.child === child) stopServe(); });
  const deadline = Date.now() + processTimeout;
  while (!/open in a browser/.test(readFileSync(`/logs/${log}`, 'utf8')) || !await reachable(servePort)) {
    if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) {
      stopServe();
      throw new ControlError('SERVE_FAILED', '网页开发服务未就绪', '用 logs read --source serve 查看构建错误', { log });
    }
    await delay(200);
  }
  enforceLogRules(log);
  if (/error building/i.test(readFileSync(`/logs/${log}`, 'utf8'))) {
    stopServe();
    throw new ControlError('SERVE_FAILED', '网页构建失败', '用 logs read --source serve 查看构建错误', { log });
  }
  served.bridges = await Promise.all([bridge('/control/web.sock', servePort), bridge('/control/api.sock', browserPort)]);
  return { serving: true, log, apply: served.apply };
}

function enforceLogRules(log) {
  const rule = logViolations(readFileSync(`/logs/${log}`, 'utf8'), logRules('/project'))[0];
  if (rule) throw new ControlError('CHECK_RULE_FAILED', rule.id, rule.nextAction, { log });
}

function stepsSource(steps, shotPrefix) {
  return steps.map(step => {
    const [action, input] = Object.entries(step)[0];
    const value = JSON.stringify(input);
    const lines = {
      wait: `await app.waitFor(${value}, {timeout: 12000});`,
      gone: `await app.waitFor(${value}, {timeout: 12000, state: "gone"});`,
      press: `await app.press(${value});`,
      clear: `await app.clear(${value});`,
      type: `await app.type(...${value});`,
      submit: `await app.submit(${value});`,
      rightClick: `await app.rightClick(${value});`,
      chooseMenuItem: `await app.chooseMenuItem(${value});`,
      select: `await app.press(${JSON.stringify(input[0])}); await app.waitFor(${JSON.stringify(input[1])}); await app.press(${JSON.stringify(input[1])});`,
      key: `await app.keyboard.press(${value});`,
      value: `await app.waitUntil(() => app.value(${JSON.stringify(input[0])}) === ${JSON.stringify(input[1])});`,
      screenshot: `await app.wait(250); await app.screenshot(${JSON.stringify(`/screenshots/${shotPrefix}-${input}.png`)});`,
    };
    return `console.log(${JSON.stringify(`verify step ${action}: ${value}`)}); ${lines[action]}`;
  }).join('\n');
}

async function runUi({ target, scenario, steps, expect, apply, shotPrefix }) {
  if (!existsSync('/home/verify/.nsh/bin/nsh')) {
    throw new ControlError('NSH_MISSING', '缺少 NSH CLI', '安装与仓库版本匹配的 nsh，重启测试实例再重跑');
  }
  const path = prepareWorkspace();
  const desktop = join(path, 'apps/desktop');
  const log = `${shotPrefix}.log`;
  const env = { ...process.env, ...modelEnv };
  let screen, agentLog, modelSnapshot, nativeData;
  try {
    const entry = 'App.tsx';
    const args = ['test', '--target', target === 'browser' ? 'web' : 'linux'];
    if (target === 'browser') {
      if (!existsSync(process.env.VERIFY_BROWSER)) throw new ControlError('BROWSER_MISSING', '未找到 Chromium 或 Chrome', '安装 Chromium 或 Chrome 后重启本轮实例');
      browserEntry(desktop, entry);
      const launcher = '/work/verify-chromium';
      writeFileSync(launcher, `#!/bin/sh\nexec "${process.env.VERIFY_BROWSER}" --no-sandbox --disable-crash-reporter "$@"\n`, { mode: 0o700 });
      args.push('--browser', launcher);
    } else {
      screen = await display();
      env.DISPLAY = screen.name;
      env.GDK_BACKEND = 'x11';
      env.GSK_RENDERER = 'cairo';
      nativeData = mkdtempSync('/tmp/deepbot-native-');
      env.DEEPBOT_DATA_DIR = nativeData;
      // The real App.tsx starts a sidecar from the staged source and toolchain.
      agentLog = `${shotPrefix}-agent.log`;
      env.DEEPBOT_AGENT = '/project/packages/agent/src/main.ts';
      env.DEEPBOT_NODE = '/work/verify-native-node';
      modelSnapshot = expect?.modelConfig ? `/logs/${shotPrefix}-model-snapshot.json` : undefined;
      const observer = modelSnapshot ? `/project/tools/control/native-peer.mjs "${modelSnapshot}" ` : '';
      writeFileSync(env.DEEPBOT_NODE, `#!/bin/sh\nexec /toolbin/node ${observer}"$@" 2>>"/logs/${agentLog}"\n`, { mode: 0o700 });
    }
    if (scenario === 'library-artifact') {
      const workspace = join(env.DEEPBOT_DATA_DIR, 'bots', 'xiaocai', 'workspace');
      mkdirSync(workspace, { recursive: true, mode: 0o700 });
      writeFileSync(join(workspace, artifactName), artifactContent, { mode: 0o600 });
    }
    uiScope = apply;
    const source = `try {
  ${target === 'browser' ? 'await app.setViewport(1280, 800);' : 'await app.wait(400);'}
  ${stepsSource(steps, shotPrefix)}
} catch (error) {
  await app.screenshot(${JSON.stringify(`/screenshots/${shotPrefix}-failed.png`)}).catch(() => {});
  throw error;
}`;
    const result = await runProcess('nsh', [...args, entry], { cwd: desktop, env, input: source, log });
    cpSync(`/logs/${log}`, `/logs/ui-${target}.log`);
    enforceLogRules(log);
    if (result.timedOut) throw new ControlError('UI_TIMEOUT', `界面场景超过 ${processTimeout / 60000} 分钟未结束`, `用 logs read --source ${target} 查看卡住的步骤`, { ...result, log, shotPrefix });
    if (result.status !== 0) throw new ControlError('UI_FAILED', '界面场景未通过', `用 logs read --source ${target} 检查最后一步，打开失败截图并核对控件定位`, { ...result, log, agentLog, shotPrefix });
    if (expect?.modelConfig) {
      const actual = target === 'browser' ? snapshot?.modelConfigs :
        modelSnapshot && existsSync(modelSnapshot) ? JSON.parse(readFileSync(modelSnapshot, 'utf8')) : undefined;
      if (!actual?.some(c => c.id === expect.modelConfig.id && c.name === expect.modelConfig.name)) {
        throw new ControlError('UI_STATE_MISMATCH', '公开快照里的模型名称与预期不符', '查看同一实例的 UI 日志和模型快照，核对是否保存成功', { log, modelSnapshot });
      }
    }
    return { target, scenario, log, agentLog, shotPrefix, browserBackend: target === 'browser' ? agent.pid : undefined };
  } finally {
    uiScope = false;
    screen?.child.kill();
    if (nativeData) rmSync(nativeData, { recursive: true, force: true });
  }
}

async function ui(options) {
  const run = async () => {
    try { return await runUi(options); }
    finally { rmSync('/work/source', { recursive: true, force: true }); }
  };
  return options.target === 'native' ? withBuildCache(run) : run();
}

function status() {
  return { ready: Boolean(ready && snapshot && !fatal), storage: ready?.storage, backendPid: agent?.pid,
    backendGeneration, fatal, busy, serving: Boolean(served), modelService: 'local-fixture' };
}

const backendGeneration = randomUUID();
const http = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, browserURL);
    if (request.method === 'POST' && url.pathname === '/command') {
      send(await body(request), uiScope || served?.apply === true);
      return json(response, 200, { accepted: true });
    }
    if (request.method === 'GET' && url.pathname === '/event') {
      const after = Number(url.searchParams.get('after') ?? 0);
      const found = turns.find(event => event.cursor > after);
      return json(response, 200, { cursor: found?.cursor ?? after, line: found?.line ?? null });
    }
    json(response, 404, { error: 'Unknown route' });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
});
const fixtureTools = [
  { keyword: 'DEEPBOT_VERIFY_WORK', name: 'work_start', args: {
    title: '验证事项', goal: '验证后台事项流程', criteria: ['完成合成任务'],
    reply: '已发起验证事项', assignee: 'self',
  } },
  { keyword: 'DEEPBOT_VERIFY_ASK', name: 'ask', args: {
    question: '验证提问：先处理哪一项？', options: ['整理周报', '检查资料'],
  } },
  { keyword: 'DEEPBOT_VERIFY_ARTIFACT', name: 'work_start', args: {
    title: '验证资料库', goal: 'DEEPBOT_VERIFY_ARTIFACT', criteria: ['登记工作区中的测试文件'],
    reply: '已发起资料库验证', assignee: 'self',
  } },
  { keyword: 'DEEPBOT_VERIFY_ARTIFACT', name: 'record_artifact', args: { path: artifactName } },
];

const deliveryWorks = [
  '修复消息菜单与复制',
  '修复图片粘贴与发送并核对多张截图、文件选择器、附件预览和重启后的历史消息显示',
];

function deliveryFixture(prompt, last, messages) {
  const previous = last?.role === 'tool' ? messages.at(-2)?.tool_calls?.[0]?.function?.name : undefined;
  if (prompt.includes('DEEPBOT_VERIFY_DELIVERIES')) {
    const title = last?.role === 'user' ? deliveryWorks[0] :
      previous === 'work_start' && last.content.includes(deliveryWorks[0]) ? deliveryWorks[1] : undefined;
    return title
      ? { name: 'work_start', args: { title, goal: '隔离验证交付归属', criteria: ['后台提交结果'], reply: '已发起事项', assignee: 'self' } }
      : { name: 'pass', args: {} };
  }
  const workId = /\n本批事件：\n派活结构化汇报[^\n]*：\{"workId":"([^"]+)","report":\{/.exec(prompt)?.[1];
  const board = /\n\n当前事项看板：(\[[^\n]*\])/.exec(prompt)?.[1];
  if (!workId || !board || !JSON.parse(board).some(work => work.id === workId && deliveryWorks.includes(work.title))) return undefined;
  if (previous === 'work_review') return { name: 'pass', args: {} };
  if (previous === 'work_detail') return {
    name: 'work_review', args: { workId, accepted: true, checks: ['后台已提交结果'], reply: '修好了，可以验收' },
  };
  return { name: 'work_detail', args: { workId } };
}

function fixtureReply(input) {
  const last = input.messages?.at(-1);
  const user = input.messages?.findLast(message => message.role === 'user');
  const prompt = (typeof user?.content === 'string' ? user.content :
    user?.content?.filter(part => part.type === 'text').map(part => part.text).join(' ')) ?? '';
  const hasTool = name => input.tools?.some(entry => entry.function?.name === name);
  const previous = last?.role === 'tool' ? input.messages.at(-2)?.tool_calls?.[0]?.function : undefined;
  if (prompt.includes('DEEPBOT_VERIFY_CHAT_FAILURE') && last?.role === 'user') return { failure: true };
  if (prompt.includes(activityBackgroundGoal) && !hasTool('work_start')) {
    return { delta: { content: '后台步骤已完成' }, finish: 'stop', before: 14000 };
  }
  if (prompt.includes('DEEPBOT_VERIFY_CHAT_ACTIVITY') && hasTool('web_read') && hasTool('work_start')) {
    if (last?.role === 'user') return { ...fixtureCall('web_read', { url: fixtureURL + activityReadPath + '/first' }), before: 1500 };
    if (previous?.name === 'web_read' && previous.arguments.includes('/first')) {
      return { ...fixtureCall('web_read', { url: fixtureURL + activityReadPath + '/second' }), before: 150 };
    }
    if (previous?.name === 'web_read') {
      return fixtureCall('work_start', {
        title: '运行阶段验证事项', goal: activityBackgroundGoal, criteria: ['完成后台验证步骤'],
        reply: '已发起运行阶段验证事项', assignee: 'self',
      });
    }
    if (previous?.name === 'work_start') {
      return { delta: { content: '运行阶段验证结束' }, finish: 'stop', before: 1350, after: 1700 };
    }
  }
  const delivery = hasTool('work_review') ? deliveryFixture(prompt, last, input.messages) : undefined;
  const tool = delivery ?? fixtureTools.find(({ keyword, name }) =>
    last?.role === 'user' && prompt.includes(keyword) && hasTool(name));
  if (!tool) return { delta: { content: 'DEEPBOT_VERIFY_OK' }, finish: 'stop' };
  return fixtureCall(tool.name, tool.args);
}

function fixtureCall(name, args) {
  return {
    delta: { tool_calls: [{ id: `call_${randomUUID().replaceAll('-', '')}`, type: 'function',
      function: { name, arguments: JSON.stringify(args) } }] },
    finish: 'tool_calls',
  };
}

const model = createServer(async (request, response) => {
  if (request.url === '/v1/models') return json(response, 200, { object: 'list', data: [{ id: 'verify-local', object: 'model', owned_by: 'test' }] });
  if (request.method === 'GET' && request.url?.startsWith(`/v1${activityReadPath}/`)) {
    await delay(request.url.endsWith('/first') ? 4800 : 1700);
    return json(response, 200, { result: '隔离网页读取成功' });
  }
  if (request.url === '/v1/chat/completions') {
    const input = await body(request).catch(() => ({}));
    const { delta, finish, before, after, failure } = fixtureReply(input);
    if (failure) {
      await delay(1500);
      return json(response, 400, { error: { message: '隔离验证模型失败' } });
    }
    if (before) await delay(before);
    if (!input.stream) return json(response, 200, { id: 'fixture', model: 'verify-local', choices: [{ index: 0, message: { role: 'assistant', ...delta }, finish_reason: finish }] });
    if (delta.tool_calls) delta.tool_calls[0].index = 0;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason) => JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'verify-local', choices: [{ index: 0, delta, finish_reason }] });
    response.write(`data: ${chunk({ role: 'assistant', ...delta }, null)}\n\n`);
    if (after) await delay(after);
    response.end(`data: ${chunk({}, finish)}\n\ndata: [DONE]\n\n`);
    return;
  }
  json(response, 404, { error: 'Test endpoint unavailable' });
});

const rpc = createServer(async (request, response) => {
  response.setHeader('Connection', 'close');
  let holdsLock = false;
  try {
    const { type, ...payload } = await body(request);
    if (type === 'status') return json(response, 200, { ok: true, result: status() });
    if (busy) throw new ControlError('RUN_BUSY', '测试实例有命令在执行', '等待当前命令结束后重试');
    busy = type;
    holdsLock = true;
    let result;
    if (type === 'api') result = await call(payload.command, payload.apply);
    else if (type === 'ui') result = await ui(payload);
    else if (type === 'check') result = await runChecks(payload.scope);
    else if (type === 'serve') result = await serve(payload);
    else if (type === 'serve.stop') result = stopServe();
    else if (type === 'stop') {
      stopRequested = true;
      stopServe();
      agent.stdin.end();
      await waitFor(() => agent.exitCode !== null || agent.signalCode !== null ? true : undefined, 5000);
      if (agent.exitCode === null && agent.signalCode === null) agent.kill('SIGTERM');
      await waitFor(() => agent.exitCode !== null || agent.signalCode !== null ? true : undefined, 2000);
      if (agent.exitCode === null && agent.signalCode === null) agent.kill('SIGKILL');
      result = { stopped: true };
    } else throw new ControlError('COMMAND_INVALID', '不支持的实例操作', '查看 env --help');
    json(response, 200, { ok: true, result });
  } catch (error) {
    json(response, 200, { ok: false, error: { code: error.code ?? 'SANDBOX_ERROR', message: error.message,
      nextAction: error.nextAction ?? '查看 logs read 和 env status 后重试', details: error.details } });
  } finally {
    if (holdsLock) busy = undefined;
    if (stopRequested) {
      response.once('finish', () => {
        model.close();
        http.close();
        rpc.close(() => process.exit(0));
      });
    }
  }
});

mkdirSync('/run/verify', { recursive: true, mode: 0o700 });
chmodSync('/run/verify', 0o700);
mkdirSync('/data/agent', { recursive: true, mode: 0o700 });
assert.equal(process.env.DEEPBOT_DATA_DIR, '/data/agent');
await Promise.all([
  new Promise(resolve => model.listen(fixturePort, '127.0.0.1', resolve)),
  new Promise(resolve => http.listen(browserPort, '127.0.0.1', resolve)),
]);
startAgent();
rpc.listen(socket);
