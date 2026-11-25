import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync,
  readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { staleProcessLock } from '../../packages/agent/src/runtime/process-id.ts';

export const project = resolve(import.meta.dirname, '../..');
const store = `/var/tmp/deepbot-control-${process.getuid?.()}`;
const ids = /^[a-f0-9]{16}$/;

export class ControlError extends Error {
  constructor(code, message, nextAction, details) {
    super(message);
    Object.assign(this, { code, nextAction, details });
  }
}

function validateStore() {
  const info = lstatSync(store);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new ControlError('ISOLATION_UNAVAILABLE', '测试根目录的所有者或权限不符合要求', `把 ${store} 移出原位置后重试`);
  }
}

export function resolveRun(id) {
  if (!ids.test(id ?? '')) throw new ControlError('RUN_ID_REQUIRED', '请指定 CLI 返回的测试实例 ID', '先运行 pnpm verify env start');
  if (existsSync(store)) validateStore();
  const dir = join(store, id);
  if (!existsSync(dir) || lstatSync(dir).isSymbolicLink() || !existsSync(join(dir, 'manifest.json'))) {
    throw new ControlError('RUN_NOT_FOUND', '找不到当前项目登记的测试实例', '核对 --run，或启动新的测试实例');
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  if (manifest.project !== project || manifest.id !== id) throw new ControlError('RUN_OWNERSHIP', '实例归属与当前项目不符', '在当前项目启动新的测试实例');
  return { id, dir, manifest };
}

export function createRun(id) {
  if (process.platform !== 'linux') throw new ControlError('ISOLATION_UNAVAILABLE', '当前 CLI 需要 Linux Bubblewrap', '在 Linux 测试机运行，或先查看 env doctor');
  mkdirSync(store, { recursive: true, mode: 0o700 });
  validateStore();
  const dir = join(store, id);
  mkdirSync(dir, { mode: 0o700 });
  for (const name of ['project', 'data', 'logs', 'rpc', 'screenshots', 'work']) mkdirSync(join(dir, name), { mode: 0o700 });
  const manifest = { id, project, createdAt: new Date().toISOString() };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return { id, dir, manifest };
}

// Upper bound for one child process in the sandbox (a cold native Cargo build included).
export const processTimeout = 15 * 60 * 1000;

// A lock left by a CLI that was killed (Ctrl-C, SIGKILL) names a pid that no longer runs.
function staleLock(path) {
  let text, info;
  try { text = readFileSync(path, 'utf8').trim(); info = lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  return staleProcessLock(Number(text), info.mtimeMs);
}

export async function withRunLock(run, action) {
  const path = join(run.dir, 'active-command');
  let fd;
  for (let attempt = 0; fd === undefined; attempt++) {
    try {
      fd = openSync(path, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 0 && staleLock(path)) { rmSync(path, { force: true }); continue; }
      throw new ControlError('RUN_BUSY', '测试实例已有命令在执行', '等该命令结束后重试。可用 env status 查看实例正在执行的操作');
    }
  }
  const release = () => { try { closeSync(fd); } catch {} rmSync(path, { force: true }); };
  const interrupted = signal => { release(); process.exit(signal === 'SIGINT' ? 130 : 143); };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    writeFileSync(fd, String(process.pid));
    return await action();
  } finally {
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
    release();
  }
}

const sources = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'rust-toolchain.toml', 'start.sh', '.cargo',
  'apps/desktop', 'packages/agent', 'vendor/nsh-platform-linux', 'tools/control', '.lint',
  'references/features', 'scripts', 'rules/README.md', 'skills/verify/SKILL.md'];

function includeName(name) {
  return !name.startsWith('.env') && !['node_modules', 'target', '.nsh', 'output', 'dist'].includes(name) &&
    !/\.(?:sqlite(?:-wal|-shm)?|key|pem|p12|kdbx)$/i.test(name);
}

function sourceFilter(path) {
  return includeName(basename(path)) && !lstatSync(path).isSymbolicLink();
}

function hashTree(root, accept) {
  const hash = createHash('sha256');
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      const name = relative(root, file);
      if (!accept(name, file)) continue;
      if (entry.isDirectory()) visit(file);
      if (entry.isFile()) hash.update(name).update('\0').update(readFileSync(file)).update('\0');
    }
  }
  visit(root);
  return hash.digest('hex');
}

// Same digest as the staged copy of the working tree, computed without copying it.
export function sourceFingerprint() {
  return hashTree(project, (name, file) =>
    sources.some(source => source.startsWith(name + '/')) ||
    sources.some(source => name === source || name.startsWith(source + '/')) && sourceFilter(file));
}

function copyIndex(destination, files) {
  const list = spawnSync('git', ['ls-files', '--stage', '-z', '--', ...files], { cwd: project, encoding: 'utf8' });
  if (list.status !== 0) {
    throw new ControlError('CHECK_INDEX_FAILED', '无法读取 Git 暂存区', '在项目 Git 工作区运行检查', { diagnostic: list.stderr?.trim() });
  }
  const paths = [];
  for (const entry of list.stdout.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\t');
    const [mode, , stage] = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    if (stage !== '0') throw new ControlError('CHECK_INDEX_CONFLICT', `暂存区存在冲突文件 ${path}`, '解决 Git 冲突后重新运行检查');
    if ((mode === '100644' || mode === '100755') && path.split('/').every(includeName)) paths.push(path);
  }
  const result = spawnSync('git', ['checkout-index', '-z', '--stdin', '--ignore-skip-worktree-bits', `--prefix=${destination}/`],
    { cwd: project, encoding: 'utf8', input: paths.map(path => path + '\0').join('') });
  if (result.status !== 0) {
    throw new ControlError('CHECK_INDEX_FAILED', '无法导出待提交源码', '核对 Git 暂存区后重跑检查', { diagnostic: result.stderr?.trim() });
  }
}

export function stage(run, uiOnly = false, staged = false) {
  const temp = join(run.dir, 'staging');
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp);
  const files = uiOnly ? ['apps/desktop'] : sources;
  if (staged) copyIndex(temp, files);
  else for (const name of files) {
    const destination = join(temp, name);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(project, name), destination, { recursive: true, filter: sourceFilter });
  }
  for (const name of files) {
    const destination = join(run.dir, 'project', name);
    rmSync(destination, { recursive: true, force: true });
    const source = join(temp, name);
    if (existsSync(source)) {
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(source, destination);
    }
  }
  rmSync(temp, { recursive: true, force: true });
  if (!uiOnly) {
    for (const name of ['node_modules', 'packages/agent/node_modules']) {
      mkdirSync(join(run.dir, 'project', name), { recursive: true });
    }
  }
  return hashTree(join(run.dir, 'project'), () => true);
}

function which(name) {
  for (const location of (process.env.PATH ?? '').split(':')) {
    const path = join(location, name);
    if (existsSync(path)) return realpathSync(path);
  }
}

export function doctor() {
  const bwrap = which('bwrap');
  const base = ['--unshare-user', '--unshare-all', '--disable-userns', '--clearenv',
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/sbin', '/sbin',
    '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev'];
  if (!bwrap) throw new ControlError('ISOLATION_UNAVAILABLE', '缺少 Bubblewrap', '在 Linux 测试机安装 bubblewrap 后运行 pnpm verify env doctor');
  const probe = spawnSync(bwrap, [...base, '/usr/bin/true'], { encoding: 'utf8', timeout: 5000 });
  if (probe.status !== 0) throw new ControlError('ISOLATION_UNAVAILABLE', '无法创建独立用户和网络命名空间', '检查本机 Bubblewrap 和用户命名空间策略', { diagnostic: probe.stderr?.trim() });
  const xvfb = process.env.DEEPBOT_VERIFY_XVFB || which('Xvfb');
  if (xvfb && (!existsSync(xvfb) || !lstatSync(realpathSync(xvfb)).isFile())) {
    throw new ControlError('DISPLAY_TOOL_INVALID', 'Xvfb 路径不是普通文件', '将 DEEPBOT_VERIFY_XVFB 指向测试机上的 Xvfb 可执行文件');
  }
  return { isolation: 'bubblewrap', bwrap, base, nsh: which('nsh'), browser: which('google-chrome') ?? which('chromium'), xvfb };
}

export function buildCache(directory = project) {
  return join(store, 'check-target-' + createHash('sha256').update(directory).digest('hex').slice(0, 16));
}

export function launch(run, tools, checkOnly = false) {
  const home = homedir();
  const cache = buildCache();
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const info = lstatSync(cache);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new ControlError('CHECK_CACHE_INVALID', '隔离构建缓存目录的所有者或权限不符合要求', '核对测试目录中的 check-target 路径', { path: cache });
  }
  const args = [...tools.base, '--cap-drop', 'ALL', '--tmpfs', '/tmp', '--tmpfs', '/dev/shm',
    '--dir', '/home/verify', '--dir', '/opt', '--dir', '/run/verify', '--dir', '/toolbin',
    '--ro-bind', process.execPath, '/toolbin/node',
    '--ro-bind', join(run.dir, 'project'), '/project', '--bind', join(run.dir, 'data'), '/data',
    '--tmpfs', '/work', '--bind', cache, '/work/target',
    '--bind', join(run.dir, 'logs'), '/logs', '--bind', join(run.dir, 'rpc'), '/control',
    '--bind', join(run.dir, 'screenshots'), '/screenshots'];
  if (checkOnly) args.push('--die-with-parent');
  const bind = (path, destination) => {
    if (path && existsSync(path)) args.push('--ro-bind', path, destination);
  };

  for (const filename of ['fonts', 'ld.so.cache', 'localtime']) bind(join('/etc', filename), join('/etc', filename));
  for (const name of ['cc', 'c++']) {
    const path = which(name);
    if (path?.startsWith('/usr/')) args.push('--symlink', path, `/etc/alternatives/${name}`);
  }
  for (const name of ['node_modules', 'packages/agent/node_modules']) {
    const deps = join(project, name);
    if (!existsSync(deps)) throw new ControlError('DEPENDENCIES_MISSING', '缺少项目的 Node 依赖', '在项目根目录运行 pnpm install，再启动测试');
    bind(deps, join('/project', name));
  }
  bind(tools.nsh, '/home/verify/.nsh/bin/nsh');
  for (const name of ['runtime', 'embed']) bind(join(home, '.nsh', name), join('/home/verify/.nsh', name));
  const nshCache = join(home, '.cache/nsh');
  if (existsSync(nshCache)) {
    for (const name of readdirSync(nshCache).filter(name => /^typescript-[\w.-]+$/.test(name))) {
      bind(join(nshCache, name), join('/home/verify/.cache/nsh', name));
    }
  }
  const rustVersion = readFileSync(join(run.dir, 'project/rust-toolchain.toml'), 'utf8').match(/channel = "([^"]+)"/)?.[1];
  const host = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  bind(join(home, '.rustup', 'toolchains', `${rustVersion}-${host}-unknown-linux-gnu`), '/rust');
  bind(join(home, '.cargo', 'registry'), '/cargo/registry');
  if (tools.browser === '/opt/google/chrome/google-chrome') bind('/opt/google/chrome', '/opt/google/chrome');
  else if (tools.browser?.startsWith('/usr/')) bind(tools.browser, '/toolbin/browser');
  if (tools.xvfb) bind(realpathSync(tools.xvfb), '/toolbin/Xvfb');
  const env = {
    HOME: '/home/verify', USER: 'verify', LANG: 'C.UTF-8',
    XDG_RUNTIME_DIR: '/run/verify', XDG_CACHE_HOME: '/home/verify/.cache', GSETTINGS_BACKEND: 'memory',
    PATH: '/toolbin:/home/verify/.nsh/bin:/rust/bin:/usr/bin:/usr/sbin', CARGO_HOME: '/cargo', CARGO_NET_OFFLINE: 'true',
    CARGO_TARGET_DIR: '/work/target', TMPDIR: '/tmp',
    DEEPBOT_DATA_DIR: '/data/agent', DEEPBOT_USE_CODEX_AUTH: '0',
    DEEPBOT_T3_ENDPOINT: 'http://127.0.0.1:1',
    VERIFY_BROWSER: tools.browser === '/opt/google/chrome/google-chrome' ? tools.browser : '/toolbin/browser',
  };
  for (const [key, value] of Object.entries(env)) args.push('--setenv', key, value);
  args.push('--chdir', '/project', '/toolbin/node', checkOnly ? '/project/tools/control/checks.mjs' : '/project/tools/control/worker.mjs');
  const log = openSync(join(run.dir, 'logs', 'worker.log'),
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const child = spawn(tools.bwrap, args, { detached: !checkOnly, stdio: ['ignore', checkOnly ? 'pipe' : log, log] });
    child.on('error', error => { child.launchError = error.message; });
    if (!checkOnly) child.unref();
    return child;
  } finally {
    closeSync(log);
  }
}
