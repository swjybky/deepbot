// A T3 Code MCP server in miniature: bearer auth, sessions, and the project/thread tools DeepBot uses.
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

export async function startT3Fixture({ token = 'secret', root, pairingCodes = {}, initialAccess = 'full-access', host = '127.0.0.1', port = 0 }) {
  const state = { environmentId: randomUUID(), initializes: 0, launches: 0, sends: 0, interrupts: [], threads: [], projects: [{ id: 'p1', workspaceRoot: root }], requests: new Map(), approvals: [], replies: [] };
  const pairing = new Map(Object.entries(pairingCodes));
  const authorizationCodes = new Map();
  const clientTokens = new Map([[token, initialAccess]]);
  const modes = ['read-only', 'approval-required', 'auto-accept-edits', 'auto', 'full-access'];
  const tools = ['t3_project_list', 't3_project_create', 't3_thread_launch', 't3_thread_send', 't3_thread_interrupt', 't3_thread_read', 't3_pending_request', 'orchestrator_capabilities']
    .map((name) => ({ name, description: `fixture ${name}`, inputSchema: { type: 'object' } }));
  const thread = (id) => state.threads.find((t) => t.thread.threadId === id);
  const once = (key, make) => { if (!state.requests.has(key)) state.requests.set(key, make()); return state.requests.get(key); };
  const call = (name, args, access) => {
    if (name === 'orchestrator_capabilities') return { runtimeMode: access };
    if (name === 't3_project_list') return { projects: state.projects, nextCursor: null };
    if (name === 't3_project_create') { const project = { id: `p${state.projects.length + 1}`, workspaceRoot: args.workspaceRoot }; state.projects.push(project); return project; }
    if (name === 't3_thread_launch') return once(args.clientRequestId, () => {
      if (!state.projects.some(project => project.id === args.projectId)) throw new Error('unknown project');
      if (!args.runtimeMode || modes.indexOf(args.runtimeMode) > modes.indexOf(access)) throw new Error(`requested runtime mode ${args.runtimeMode} exceeds ${access}`);
      state.launches++;
      const id = `thread-${state.launches}`, run = `run-${state.launches}`, question = args.message.includes('WAIT_QUESTION');
      const waiting = question || args.message.includes('WAIT_HUMAN');
      const status = waiting ? 'waiting' : args.message.includes('LONG_RUNNING') ? 'running' : 'completed';
      const items = [{ type: 'user_message', runId: run, text: args.message }, { type: 'assistant_message', runId: run, text: 'T3 Code fixture 中文结果' }];
      const runs = [{ runId: run, status }];
      const t = { thread: { threadId: id, title: args.title, runtimeMode: args.runtimeMode, status, latestRunId: run, activeRunId: status === 'completed' ? null : run, pendingRequestCount: waiting ? 1 : 0, itemCount: 2, link: `https://t3.example/thread/${id}` },
        questions: new Map(question ? [[`q-${id}`, [{ id: 'branch', question: '使用哪个分支？', options: [{ label: '开发分支', value: 'dev', description: '用于验收' }], allowCustomAnswer: false }]]] : []),
        items, runs };
      state.threads.push(t);
      return { threadId: id, runId: run, link: t.thread.link };
    });
    if (name === 't3_pending_request') {
      const t = thread(args.threadId);
      if (args.action === 'list') return { requestIds: [...t.questions.keys()] };
      const questions = t.questions.get(args.requestId);
      if (!questions) throw new Error('request no longer pending');
      if (args.action === 'read') return { requestId: args.requestId, questions };
      state.replies.push(args);
      t.questions.delete(args.requestId);
      Object.assign(t.thread, { pendingRequestCount: 0, activeRunId: null, status: 'completed' });
      t.runs.at(-1).status = 'completed';
      return { sequence: state.replies.length };
    }
    if (name === 't3_thread_send') return once(args.clientRequestId, () => {
      const t = thread(args.threadId); state.sends++;
      const run = `sent-${state.sends}`, long = args.message.includes('LONG_RUNNING');
      const messageId = `message-${state.sends}`;
      const active = t.thread.activeRunId;
      if (active && args.mode !== 'queue' && t.thread.status === 'running') {
        t.items.push({ type: 'user_message', runId: active, messageId, text: args.message });
        t.thread.itemCount = t.items.length;
        return { threadId: args.threadId, messageId, runId: active, delivery: 'steered', status: 'running' };
      }
      if (active) {
        t.thread.latestRunId = run;
        t.runs.push({ runId: run, status: 'queued', startedAt: null });
        return { threadId: args.threadId, messageId, runId: run, delivery: 'queued', status: 'queued' };
      }
      Object.assign(t.thread, { latestRunId: run, status: long ? 'running' : 'completed', activeRunId: long ? run : null, pendingRequestCount: 0 });
      t.items.push({ type: 'user_message', runId: run, messageId, text: args.message }, { type: 'assistant_message', runId: run, text: '补充处理完成' });
      t.runs.push({ runId: run, status: long ? 'running' : 'completed' });
      t.thread.itemCount = t.items.length;
      return { threadId: args.threadId, messageId, runId: run, delivery: 'started', status: t.thread.status };
    });
    if (name === 't3_thread_interrupt') {
      const t = thread(args.threadId); state.interrupts.push(args);
      Object.assign(t.thread, { status: 'interrupted', activeRunId: null });
      return { ok: true };
    }
    if (name === 't3_thread_read') {
      const t = thread(args.threadId);
      if (!t) throw new Error('thread not found');
      return { thread: t.thread, items: t.items, recentRuns: t.runs.toReversed(), hasMore: false };
    }
    throw new Error(`unknown tool ${name}`);
  };
  const sessions = new Set();
  const server = createServer(async (req, res) => {
    if (req.url === '/.well-known/t3/environment') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ environmentId: state.environmentId }));
      return;
    }
    if (req.url?.startsWith('/oauth/mcp/')) {
      const json = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      const reject = () => { res.writeHead(400); res.end(); };
      let body = ''; for await (const chunk of req) body += chunk;
      if (req.url === '/oauth/mcp/register') {
        const {client_name, redirect_uris} = JSON.parse(body);
        if (client_name !== 'DeepBot' || !redirect_uris?.length) return reject();
        return json({client_id: 'deepbot-fixture'});
      }
      if (req.url === '/oauth/mcp/decision') {
        const { authorization, decision } = JSON.parse(body);
        if (authorization.client_id !== 'deepbot-fixture' || authorization.code_challenge_method !== 'S256' ||
          decision._tag !== 'pairing-code' || pairing.get(decision.code) !== decision.access) return reject();
        pairing.delete(decision.code);
        state.approvals.push(decision.access);
        const code = randomUUID();
        authorizationCodes.set(code, { ...authorization, access: decision.access });
        const redirect = new URL(authorization.redirect_uri);
        redirect.search = new URLSearchParams({ code, state: authorization.state }).toString();
        return json({ redirectTo: redirect.href });
      }
      const form = new URLSearchParams(body);
      const grant = authorizationCodes.get(form.get('code'));
      if (!grant || form.get('grant_type') !== 'authorization_code' ||
        ['client_id', 'redirect_uri', 'resource'].some(key => form.get(key) !== grant[key]) ||
        createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== grant.code_challenge) return reject();
      authorizationCodes.delete(form.get('code'));
      const access_token = randomUUID();
      clientTokens.set(access_token, grant.access);
      return json({ access_token, token_type: 'Bearer' });
    }
    const access = clientTokens.get(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!access) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"invalid_mcp_credential"}'); return; }
    if (req.method === 'DELETE') { sessions.delete(req.headers['mcp-session-id']); res.writeHead(204); res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (message.method === 'initialize') {
      state.initializes++;
      const session = randomUUID(); sessions.add(session);
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': session });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 't3-fixture', version: '0' } } }));
      return;
    }
    if (!sessions.has(req.headers['mcp-session-id'])) { res.writeHead(404); res.end(); return; }
    if (message.id === undefined) { res.writeHead(202); res.end(); return; }
    let result;
    if (message.method === 'tools/list') result = {
      tools: access === 'read-only'
        ? tools.filter(tool => ['t3_project_list', 't3_thread_read'].includes(tool.name))
        : tools,
    };
    else {
      try { const value = call(message.params.name, message.params.arguments ?? {}, access); result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }; }
      catch (error) { result = { content: [{ type: 'text', text: error.message }], isError: true }; }
    }
    // Answer as an event stream, as T3 does.
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, host, resolve));
  const hostname = host.includes(':') ? `[${host}]` : host;
  const url = `http://${hostname}:${server.address().port}/mcp`;
  return { url, state, expireSessions: () => sessions.clear(), close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}
