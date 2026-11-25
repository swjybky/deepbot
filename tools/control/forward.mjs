// Host side of `ui serve`: 127.0.0.1 ports for a browser tool, piped to the sockets the sandbox
// worker listens on. Exits once the sockets are gone (ui close, env stop, a crashed worker).
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';

const [runDir, requestedPort = '0'] = process.argv.slice(2);
const sockets = { page: join(runDir, 'rpc', 'web.sock'), api: join(runDir, 'rpc', 'api.sock') };

function listen(socketPath, port) {
  const server = createServer(client => {
    const upstream = connect(socketPath);
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const page = await listen(sockets.page, Number(requestedPort));
const api = await listen(sockets.api, 0);
const state = { pid: process.pid, page: page.address().port, api: api.address().port };
const temporary = join(runDir, `.serve.json.${process.pid}`);
writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
renameSync(temporary, join(runDir, 'serve.json'));

// The worker opens the sockets after it learns the ports; give it the startup budget, then follow them.
const started = Date.now();
setInterval(() => {
  const open = existsSync(sockets.page) && existsSync(sockets.api);
  if (!open && Date.now() - started > 20 * 60 * 1000) process.exit(0);
  if (open) state.seen = true;
  else if (state.seen) process.exit(0);
}, 1000);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
