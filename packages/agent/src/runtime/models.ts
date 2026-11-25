import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { dataDirectory } from "./data-directory.ts";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAICodexResponsesApi } from "@earendil-works/pi-ai/api/openai-codex-responses.lazy";
import type { Model, Api } from "@earendil-works/pi-ai";
import type { ModelInputMode } from "../protocol.ts";

export interface Config { provider?: string; model?: string; baseUrl?: string; api?: string; apiKey?: string; apiKeyEnv?: string; codexAuthFile?: string; useCodexAuth?: boolean; inputMode?: ModelInputMode; }
const catalogInputs = new Map<string, Map<string, "image" | "text">>(getBuiltinProviders().map(provider => [
  provider,
  new Map(getBuiltinModels(provider).map(model => [model.id, model.input.includes("image") ? "image" : "text"])),
]));

export function resolveModelInput({ provider, model, inputMode }: { provider: string; model: string; inputMode?: ModelInputMode }) {
  if (inputMode === "image" || inputMode === "text") return inputMode;
  // Compatible gateways can pass through catalog IDs. Match exact IDs and leave opaque aliases unknown.
  return catalogInputs.get(provider)?.get(model)
    ?? catalogInputs.get("openrouter")?.get(model)
    ?? catalogInputs.get("openai")?.get(model)
    ?? catalogInputs.get("anthropic")?.get(model)
    ?? catalogInputs.get("google")?.get(model)
    ?? "unknown";
}
const project = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
function configFile(path: string): Config {
  if (!existsSync(path)) return {};
  const result: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("DeepBot 模型配置必须是 JSON 对象");
  return result as Config;
}
function codexAccess(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const auth = JSON.parse(readFileSync(path, "utf8"));
    const token = auth.tokens?.access_token;
    return typeof token === "string" && token ? token : undefined;
  } catch { return undefined; }
}
function magpieLocalKey(baseUrl: string | undefined) {
  const host = URL.parse(baseUrl ?? "")?.hostname;
  // Magpie accepts an app identifier on loopback. Remote gateways require their own key.
  return host && ["127.0.0.1", "localhost", "[::1]"].includes(host) ? "magpie-deepbot" : undefined;
}
/** Credentials stay in provider closures, never in snapshots, prompts, or the database. */
export async function createModelRuntime(options: { env?: NodeJS.ProcessEnv; configPath?: string; loadDotEnv?: boolean; config?: Config; ignoreImportEnv?: boolean } = {}) {
  let env = { ...(options.env ?? process.env) };
  if (options.loadDotEnv !== false) {
    const fromFiles: NodeJS.ProcessEnv = {};
    for (const path of [join(project, ".env"), join(project, ".env.local")]) {
      if (existsSync(path)) Object.assign(fromFiles, parseEnv(readFileSync(path, "utf8")));
    }
    env = { ...fromFiles, ...env };
  }
  if (options.ignoreImportEnv) {
    for (const key of ["DEEPBOT_PROVIDER", "DEEPBOT_MODEL", "DEEPBOT_BASE_URL", "DEEPBOT_API", "DEEPBOT_API_KEY", "DEEPBOT_USE_CODEX_AUTH", "DEEPBOT_CODEX_AUTH_FILE"]) delete env[key];
  }
  const cfg = options.config ?? configFile(options.configPath ?? env.DEEPBOT_CONFIG ?? join(dataDirectory(env), "config.json"));
  // Node fetch ignores proxy variables unless explicitly enabled. Honor the host network setup.
  if (typeof http.setGlobalProxyFromEnv === "function") http.setGlobalProxyFromEnv(env);
  else if ((env.HTTP_PROXY || env.HTTPS_PROXY || env.http_proxy || env.https_proxy) && !env.NODE_USE_ENV_PROXY) throw new Error("代理连接需要支持 setGlobalProxyFromEnv 的 Node 版本，请升级 Node 或启用 NODE_USE_ENV_PROXY=1");
  const authFile = env.DEEPBOT_CODEX_AUTH_FILE ?? cfg.codexAuthFile ?? join(homedir(), ".codex", "auth.json");
  const canUseCodex = cfg.useCodexAuth !== false && env.DEEPBOT_USE_CODEX_AUTH !== "0" && !!codexAccess(authFile);
  const provider = env.DEEPBOT_PROVIDER ?? cfg.provider ?? (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : canUseCodex ? "openai-codex" : "anthropic");
  const modelId = env.DEEPBOT_MODEL ?? cfg.model ?? (provider === "anthropic" ? "claude-sonnet-5-5" : provider === "openai-codex" ? "gpt-6.1-terra" : "gpt-6-sol");
  const models = createModels({ authContext: { env: async key => env[key], fileExists: async path => existsSync(path) }, identity: { attribution: null } });
  models.setProvider(anthropicProvider()); models.setProvider(openaiProvider());
  // Read the local CLI's current access token. Deliberately do not rotate or copy its refresh token.
  const codex = openaiCodexProvider();
  models.setProvider(createProvider({ id: "openai-codex", name: "本机 Codex 登录", ...(codex.baseUrl !== undefined ? { baseUrl: codex.baseUrl } : {}), models: codex.getModels(), api: openAICodexResponsesApi(), auth: { apiKey: {
    name: "本机 Codex 登录", login: async () => { throw new Error("请在本机 Codex 完成登录"); },
    resolve: async () => { const key = canUseCodex ? codexAccess(authFile) : undefined; return key ? { auth: { apiKey: key }, source: "本机 Codex 登录（只读）" } : undefined; },
  } } }));
  const baseUrl = env.DEEPBOT_BASE_URL ?? cfg.baseUrl;
  const defaultKey = provider === "magpie"
    ? magpieLocalKey(baseUrl)
    : env[provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"];
  const apiKey = env.DEEPBOT_API_KEY ?? cfg.apiKey ?? (cfg.apiKeyEnv ? env[cfg.apiKeyEnv] : undefined) ?? defaultKey;
  const inputMode = cfg.inputMode ?? "auto";
  if (cfg.api || env.DEEPBOT_API || baseUrl || inputMode !== "auto" || apiKey && (env.DEEPBOT_API_KEY || cfg.apiKey || cfg.apiKeyEnv) || !models.getModel(provider, modelId)) {
    const api = env.DEEPBOT_API ?? cfg.api ?? (provider === "anthropic" ? "anthropic-messages" : provider === "openai-codex" ? "openai-codex-responses" : "openai-responses");
    if (!["anthropic-messages", "openai-responses", "openai-completions", "openai-codex-responses"].includes(api)) throw new Error("不支持的 DEEPBOT_API");
    const original = models.getModel(provider, modelId);
    const capability = resolveModelInput({ provider, model: modelId, inputMode });
    const model: Model<Api> = {
      reasoning: false, contextWindow: 128000, maxTokens: 16384, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      ...original, id: modelId, name: original?.name ?? modelId, provider, api,
      baseUrl: baseUrl ?? original?.baseUrl ?? models.getProvider(provider)?.baseUrl ?? (api === "anthropic-messages" ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
      input: capability === "image" ? ["text", "image"] : ["text"],
    };
    models.setProvider(createProvider({ id: provider, models: [...(models.getModels(provider).filter(m => m.id !== modelId)), model], baseUrl: model.baseUrl, api: api === "anthropic-messages" ? anthropicMessagesApi() : api === "openai-completions" ? openAICompletionsApi() : api === "openai-codex-responses" ? openAICodexResponsesApi() : openAIResponsesApi(), auth: { apiKey: {
      name: "DeepBot 模型凭据", login: async () => { throw new Error("请配置 DEEPBOT_API_KEY"); },
      resolve: async () => { const key = apiKey ?? (provider === "openai-codex" && canUseCodex ? codexAccess(authFile) : undefined); return key ? { auth: { apiKey: key, baseUrl: model.baseUrl }, source: "DeepBot 本机配置" } : undefined; },
    } } }));
  }
  const importedKey = env.DEEPBOT_API_KEY ?? cfg.apiKey;
  const config: Config = {
    ...cfg, provider, model: modelId,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    api: env.DEEPBOT_API ?? cfg.api ?? (provider === "anthropic" ? "anthropic-messages" : provider === "openai-codex" ? "openai-codex-responses" : "openai-responses"),
    ...(importedKey !== undefined ? { apiKey: importedKey } : {}),
    apiKeyEnv: cfg.apiKeyEnv ?? (provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : ""),
    codexAuthFile: authFile, useCodexAuth: provider === "openai-codex" && canUseCodex,
  };
  return { models, provider, modelId, env, configured: !!await models.checkAuth(provider), config };
}
