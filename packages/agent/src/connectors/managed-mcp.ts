import { randomUUID } from "node:crypto";
import type { ConnectorStatus, HostMessage } from "../protocol.ts";
import { changed, type Ledger, type McpPolicy } from "../work/ledger.ts";
import { readMcpRevision, stageMcpRevision, type McpConnectorConfig } from "./config.ts";
import { McpHttpError } from "./mcp.ts";
import { createConnectorTools, McpToolConnector, type ConnectorTools } from "./mcp-tools.ts";

export type McpCommand = Extract<HostMessage, { type: "connector.mcp.save" | "connector.mcp.connect" }>;

type Connection = { client: McpToolConnector; catalog: ConnectorTools };
type Entry = { config: McpConnectorConfig; connection?: Connection };
type LedgerAccess = {
  mcpSettings(id: string, requestId: string): Promise<{ policy: McpPolicy | undefined; previous: string | undefined; botIds: string[] }>;
  mcpInvocationAllowed(id: string, revision: string | undefined, conversationId: string): Promise<boolean>;
  mutate<T>(update: (ledger: Ledger) => T): Promise<T>;
};

export function mcpAllowed(status: { mcp?: { botIds: readonly string[] }; available: boolean }, botId: string | undefined) {
  return status.available && (!status.mcp || (botId !== undefined && status.mcp.botIds.includes(botId)));
}

export function mcpConversationBot(ledger: Ledger, conversationId: string) {
  const thread = ledger.data.threads.find(t => t.conversationId === conversationId);
  if (thread) return ledger.data.bots.find(bot => bot.threadId === thread.id)?.id;
  const assignment = ledger.data.assignments.find(a =>
    a.assignee === "self" && a.state !== "ended" && a.sessionRef?.conversationId === conversationId);
  return ledger.data.bots.find(bot => bot.id === assignment?.brief.botId)?.id;
}

function statusOf(policy: McpPolicy, entry: Entry, failure?: string): ConnectorStatus {
  const { config, connection } = entry;
  return {
    id: config.id, name: config.name, transport: "mcp", builtin: false, description: config.description ?? "",
    available: !!connection,
    ...(connection ? { tools: connection.catalog.tools.length } :
      { reason: failure ?? (policy.enabled ? "连接失败，请检查配置后重连" : "已断开") }),
    mcp: {
      kind: "url" in config ? "http" : "stdio",
      enabled: policy.enabled, botIds: policy.botIds, allowNewBots: policy.allowNewBots,
      hasCredential: "url" in config && Object.keys(config.headers ?? {}).some(key => key.toLowerCase() === "authorization"),
    },
  };
}

async function retire(entry: Entry | undefined) {
  await entry?.connection?.client.close();
}

/** Configuration lives in private JSON. The ledger commits the active revision and its Bot grants together. */
export class ManagedMcp {
  private readonly entries = new Map<string, Entry>();
  private readonly retiring = new Set<Promise<void>>();
  private readonly dataDir: string;
  private readonly app: LedgerAccess;
  private readonly shutdown: AbortSignal;
  private readonly publishTools: () => void;

  constructor(
    dataDir: string,
    app: LedgerAccess,
    shutdown: AbortSignal,
    publishTools: () => void,
  ) {
    this.dataDir = dataDir;
    this.app = app;
    this.shutdown = shutdown;
    this.publishTools = publishTools;
  }

  async load(ledger: Ledger, legacy: McpConnectorConfig[]) {
    const policies = ledger.mcpPolicies ?? [];
    for (const config of legacy) {
      if (!policies.some(policy => policy.id === config.id))
        policies.push({ id: config.id, enabled: true, botIds: ledger.data.bots.map(bot => bot.id), allowNewBots: false });
    }
    const statuses = await Promise.all(policies.map(async policy => {
      const config = policy.revision
        ? readMcpRevision(this.dataDir, policy.id, policy.revision)
        : legacy.find(item => item.id === policy.id);
      if (!config) return undefined;
      let entry: Entry = { config };
      let failure: string | undefined;
      if (policy.enabled) {
        try { entry = await this.probe(config, policy.revision); }
        catch (error) { failure = error instanceof Error ? error.message : this.failure(error); }
      }
      return { policy, entry, status: statusOf(policy, entry, failure) };
    }));
    // Register in configuration order, independently of probe completion order.
    for (const item of statuses) if (item) this.entries.set(item.policy.id, item.entry);
    return { policies, statuses: statuses.flatMap(item => item ? [item.status] : []) };
  }

  catalogs() {
    return [...this.entries.values()].flatMap(entry => entry.connection ? [entry.connection.catalog] : []);
  }

  allowedTools(ledger: Ledger, conversationId: string) {
    const botId = mcpConversationBot(ledger, conversationId);
    const tools = ledger.data.connectors.flatMap(status => {
      if (!status.mcp || !mcpAllowed(status, botId)) return [];
      return this.entries.get(status.id)?.connection?.catalog.tools ?? [];
    });
    return new Set(tools);
  }

  async configure(cmd: McpCommand, digest: string) {
    const id = cmd.connectorId ?? `mcp-${randomUUID().replaceAll("-", "")}`;
    const { previous, policy, botIds: originalBots } = await this.app.mcpSettings(id, cmd.requestId);
    if (previous === digest) return;
    if (previous) throw new Error("requestId 已被其他内容使用");

    const current = this.entries.get(id);
    if (cmd.connectorId !== undefined && (!current || !policy)) throw new Error("MCP 连接器不存在");
    let next = current;
    let staged: string | undefined;
    const enabled = cmd.type === "connector.mcp.connect" ? cmd.enabled : policy?.enabled ?? true;
    try {
      if (cmd.type === "connector.mcp.save") {
        const config = this.editedConfig(id, current?.config, cmd);
        if (config) {
          staged = randomUUID().replaceAll("-", "");
          next = enabled ? await this.probe(config, staged) : { config };
          stageMcpRevision(this.dataDir, config, staged, policy?.revision);
        }
      } else if (current) {
        next = enabled ? await this.probe(current.config, policy?.revision) : { config: current.config };
      }
      if (!next) throw new Error("MCP 连接器不存在");
      const entry = next;
      await this.app.mutate(l => {
        if (l.requests[cmd.requestId]) throw new Error("requestId 已被其他内容使用");
        const policies = l.mcpPolicies ??= [];
        const latest = policies.find(item => item.id === id);
        const access = cmd.type === "connector.mcp.save" ? cmd.access : latest!;
        // Creation may commit while a candidate is being probed. Keep grants made by that creation.
        const createdGrants = latest?.botIds.filter(id => !originalBots.includes(id)) ?? [];
        const botIds = [...new Set([...access.botIds, ...createdGrants])];
        if (botIds.some(botId => !l.data.bots.some(bot => bot.id === botId)))
          throw new Error("列表中的 Bot 已不存在，请重新选择");
        const revision = staged ?? latest?.revision;
        const updated = { id, botIds, allowNewBots: access.allowNewBots, enabled, ...(revision ? { revision } : {}) };
        if (latest) policies[policies.indexOf(latest)] = updated;
        else policies.push(updated);
        const i = l.data.connectors.findIndex(c => c.id === id && c.mcp);
        const status = statusOf(updated, entry);
        if (i < 0) l.data.connectors.push(status);
        else l.data.connectors[i] = status;
        l.requests[cmd.requestId] = digest;
        changed(l);
      });
      if (current !== entry) {
        this.entries.set(id, entry);
        this.publishTools();
        const close = retire(current);
        this.retiring.add(close);
        void close.finally(() => this.retiring.delete(close));
      }
    } catch (error) {
      if (next !== current) await retire(next);
      throw error;
    }
  }

  async close() {
    await Promise.all([...this.entries.values()].map(retire).concat([...this.retiring]));
  }

  private async probe(config: McpConnectorConfig, revision: string | undefined): Promise<Entry> {
    let client: McpToolConnector | undefined;
    try {
      const active = new McpToolConnector(config);
      client = active;
      const catalog = await createConnectorTools(active, {
        ...(revision ? { revision } : {}),
        signal: AbortSignal.any([this.shutdown, AbortSignal.timeout(10_000)]),
        authorize: async conversationId => {
          if (!await this.app.mcpInvocationAllowed(config.id, revision, conversationId) ||
              this.entries.get(config.id)?.connection?.client !== active)
            throw new Error("当前 Bot 无权调用此 MCP 连接器，或连接已变更");
        },
      });
      if (!catalog) throw new Error("MCP 工具目录不可用");
      return { config, connection: { client: active, catalog } };
    } catch (error) {
      await client?.close();
      throw new Error(this.failure(error));
    }
  }

  private failure(error: unknown) {
    return error instanceof McpHttpError ? error.message : "连接失败，请检查 MCP 地址、凭据及服务状态";
  }

  private editedConfig(id: string, current: McpConnectorConfig | undefined, cmd: Extract<McpCommand, { type: "connector.mcp.save" }>): McpConnectorConfig | undefined {
    const name = cmd.name.trim();
    if (!name || name.length > 80) throw new Error("连接器名称须为 1 到 80 个字符");
    if (current?.name === name && cmd.url === undefined && cmd.token === undefined) return undefined;
    if (current && "command" in current) {
      if (cmd.url !== undefined || cmd.token !== undefined) throw new Error("stdio 连接参数从本地配置读取");
      return { ...current, name };
    }
    const value = cmd.url?.trim() ?? current?.url;
    let url: URL;
    try {
      url = new URL(value ?? "");
      if (url.username || url.password || url.hash || (url.protocol !== "https:" &&
          !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    } catch {
      throw new Error("请输入有效的 HTTPS MCP 地址，本机服务也可使用 HTTP");
    }
    // Saved credentials are only reused at the same endpoint.
    const headers = current && (cmd.url === undefined || url.href === current.url) ? { ...current.headers } : {};
    if (cmd.token !== undefined) {
      for (const key of Object.keys(headers)) if (key.toLowerCase() === "authorization") delete headers[key];
      if (cmd.token.trim()) headers.Authorization = `Bearer ${cmd.token.trim()}`;
    }
    return { ...current, id, name, url: cmd.url === undefined && current ? current.url : url.href, headers };
  }
}

/** Called in the same transaction that creates or removes the Bot. */
export function updateMcpBotAccess(l: Ledger, botId: string, created: boolean) {
  for (const policy of l.mcpPolicies ?? []) {
    if (created && policy.allowNewBots && !policy.botIds.includes(botId)) policy.botIds.push(botId);
    if (!created) policy.botIds = policy.botIds.filter(id => id !== botId);
    const view = l.data.connectors.find(status => status.id === policy.id)?.mcp;
    if (view) view.botIds = [...policy.botIds];
  }
}
