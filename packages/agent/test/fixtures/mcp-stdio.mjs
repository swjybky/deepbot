// A stdio MCP server with two tools; argv[2] is a file that counts how often it started.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

if (process.argv[2]) appendFileSync(process.argv[2], 'start\n');
const tools = [
  { name: 'echo', description: '原样返回', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'fail', description: '总是失败', inputSchema: { type: 'object' } },
];
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  if (message.method === 'initialize') reply(message.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'stdio-fixture', version: '0' } });
  else if (message.method === 'tools/list') reply(message.id, { tools });
  else if (message.params.name === 'echo') reply(message.id, { content: [{ type: 'text', text: `回声：${message.params.arguments.text}` }] });
  else reply(message.id, { content: [{ type: 'text', text: '故意失败' }], isError: true });
}
