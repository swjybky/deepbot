#!/usr/bin/env node
// Compares the app's UI entries and protocol commands with references/features/*.md.
// Each feature page declares what it covers on one line:
//   - **覆盖** 界面 `modal:createBot`、`tab:library`；接口 `bot.upsert`
// Fails when code has an entry no page covers, a page names one the code no longer has,
// a page runs a scenario that does not exist, a scenario no page uses, or README misses a page.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

function union(source, name) {
  const match = new RegExp(`export type ${name}\\s*=([^;]+);`).exec(source);
  if (!match) throw new Error(`找不到类型 ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

/** Every entry the code exposes, keyed by the token a feature page uses for it. */
export function codeEntries() {
  const ui = read('apps/desktop/ui/state/ui.ts');
  const entries = new Map();
  const add = (token, origin) => entries.set(token, origin);
  for (const name of union(ui, 'ModalName')) add(`modal:${name}`, 'apps/desktop/ui/state/ui.ts ModalName');
  for (const name of union(ui, 'SettingsSection')) add(`settings:${name}`, 'apps/desktop/ui/state/ui.ts SettingsSection');
  for (const name of union(ui, 'InfoTab')) add(`tab:${name}`, 'apps/desktop/ui/state/ui.ts InfoTab');
  for (const name of union(ui, 'BotConfigurationSection')) add(`config:${name}`, 'apps/desktop/ui/state/ui.ts BotConfigurationSection');
  const protocol = read('packages/agent/src/protocol.ts');
  const commands = /export type Command\s*=([\s\S]+?);\s*export type HostMessage/.exec(protocol);
  if (!commands) throw new Error('找不到 protocol.ts 中的 Command 类型');
  for (const [, types] of commands[1].matchAll(/type:\s*((?:"[^"]+"\s*\|?\s*)+)/g)) {
    for (const [, name] of types.matchAll(/"([^"]+)"/g)) add(name, 'packages/agent/src/protocol.ts Command');
  }
  return entries;
}

export function checkFeatureMap() {
  const dir = 'references/features';
  const pages = readdirSync(join(root, dir)).filter(name => name.endsWith('.md') && name !== 'README.md').sort();
  const readme = read(join(dir, 'README.md'));
  const code = codeEntries();
  const covered = new Map();
  const problems = [];
  const scenarios = new Set(readdirSync(join(root, 'tools/control/scenarios')).filter(n => n.endsWith('.json')).map(n => basename(n, '.json')));
  const usedScenarios = new Set();

  for (const page of pages) {
    const text = read(join(dir, page));
    if (!readme.includes(`(${page})`)) problems.push(`README.md 没有链接 ${page}`);
    const lines = text.split('\n').filter(line => /^\s*-\s*\*\*覆盖\*\*/.test(line));
    if (lines.length !== 1) problems.push(`${page} 需要恰好一行「- **覆盖** …」，实际 ${lines.length} 行`);
    for (const line of lines) {
      for (const [, token] of line.matchAll(/`([^`]+)`/g)) {
        if (!code.has(token)) problems.push(`${page} 写了 \`${token}\`，代码里已没有这个入口或接口`);
        covered.set(token, [...(covered.get(token) ?? []), page]);
      }
    }
    for (const [, name] of text.matchAll(/verify ui run ([a-z0-9-]+)/g)) {
      usedScenarios.add(name);
      if (!scenarios.has(name)) problems.push(`${page} 运行的场景 ${name} 不存在于 tools/control/scenarios/`);
    }
  }
  for (const [token, origin] of code) {
    if (!covered.has(token)) problems.push(`缺少地图：\`${token}\`（${origin}）没有任何功能页覆盖`);
  }
  for (const name of scenarios) {
    if (!usedScenarios.has(name)) problems.push(`场景 ${name}.json 没有被任何功能页引用`);
  }
  for (const [, link] of readme.matchAll(/\]\(([^)#]+\.md)\)/g)) {
    if (!link.includes('/') && !existsSync(join(root, dir, link))) problems.push(`README.md 链接的 ${link} 不存在`);
  }
  return { pages: pages.length, entries: code.size, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pages, entries, problems } = checkFeatureMap();
  if (problems.length) {
    console.error(`功能地图与代码不一致，共 ${problems.length} 处：`);
    for (const problem of problems) console.error(`- ${problem}`);
    console.error('处理：按 skills/verify/SKILL.md「功能地图」一节，补写或更新 references/features/ 下对应功能页的「覆盖」行和 CLI 命令。');
    process.exit(1);
  }
  console.log(`功能地图检查通过：${pages} 个功能页覆盖代码中全部 ${entries} 个界面入口和协议命令。`);
}
