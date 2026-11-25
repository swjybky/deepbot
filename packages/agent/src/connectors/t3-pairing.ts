import { createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { isLoopbackHost, isPrivateIpHost, readHttpText, requestHttp } from "../runtime/http.ts";
import { isRecord } from "../wire-values.ts";
import type { T3RuntimeMode } from "../protocol.ts";

const CODE = /^[2-9A-HJ-NP-Z]{12}$/;
const ACCESS = {
  READ: "read-only",
  SUPERVISED: "approval-required",
  EDITS: "auto-accept-edits",
  AUTO: "auto",
  FULL: "full-access",
} as const;
const CALLBACK = new URL("http://127.0.0.1/deepbot-t3-callback");
const INVALID_CODE = "T3 Code 配对码已失效或权限不足，请生成新配对码";

function pairingCode(value: string, defaultMode: T3RuntimeMode) {
  const input = value.trim().toUpperCase();
  const [prefix, code] = input.split("-");
  const access = ACCESS[prefix as keyof typeof ACCESS];
  if (access && CODE.test(code ?? "") && input === `${prefix}-${code}`) return { code: input, access };
  const compact = input.replace(/[\s-]/g, "");
  // A plain pairing link grants scopes but leaves the MCP runtime mode to the client.
  if (CODE.test(compact)) return { code: compact, access: defaultMode };
  return undefined;
}

function matchesEnvironment(link: URL, endpoint: URL) {
  if (link.origin === endpoint.origin) return true;
  if (link.protocol !== endpoint.protocol || link.port !== endpoint.port || !isLoopbackHost(endpoint.hostname)) return false;
  const address = link.hostname.replace(/^\[|\]$/g, "");
  return isLoopbackHost(link.hostname) ||
    Object.values(networkInterfaces()).some(entries => entries?.some(entry => entry.address === address));
}

function parseCredential(value: unknown, endpoint: URL, defaultMode: T3RuntimeMode) {
  const input = typeof value === "string" ? value.trim() : "";
  let pairing = pairingCode(input, defaultMode);
  if (input.includes("://")) {
    const link = URL.parse(input);
    if (!link || !["http:", "https:"].includes(link.protocol) || link.username || link.password || link.pathname.replace(/\/$/, "") !== "/pair")
      throw new Error("请粘贴 T3 Code 的配对链接或配对码");
    if (!matchesEnvironment(link, endpoint)) throw new Error("配对链接与当前 T3 Code 地址不匹配，请复制此电脑的配对链接");
    pairing = pairingCode(new URLSearchParams(link.hash.slice(1)).get("token") ?? "", defaultMode);
    if (!pairing) throw new Error("配对链接缺少有效配对码，请从 T3 Code 重新复制");
  }
  if (!pairing && (!input || /[^\x21-\x7e]/.test(input))) throw new Error("请粘贴有效的 T3 Code 配对链接、配对码或密钥");
  return { input, pairing };
}

async function post(endpoint: URL, signal: AbortSignal, path: string, body: object | URLSearchParams, failure: string): Promise<Record<string, unknown>> {
  try {
    const response = await requestHttp(new URL(path, endpoint), {
      method: "POST",
      signal,
      ...(body instanceof URLSearchParams
        ? { body }
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (response.ok) {
      const result: unknown = JSON.parse(await readHttpText(response, 256 * 1024, failure));
      if (isRecord(result)) return result;
    }
    await response.body?.cancel().catch(() => {});
  } catch {
    if (signal.aborted) throw new Error("连接 T3 Code 超时");
  }
  throw new Error(failure);
}

/** Redeem T3's short-lived pairing credential for a durable MCP client bearer. */
export async function resolveT3Credential(value: unknown, endpointUrl: string, signal: AbortSignal, mode: T3RuntimeMode = "full-access"): Promise<string> {
  const endpoint = new URL(endpointUrl);
  const { input, pairing } = parseCredential(value, endpoint, mode);
  if (!pairing) return input;

  const registered = await post(endpoint, signal, "/oauth/mcp/register", { client_name: "DeepBot", redirect_uris: [CALLBACK.href] },
    "无法注册 T3 Code MCP 客户端，请检查 T3 Code 服务");
  if (typeof registered.client_id !== "string" || !registered.client_id) throw new Error("T3 Code 未返回 MCP 客户端编号");

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const decision = await post(endpoint, signal, "/oauth/mcp/decision", {
    authorization: {
      response_type: "code",
      client_id: registered.client_id,
      redirect_uri: CALLBACK.href,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state,
      resource: endpoint.href,
    },
    decision: { _tag: "pairing-code", code: pairing.code, access: pairing.access },
  }, INVALID_CODE);
  const redirect = typeof decision.redirectTo === "string" ? URL.parse(decision.redirectTo) : null;
  const code = redirect?.searchParams.get("code");
  if (redirect?.origin !== CALLBACK.origin || redirect.pathname !== CALLBACK.pathname || redirect.searchParams.get("state") !== state || !code)
    throw new Error(INVALID_CODE);

  const token = await post(endpoint, signal, "/oauth/mcp/token", new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: registered.client_id,
    redirect_uri: CALLBACK.href,
    code_verifier: verifier,
    resource: endpoint.href,
  }), "T3 Code 未能建立 MCP 会话，请生成新配对码");
  if (token.token_type !== "Bearer" || typeof token.access_token !== "string" || !/^[\x21-\x7e]+$/.test(token.access_token))
    throw new Error("T3 Code 未返回有效的 MCP 会话密钥");
  return token.access_token;
}

/** A separately authorized T3 device session for replying to runtime requests. */
export async function resolveT3ApprovalCredential(value: unknown, endpointUrl: string, signal: AbortSignal): Promise<string> {
  const endpoint = t3ApprovalEndpoint(endpointUrl);
  const { input, pairing } = parseCredential(value, endpoint, "full-access");
  if (!pairing) return input;
  if (!CODE.test(pairing.code)) throw new Error("审批连接需要 T3 Code 的设备配对链接或配对码");
  const token = await post(endpoint, signal, "/oauth/token", new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token: pairing.code,
    scope: "orchestration:read orchestration:operate",
    client_label: "DeepBot 审批",
    client_device_type: "bot",
  }), "T3 Code 审批配对码已失效或缺少事项操作权限");
  if (token.token_type !== "Bearer" || typeof token.access_token !== "string" || !/^[\x21-\x7e]+$/.test(token.access_token))
    throw new Error("T3 Code 未返回有效的审批连接密钥");
  return token.access_token;
}

export function t3ApprovalEndpoint(endpointUrl: string) {
  const endpoint = new URL(endpointUrl);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLoopbackHost(endpoint.hostname)))
    throw new Error("T3 Code 审批连接需要本机回环地址或 HTTPS");
  return endpoint;
}

export function remoteT3Endpoint(input: string): string {
  const address = input.trim();
  const url = URL.parse(address);
  if (!/^https?:\/\/[^/]/i.test(address) || /[\\?#\s]/.test(address) || !url ||
    url.username || url.password || !["/", "/mcp", "/mcp/"].includes(url.pathname))
    throw new Error("请输入 T3 Code 的环境地址或 MCP 地址");
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname) && !isPrivateIpHost(url.hostname))
    throw new Error("T3 Code 派活连接的 HTTP 地址需要使用本机回环或局域网私有 IP，其他地址请使用 HTTPS");
  return new URL("/mcp", url).href;
}

export async function t3EnvironmentId(endpoint: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await requestHttp(new URL("/.well-known/t3/environment", endpoint), { signal });
    if (response.ok) {
      const value: unknown = JSON.parse(await readHttpText(response, 256 * 1024, "T3 Code 环境响应过大"));
      if (isRecord(value) && typeof value.environmentId === "string" && value.environmentId.trim())
        return value.environmentId;
    } else await response.body?.cancel();
  } catch {
    if (signal.aborted) throw new Error("连接 T3 Code 超时");
  }
  throw new Error("无法读取 T3 Code 环境，请检查连接地址");
}
