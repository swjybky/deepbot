#!/usr/bin/env node
// Checks source rules and verifies lint and test references in rules/README.md.
// The verify CLI enforces the patterns from .lint/verify.json against logs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyntaxScanner } from './source-syntax.mjs';

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const skipDirs = new Set(['node_modules', '.nsh', 'target', 'dist', '.git', 'scenarios']);
const testRoots = ['apps/desktop/tests', 'packages/agent/tests', 'packages/agent/test', 'tools/control', 'scripts'];

function walk(path, ext, out = []) {
  const full = join(root, path);
  if (!existsSync(full)) return out;
  if (statSync(full).isFile()) {
    if (ext.some(e => path.endsWith(e))) out.push(path);
    return out;
  }
  for (const name of readdirSync(full).sort()) {
    if (skipDirs.has(name)) continue;
    walk(join(path, name), ext, out);
  }
  return out;
}

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return { number: text.slice(0, index).split('\n').length, text: text.slice(start, end < 0 ? undefined : end).trim() };
}

function scan(rule, syntax) {
  const pattern = rule.pattern && new RegExp(rule.pattern, 'gm');
  const owners = new Set(rule.owners ?? []);
  const files = [...new Set(rule.include.flatMap(path => walk(path, rule.ext)))];
  const hits = [];
  for (const file of files) {
    if (owners.has(file)) continue;
    const text = read(file);
    const positions = rule.check ? syntax(rule.check, file, text) : [...text.matchAll(pattern)].map(match => match.index);
    for (const position of positions) {
      const line = lineAt(text, position);
      hits.push({ rule, file, line: line.number, text: line.text });
    }
  }
  return hits;
}

function testExists(name) {
  return testRoots.some(dir => walk(dir, ['.ts', '.tsx', '.mjs']).some(file => /\.test\.|tests?\//.test(file) && read(file).includes(name)));
}

export function checkRules() {
  const source = JSON.parse(read('.lint/source.json')).rules;
  const log = JSON.parse(read('.lint/verify.json')).rules;
  const registry = 'rules/README.md';
  const documentation = read(registry);
  const registeredIds = new Set([...documentation.matchAll(/`lint:([\w-]+)`/g)].map(match => match[1]));
  const problems = [];
  const hits = [];
  const ids = new Set([...source, ...log].map(rule => rule.id));
  const syntax = createSyntaxScanner();

  for (const id of ids) {
    if (!registeredIds.has(id)) problems.push(`${registry} 没有登记 \`lint:${id}\``);
  }
  for (const rule of source) {
    if (rule.allow !== undefined) problems.push(`规则 ${rule.id} 使用了逐行豁免，请移除 allow 并修复调用处`);
    if (Boolean(rule.pattern) === Boolean(rule.check)) {
      problems.push(`规则 ${rule.id} 需要指定一个源码匹配方式`);
      continue;
    }
    hits.push(...scan(rule, syntax));
  }
  for (const id of registeredIds) {
    if (!ids.has(id)) problems.push(`${registry} 写了 \`lint:${id}\`，但 .lint/ 里没有这条规则`);
  }
  for (const [, name] of documentation.matchAll(/`test:([^`]+)`/g)) {
    if (!testExists(name)) problems.push(`${registry} 写了 \`test:${name}\`，但测试文件里找不到这个用例`);
  }
  return { hits, problems, rules: ids.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { hits, problems, rules } = checkRules();
  if (hits.length || problems.length) {
    for (const hit of hits) {
      console.error(`${hit.file}:${hit.line}  [${hit.rule.id}] ${hit.rule.message}\n  ${hit.text}\n  处理：${hit.rule.nextAction}`);
    }
    if (problems.length) console.error(`规则登记不一致：\n${problems.map(p => `- ${p}`).join('\n')}`);
    console.error('按处理建议修复调用处或登记，再运行 verify check。');
    process.exit(1);
  }
  console.log(`防错规则检查通过，${rules} 条机器规则已登记到 rules/README.md。`);
}
