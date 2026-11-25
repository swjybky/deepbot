import { defineTool, type Extension } from "@earendil-works/pi-durable";
import type { CodemodeNamespace } from "@earendil-works/pi-durable/codemode";
import type { ConnectorStatus } from "../protocol.ts";
import type { Connector, ConnectorTool } from "./port.ts";
import { McpClient } from "./mcp.ts";
import type { McpConnectorConfig } from "./config.ts";
import { isJsonValue, toolOutput } from "../bot/tool-output.ts";
import { errorMessage, isRecord } from "../wire-values.ts";

/** A user MCP connector: its tools for code mode scripts, nothing else. */
export class McpToolConnector implements Connector {
  readonly id: string;
  private config: McpConnectorConfig;
  private client: McpClient;
  private listed: Promise<ConnectorTool[]> | undefined;
  private readonly inFlight = new Set<Promise<unknown>>();
  private closing = false;
  constructor(config: McpConnectorConfig) {
    this.id = config.id;
    this.config = config;
    this.client = new McpClient(config, config.name);
  }
  tools(signal?: AbortSignal): Promise<ConnectorTool[]> {
    this.listed ??= this.client.listTools(signal).catch((error) => { this.listed = undefined; throw error; });
    return this.listed;
  }
  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal, authorize?: () => Promise<void>): Promise<unknown> {
    const check = async () => {
      await authorize?.();
      if (this.closing) throw new Error("MCP 连接器已断开");
    };
    await check();
    const call = this.client.call(name, args, signal, check);
    this.inFlight.add(call);
    try { return await call; } finally { this.inFlight.delete(call); }
  }
  async status(): Promise<ConnectorStatus> {
    const base = { id: this.id, name: this.config.name, transport: "mcp" as const, builtin: false, description: this.config.description ?? "" };
    try { return { ...base, available: true, tools: (await this.tools()).length }; }
    catch (error) { return { ...base, available: false, reason: errorMessage(error) }; }
  }
  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.inFlight);
    await this.client.close();
  }
}

export const MCP_TOOL_PREFIX = "mcp__";
export const connectorToolPrefix = (connectorId: string) => `${MCP_TOOL_PREFIX}${connectorId}__`;

export type ConnectorTools = { namespace: CodemodeNamespace; tools: NonNullable<Extension["tools"]> };

/** A connector's tool catalog, callable by code mode scripts. */
export async function createConnectorTools(connector: Connector, options?: {
  revision?: string;
  authorize: (conversationId: string) => Promise<void>;
  signal: AbortSignal;
}): Promise<ConnectorTools | undefined> {
  if (!connector.tools || !connector.callTool) return;
  let listed: ConnectorTool[];
  try { listed = await (connector instanceof McpToolConnector ? connector.tools(options?.signal) : connector.tools()); }
  catch (error) {
    if (options) throw error;
    console.error(`deepbot connector ${connector.id}:`, errorMessage(error));
    return;
  }
  const status = await connector.status();
  const prefix = connectorToolPrefix(options?.revision ? `${connector.id}__${options.revision}` : connector.id);
  return {
    namespace: { name: connector.id, description: `${status.name}${status.description ? `：${status.description}` : ""}`, prefix },
    tools: listed.map((tool) => defineTool({
      name: `${prefix}${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema,
      // Scripts get the tool's own value: structured results as objects, others as text.
      structuredOutputSchema: {},
      callers: ["tools"],
      execute: async (args, api, context) => {
        const input = isRecord(args) ? args : {};
        const value = (await (options && connector instanceof McpToolConnector
          ? connector.callTool(tool.name, input, context.abortSignal, () => options.authorize(String(api.conversationId)))
          : connector.callTool!(tool.name, input, context.abortSignal))) ?? null;
        if (!isJsonValue(value)) throw new Error("连接器返回了无效的 JSON");
        return {
          ...toolOutput(value),
          structuredOutput: value,
        };
      },
    })),
  };
}
