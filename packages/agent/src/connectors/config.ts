import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpEndpoint } from "./mcp.ts";
import type { T3RuntimeMode } from "../protocol.ts";
import { readJson, writePrivateJson } from "../runtime/private-json.ts";
import { arrayOf, boolean, isArray, isRecord, oneOf, recordOf, requireShape, shape, string } from "../wire-values.ts";

/** A user MCP connector: tools only. */
export type McpConnectorConfig = { id: string; name: string; description?: string } & McpEndpoint;
/** A user ACP connector: dispatch only. */
export type AcpConnectorConfig = { id: string; name: string; description?: string; command: string; args?: string[]; mode?: string; env?: Record<string, string> };
export type ConnectorsConfig = {
  /** The built-in T3 Code connector. */
  t3: { url?: string; token?: string; provider?: string; model?: string; runtimeMode?: T3RuntimeMode; approvalToken?: string };
  mcp: McpConnectorConfig[];
  acp: AcpConnectorConfig[];
};

const ID = /^[a-zA-Z0-9_-]{1,40}$/;
const RESERVED = ["self", "t3code"];

function readConfigFile(path: string): Record<string, unknown> {
  try {
    const raw = readJson(path);
    if (!isRecord(raw)) throw new Error();
    if (raw.t3 != null && !isRecord(raw.t3)) throw new Error();
    return raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    // Parser errors may include text from this private file.
    throw new Error("无法读取 connectors.json，请检查文件格式和权限");
  }
}

/** Replace the changed T3 settings in one write, preserving other connectors. */
export function writeT3Settings(dataDir: string, values: { savedToken?: string; approvalToken?: string; runtimeMode?: T3RuntimeMode }) {
  const path = join(dataDir, "connectors.json");
  const raw = readConfigFile(path);
  const updated = { ...raw, t3: { ...(isRecord(raw.t3) ? raw.t3 : {}), ...values } };
  try {
    writePrivateJson(path, updated);
  } catch {
    throw new Error("无法保存 T3 Code 密钥，请检查数据目录权限");
  }
}

const strings = arrayOf(string);
const vars = recordOf(string);
const t3Fields = shape({}, {
  url: string, savedToken: string, token: string, approvalToken: string, provider: string, model: string,
  runtimeMode: oneOf("approval-required", "auto-accept-edits", "auto", "full-access"),
});
const connectorFields = shape({ id: string }, { name: string, description: string });
const httpEndpoint = shape({ url: string }, { headers: vars });
const processEndpoint = shape({ command: string }, { args: strings, env: vars, cwd: string, mode: string });
const mcpRevision = shape({ id: string, name: string, revision: string }, { description: string });
const remoteT3Fields = shape({
  id: string, name: string, url: string, environmentId: string, token: string,
  runtimeMode: oneOf("approval-required", "auto-accept-edits", "auto", "full-access"),
  enabled: boolean, requestId: string, digest: string,
}, { approvalToken: string });

export function readRemoteT3Settings(dataDir: string) {
  const raw = readConfigFile(join(dataDir, "connectors.json"));
  const configs = requireShape(raw.remoteT3 ?? [], arrayOf(remoteT3Fields), "connectors.json 的远端 T3 Code 配置无效");
  const ids = new Set(configs.map(config => config.id));
  if (ids.size !== configs.length || configs.some(config => !/^t3-remote-[a-f0-9]{24}$/.test(config.id)))
    throw new Error("connectors.json 的远端 T3 Code 实例 ID 无效或重复");
  return configs;
}

export type RemoteT3Config = ReturnType<typeof readRemoteT3Settings>[number];

export function writeRemoteT3Settings(dataDir: string, config: RemoteT3Config) {
  const path = join(dataDir, "connectors.json");
  const raw = readConfigFile(path);
  const saved = requireShape(raw.remoteT3 ?? [], arrayOf(remoteT3Fields), "connectors.json 的远端 T3 Code 配置无效");
  const exists = saved.some(entry => entry.id === config.id);
  try {
    writePrivateJson(path, { ...raw, remoteT3: exists ? saved.map(entry => entry.id === config.id ? config : entry) : [...saved, config] });
  } catch {
    throw new Error("无法保存远端 T3 Code 配置，请检查数据目录权限");
  }
}

function mcpConfig(entry: unknown): McpConnectorConfig {
  const { id, name, description } = requireShape(entry, connectorFields, "MCP 连接器 id 无效");
  const base = { id, name: name ?? id, ...(description !== undefined ? { description } : {}) };
  // Preserve stdio selection when an older config includes both fields.
  if (httpEndpoint(entry) && !Object.hasOwn(entry, "command"))
    return { ...base, url: entry.url, ...(entry.headers ? { headers: entry.headers } : {}) };
  const process = requireShape(entry, processEndpoint, `MCP 连接器 ${id} 的进程设置无效`);
  return { ...base, command: process.command, ...(process.args ? { args: process.args } : {}),
    ...(process.env ? { env: process.env } : {}), ...(process.cwd !== undefined ? { cwd: process.cwd } : {}) };
}

export function readMcpRevision(dataDir: string, id: string, revision: string): McpConnectorConfig {
  const raw = readConfigFile(join(dataDir, "connectors.json"));
  const entry = configuredEntries(raw.mcpRevisions, "MCP").find(value =>
    mcpRevision(value) && value.id === id && value.revision === revision);
  if (!entry) throw new Error(`找不到 MCP 连接器 ${id} 的已保存配置`);
  return mcpConfig(entry);
}

/** Stage a candidate beside the current revision. The ledger selects which revision is live. */
export function stageMcpRevision(dataDir: string, config: McpConnectorConfig, revision: string, current?: string) {
  const path = join(dataDir, "connectors.json");
  const raw = readConfigFile(path);
  const revisions = configuredEntries(raw.mcpRevisions, "MCP").filter(value =>
    !mcpRevision(value) || value.id !== config.id || value.revision === current);
  try {
    writePrivateJson(path, { ...raw, mcpRevisions: [...revisions, { ...config, revision }] });
  } catch {
    throw new Error("无法保存 MCP 配置，请检查数据目录权限");
  }
}

function configuredEntries(raw: unknown, kind: string): unknown[] {
  if (raw == null) return [];
  if (!isArray(raw)) throw new Error(`connectors.json 的 ${kind} 连接器必须是列表`);
  return raw;
}

/**
 * Reads `<data root>/connectors.json`. Environment variables name the built-in T3 (`DEEPBOT_T3_*`) and one ACP
 * connector (`DEEPBOT_ACP_*`), as before; the installed Codex ACP is added when nothing else names an ACP.
 */
export function readConnectorsConfig(dataDir: string, env: NodeJS.ProcessEnv = process.env): ConnectorsConfig {
  const raw = readConfigFile(join(dataDir, "connectors.json"));
  const { savedToken, ...t3 } = requireShape(raw.t3 ?? {}, t3Fields, "connectors.json 的 T3 设置无效");
  if (env.DEEPBOT_T3_ENDPOINT) t3.url = env.DEEPBOT_T3_ENDPOINT;
  if (typeof savedToken === "string" && savedToken) t3.token = savedToken;
  else if (env.DEEPBOT_T3_TOKEN) t3.token = env.DEEPBOT_T3_TOKEN;
  if (env.DEEPBOT_T3_PROVIDER) t3.provider = env.DEEPBOT_T3_PROVIDER;
  if (env.DEEPBOT_T3_MODEL) t3.model = env.DEEPBOT_T3_MODEL;
  const ids = new Set<string>();
  const checkId = (id: unknown, kind: string) => {
    if (typeof id !== "string" || !ID.test(id) || RESERVED.includes(id) || ids.has(id))
      throw new Error(`connectors.json 的 ${kind} 连接器 id 无效或重复：${String(id)}`);
    ids.add(id);
  };
  const mcp: McpConnectorConfig[] = configuredEntries(raw.mcp, "MCP").map(entry => {
    const config = requireShape(entry, connectorFields, "connectors.json 的 MCP 连接器 id 无效");
    checkId(config.id, "MCP");
    return mcpConfig(entry);
  });
  const acp: AcpConnectorConfig[] = configuredEntries(raw.acp, "ACP").map(entry => {
    const config = requireShape(entry, connectorFields, "connectors.json 的 ACP 连接器 id 无效");
    const process = requireShape(entry, processEndpoint, `ACP 连接器 ${config.id} 需要有效的 command`);
    if (!process.command) throw new Error(`ACP 连接器 ${config.id} 需要 command`);
    const id = config.id.startsWith("acp:") ? config.id : `acp:${config.id}`;
    checkId(id.slice(4), "ACP");
    return { id, name: config.name ?? id.slice(4), command: process.command,
      ...(config.description !== undefined ? { description: config.description } : {}),
      ...(process.args ? { args: process.args } : {}), ...(process.env ? { env: process.env } : {}),
      ...(process.mode !== undefined ? { mode: process.mode } : {}) };
  });
  if (env.DEEPBOT_ACP_COMMAND) {
    const id = env.DEEPBOT_ACP_ID ?? "acp:hermes";
    if (!acp.some((entry) => entry.id === id))
      acp.push({ id, name: id === "acp:hermes" ? "Hermes" : id.replace(/^acp:/, ""), command: env.DEEPBOT_ACP_COMMAND, args: env.DEEPBOT_ACP_ARGS ? requireShape(JSON.parse(env.DEEPBOT_ACP_ARGS), strings, "DEEPBOT_ACP_ARGS 必须是字符串列表") : ["acp"], ...(env.DEEPBOT_ACP_MODE ? { mode: env.DEEPBOT_ACP_MODE } : {}) });
  }
  const installed = join(dataDir, "tools", "codex-acp", "node_modules", ".bin", "codex-acp");
  if (!acp.length && existsSync(installed))
    acp.push({ id: "acp:codex", name: "Codex ACP", description: "本机安装的 Codex ACP", command: installed, args: [], mode: "read-only" });
  return { t3, mcp, acp };
}
