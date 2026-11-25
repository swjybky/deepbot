import { createServer } from "node:http";

type FixtureCall = { service: string; name: string; args: Record<string, unknown> };

/** Local Streamable HTTP service used by the sidecar and native settings checks. */
export async function startManagedMcpFixture({ port = 0, onCall }: {
  port?: number;
  onCall?: (call: FixtureCall) => void | Promise<void>;
} = {}) {
  const calls: FixtureCall[] = [];
  const probes: string[] = [];
  const server = createServer(async (request, response) => {
    const service = request.url ?? "";
    if (!["/alpha", "/beta", "/protected"].includes(service) ||
        service === "/protected" && request.headers.authorization !== "Bearer synthetic-mcp-token") {
      response.writeHead(service === "/protected" ? 401 : 404).end();
      return;
    }
    if (request.method === "DELETE") {
      response.writeHead(204).end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { id, method, params } = JSON.parse(raw);
    if (id === undefined) {
      response.writeHead(202).end();
      return;
    }
    let result;
    if (method === "initialize") {
      probes.push(service);
      result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "managed-mcp-fixture", version: "1" } };
    } else if (method === "tools/list") {
      result = { tools: [{ name: "mcp_test_echo", description: "Test echo for connector authorization", inputSchema: { type: "object" } }] };
    } else if (method === "tools/call") {
      const call = { service, name: params.name, args: params.arguments };
      calls.push(call);
      await onCall?.(call);
      result = { structuredContent: { marker: "MCP_ECHO_OK", service } };
    } else {
      response.writeHead(400).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("MCP fixture did not bind a TCP endpoint");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    calls, probes,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
