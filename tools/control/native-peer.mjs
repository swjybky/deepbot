// Observe the isolated native sidecar's public model projection while forwarding its protocol intact.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { arrayOf, oneOf, shape, string } from '../../packages/agent/src/wire-values.ts';

const [projection, ...argv] = process.argv.slice(2);
const model = shape({ id: string, name: string });
const snapshot = shape({ type: oneOf('snapshot'), snapshot: shape({ modelConfigs: arrayOf(model) }) });
const peer = spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(peer.stdin);
peer.stdin.on('error', error => {
  if (error.code !== 'EPIPE') process.stderr.write(error.message + '\n');
});
peer.on('error', error => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
  process.stdin.pause();
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => peer.kill(signal));

createInterface({ input: peer.stdout }).on('line', line => {
  try {
    const event = JSON.parse(line);
    if (snapshot(event)) writeFileSync(projection, JSON.stringify(event.snapshot.modelConfigs.map(({ id, name }) => ({ id, name }))));
  } catch (error) {
    process.stderr.write('无法采集原生快照：' + error.message + '\n');
  }
  process.stdout.write(line + '\n');
});
peer.on('close', code => {
  process.exitCode = code ?? 1;
  process.stdin.pause();
});
