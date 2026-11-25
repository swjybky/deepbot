import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts/check-rules.mjs');
const run = root => spawnSync(process.execPath, [script, ...(root ? [root] : [])], { encoding: 'utf8' });

test('the rules check passes on the repository', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /防错规则检查通过/);
});

test('the rules check catches each converted mistake when it comes back', () => {
  const root = mkdtempSync(join(tmpdir(), 'deepbot-rules-'));
  try {
    for (const path of ['.lint', 'rules/README.md', 'apps/desktop/ui', 'apps/desktop/App.tsx', 'packages/agent/src', 'scripts/install-codex-acp.sh']) {
      cpSync(join(repo, path), join(root, path), { recursive: true });
    }
    // ERR-013: a new button imported straight from nsh/base, across lines.
    writeFileSync(join(root, 'apps/desktop/ui/components/Plain.tsx'), 'import {\n  View,\n  Button,\n} from "nsh/base";\nexport const Plain = () => <Button />;\n');
    // ERR-008: a second default data path outside data-directory.ts.
    mkdirSync(join(root, 'packages/agent/src/extra'), { recursive: true });
    cpSync(join(repo, '.lint/fixtures/data-dir-default.txt'), join(root, 'packages/agent/src/extra/cache.ts'));
    const config = join(root, '.lint/source.json');
    const value = JSON.parse(readFileSync(config, 'utf8'));
    value.rules.find(rule => rule.id === 'data-dir-default').allow = [{ file: 'packages/agent/src/extra/cache.ts' }];
    writeFileSync(config, JSON.stringify(value));
    // Remove a valid entry and add references to a missing rule and test.
    const doc = join(root, 'rules/README.md');
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('`lint:nsh-base-button`', '') + '\n`lint:no-such-rule`、`test:no such regression`\n');

    const result = run(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /apps\/desktop\/ui\/components\/Plain\.tsx:1\s+\[nsh-base-button\]/);
    assert.match(result.stderr, /packages\/agent\/src\/extra\/cache\.ts:2\s+\[data-dir-default\]/);
    assert.match(result.stderr, /data-dir-default 使用了逐行豁免/);
    assert.match(result.stderr, /rules\/README\.md 没有登记 `lint:nsh-base-button`/);
    assert.match(result.stderr, /`lint:no-such-rule`，但 \.lint\/ 里没有这条规则/);
    assert.match(result.stderr, /`test:no such regression`，但测试文件里找不到/);
    assert.doesNotMatch(result.stderr, /^apps\/desktop\/ui\/components\/Pressable\.tsx:\d+\s+\[nsh-base-button\]/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source boundaries catch the original patterns in code and leave literals alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'deepbot-source-boundaries-'));
  try {
    for (const path of ['.lint', 'rules/README.md', 'scripts/install-codex-acp.sh']) {
      cpSync(join(repo, path), join(root, path), { recursive: true });
    }
    const fixtures = [
      ['apps/desktop/ui/features/Leak.tsx', [
        'import { sendCommand } from "../services/agent";',
        'import { Storage } from "nsh";',
        'import { Agent } from "deepbot/native";',
        'let value: any = read();',
        'const result = value as never;',
        '/* eslint-disable-next-line rule */',
        'export const Card = () => <View>{/* @ts-ignore */}</View>;',
      ], ['desktop-wire-transport', 'desktop-local-json', 'desktop-agent-modules', 'ts-explicit-any', 'ts-never-cast', 'lint-suppression']],
      ['packages/agent/src/connectors/leak.ts', [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "fs";',
        'import { DatabaseSync } from "node:sqlite";',
        'const config = await app.ledger();',
        'const event = JSON.parse(line) as HostMessage;',
        'const response = await fetch(url);',
        'l.data.memories.push(item);',
      ], ['connector-child-process', 'connector-config-write', 'agent-private-storage', 'agent-entrypoint-ledger', 'protocol-cast', 'agent-http', 'bot-library-write']],
      ['apps/desktop/ui/features/chat/Bypass.tsx', [
        'import { Switch as RawSwitch } from "nsh/base";',
        'export { ModelSettings } from "../settings/sections/ModelSettings";',
        'import { connect } from "websocket";',
        'const send = globalThis.fetch;',
        'globalThis["fetch"](url);',
        'new WebSocket(url);',
        'function Card({ name }: Props) { return <View>{name}</View>; }',
        'const Row = (props: Props) => { const { title } = props.item; return <View>{title}</View>; };',
      ], ['desktop-base-controls', 'desktop-ui-imports', 'desktop-network', 'nsh-component-props']],
      ['apps/desktop/ui/components/Bypass.tsx', [
        'import { Sidebar } from "../features/sidebar/Sidebar";',
      ], ['desktop-ui-imports']],
      ['apps/desktop/ui/features/chat/Allowed.tsx', [
        'import { AlertDialog } from "nsh/base";',
        'import { TextField } from "../../components";',
        'import { command } from "../../state/runtime";',
        'import { MessageBubble } from "./MessageBubble";',
        'function Card(props: Props) {',
        '  return <View onLayout={({ bounds }) => measure(bounds)} onPress={() => {',
        '    const { id } = props.item; command({ type: "work.cancel", workId: id });',
        '  }}>{props.title}</View>;',
        '}',
      ], []],
      ['packages/agent/src/runtime/app.ts', [
        'import { openSessionStorage } from "../storage/session.ts";',
        'import { LedgerDoc } from "../work/ledger.ts";',
        'import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";',
      ], ['agent-private-storage']],
      ['packages/agent/src/storage/session.ts', [
        'import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";',
      ], []],
      ['packages/agent/src/bot/bypass.ts', [
        'import { LedgerDoc as Doc } from "../work/ledger.ts";',
        'const store = await import("../storage/session.ts");',
      ], ['agent-private-ledger']],
      ['tools/control/worker.mjs', ['const models = read("models.json");'], ['verify-model-snapshot']],
      ['tools/control/ambiguous.mjs', ['/** @type {any} */', 'const data = parse();'], ['ts-explicit-any']],
      ['scripts/work.sh', ['# shellcheck disable=SC2034'], ['script-lint-suppression']],
      ['apps/desktop/src/leak.rs', ['#[allow(dead_code)]', 'fn loose() {}'], ['rust-lint-suppression']],
      ['packages/agent/src/fine.ts', [
        'import type { Child } from "node:child_process";',
        'const token = AbortSignal.any([a, b]);',
        'const sample = "// @ts-ignore";',
        'const text = "any";',
      ], []],
    ];
    for (const [file, code] of fixtures) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), code.join('\n') + '\n');
    }
    const result = run(root);
    assert.equal(result.status, 1);
    for (const [file, , expected] of fixtures) {
      const hits = result.stderr.split('\n').filter(line => line.startsWith(file + ':'));
      const ids = hits.map(line => /\[([\w-]+)\]/.exec(line)?.[1]);
      assert.deepEqual([...new Set(ids)].sort(), [...expected].sort(), result.stderr);
      if (file.endsWith('/Leak.tsx')) assert.equal(ids.filter(id => id === 'lint-suppression').length, 2, result.stderr);
      if (file.endsWith('/chat/Bypass.tsx')) {
        assert.equal(ids.filter(id => id === 'desktop-network').length, 4, result.stderr);
        assert.equal(ids.filter(id => id === 'nsh-component-props').length, 2, result.stderr);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
