import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./data-directory.ts";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { createModels, Provider } from "@earendil-works/pi-ai/models";
import { MODEL_API_IDS, MODEL_INPUT_MODES, type HostMessage, type ModelConfig, type ModelDraft, type ModelResult } from "../protocol.ts";
import { fingerprint } from "./fingerprint.ts";
import { readJson, writePrivateJson } from "./private-json.ts";
import { readHttpText, requestHttp } from "./http.ts";
import { arrayOf, boolean, isArray, isRecord, oneOf, recordOf, requireShape, shape, string } from "../wire-values.ts";
import { createModelRuntime, resolveModelInput, type Config } from "./models.ts";

type MutableModels = ReturnType<typeof createModels>;
type StoredConfig = Omit<ModelConfig, "hasApiKey"> & { apiKey?: string; codexAuthFile?: string };
type ModelCommand = Extract<HostMessage, { type: "model.upsert" | "model.add-many" | "model.default" | "model.delete" }>;
type FileState = { version: 1; configs: StoredConfig[]; defaultId: string; requests: Record<string, string> };
const importEnvKeys = ["DEEPBOT_PROVIDER", "DEEPBOT_MODEL", "DEEPBOT_BASE_URL", "DEEPBOT_API", "DEEPBOT_API_KEY", "DEEPBOT_USE_CODEX_AUTH", "DEEPBOT_CODEX_AUTH_FILE"];
const apis = new Set<string>(MODEL_API_IDS);
const inputMode = oneOf(...MODEL_INPUT_MODES);
const fileState = shape({
  version: (value: unknown): value is 1 => value === 1,
  configs: arrayOf(shape({ id: string, name: string, provider: string, model: string, api: string, baseUrl: string,
    apiKeyEnv: string, useCodexAuth: boolean }, { apiKey: string, codexAuthFile: string, inputMode })),
  defaultId: string, requests: recordOf(string),
});
function readModelState(path: string): FileState {
  try { return requireShape(readJson(path), fileState, "模型配置文件无效"); }
  catch { throw new Error("模型配置文件无效，请检查格式与权限"); }
}
function validate(config: StoredConfig) {
  for (const key of ["id", "name", "provider", "model", "api"] as const)
    if (typeof config[key] !== "string" || !config[key].trim()) throw new Error("模型配置的编号、名称、提供方、模型与 API 不能为空");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.id)) throw new Error("模型配置编号无效");
  if (!apis.has(config.api)) throw new Error("不支持的模型 API");
  if (config.inputMode !== undefined && !inputMode(config.inputMode)) throw new Error("模型输入能力无效");
  if (typeof config.baseUrl !== "string" || typeof config.apiKeyEnv !== "string" || typeof config.useCodexAuth !== "boolean") throw new Error("模型配置无效");
  if (config.apiKeyEnv && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.apiKeyEnv)) throw new Error("密钥环境变量名无效");
  if (config.apiKey !== undefined && typeof config.apiKey !== "string") throw new Error("模型密钥无效");
  if (config.baseUrl) {
    let url: URL;
    try { url = new URL(config.baseUrl); } catch { throw new Error("模型地址无效"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("模型地址必须是 HTTP 或 HTTPS 且不包含凭据");
  }
}
function fromLegacy(id: string, name: string, config: Config): StoredConfig {
  return { id, name, provider: config.provider!, model: config.model!, api: config.api!, baseUrl: config.baseUrl ?? "", apiKeyEnv: config.apiKeyEnv ?? "", useCodexAuth: config.useCodexAuth ?? false, ...(config.apiKey ? { apiKey: config.apiKey } : {}), ...(config.codexAuthFile ? { codexAuthFile: config.codexAuthFile } : {}), ...(config.inputMode === undefined ? {} : { inputMode: config.inputMode }) };
}

/** One Pi provider per configuration keeps identical provider/model names with different endpoints isolated. */
export class ModelSettings {
  private state: FileState;
  readonly path: string;
  readonly models: MutableModels;
  private env: NodeJS.ProcessEnv;
  private constructor(path: string, models: MutableModels, env: NodeJS.ProcessEnv, state: FileState) { this.path = path; this.models = models; this.env = env; this.state = state; }
  static async open(options: { path?: string; env?: NodeJS.ProcessEnv; legacyConfigPath?: string; loadDotEnv?: boolean } = {}) {
    const env = { ...(options.env ?? process.env) };
    const path = options.path ?? env.DEEPBOT_MODELS_FILE ?? join(dataDirectory(env), "models.json");
    const exists = existsSync(path);
    const sourceEnv = { ...env };
    if (exists) for (const key of importEnvKeys) delete sourceEnv[key];
    const legacy = await createModelRuntime({
      env: sourceEnv,
      ...(options.legacyConfigPath !== undefined ? { configPath: options.legacyConfigPath } : {}),
      ...(options.loadDotEnv !== undefined ? { loadDotEnv: options.loadDotEnv } : {}),
      ...(exists ? { config: {}, ignoreImportEnv: true } : {}),
    });
    const state: FileState = exists ? readModelState(path) : { version: 1, configs: [fromLegacy("default", "默认模型", legacy.config)], defaultId: "default", requests: {} };
    if (state.version !== 1 || !Array.isArray(state.configs) || !state.configs.length || !state.requests || typeof state.requests !== "object") throw new Error("模型配置文件无效");
    state.configs.forEach(validate);
    if (new Set(state.configs.map(c => c.id)).size !== state.configs.length || !state.configs.some(c => c.id === state.defaultId)) throw new Error("模型配置编号或默认模型无效");
    // DEEPBOT_* only imports the initial profile; later edits are authoritative.
    Object.assign(env, legacy.env);
    for (const key of importEnvKeys) delete env[key];
    const settings = new ModelSettings(path, legacy.models, env, state);
    for (const config of state.configs) settings.models.setProvider(await settings.prepare(config));
    if (!exists) settings.persist(state);
    else chmodSync(path, 0o600);
    return settings;
  }
  view() {
    return { modelConfigs: this.state.configs.map(({ apiKey, codexAuthFile: _authFile, ...config }) => ({ ...config, hasApiKey: !!apiKey })), defaultModelConfigId: this.state.defaultId };
  }
  providerId(id: string) { return `deepbot:${id}`; }
  inputCapability(id: string) {
    const config = this.state.configs.find(c => c.id === id);
    return config ? resolveModelInput(config) : "unknown";
  }
  private persist(state: FileState) {
    writePrivateJson(this.path, state);
    this.state = state;
  }
  private async prepare(config: StoredConfig) {
    const runtime = await createModelRuntime({ env: this.env, config, loadDotEnv: false });
    const provider = runtime.models.getProvider(config.provider)!;
    const model = runtime.models.getModel(config.provider, config.model)!;
    const alias = this.providerId(config.id);
    return { ...provider, id: alias, getModels: () => [{ ...model, provider: alias }], getAllModels: () => [{ ...model, provider: alias }] };
  }
  /** Discovery and connection tests use an unsaved draft and never mutate profiles or the ledger. */
  async inspect(mode: "model.list" | "model.test", draft: ModelDraft, apiKey: string | undefined, signal: AbortSignal): Promise<ModelResult> {
    const saved = this.state.configs.find(c => c.id === draft?.id);
    const input = { ...saved, ...draft } as StoredConfig;
    const effectiveKey = apiKey?.trim() || (saved?.provider === input.provider ? saved?.apiKey : undefined);
    if (effectiveKey === undefined) delete input.apiKey;
    else input.apiKey = effectiveKey;
    input.name = input.name?.trim() || input.model?.trim() || "测试模型";
    if (mode === "model.list") input.model ||= "catalog";
    validate(input);
    const runtime = await createModelRuntime({ env: this.env, config: input, loadDotEnv: false });
    const model = runtime.models.getModel(input.provider, input.model)!;
    if (mode === "model.test") {
      try {
        const response = await runtime.models.completeSimple(model, { messages: [{ role: "user", content: "Reply with OK only.", timestamp: Date.now() }] }, { maxTokens: 32, signal });
        if (response.stopReason === "error" || response.stopReason === "aborted") throw new Error("connection");
      } catch { throw new Error("连接失败，请检查模型 ID、API 类型、服务地址和认证"); }
      return { ok: true, message: "连接成功，模型已返回响应" };
    }
    if (input.api === "openai-codex-responses") {
      const models = openaiCodexProvider().getModels().map(m => m.id);
      return { ok: true, message: "已载入 Pi 模型目录，连接状态请单独测试", models };
    }
    const base = (input.baseUrl || model.baseUrl).replace(/\/+$/, "");
    const url = input.api === "anthropic-messages" && !/\/v\d+$/.test(base) ? `${base}/v1/models` : `${base}/models`;
    const auth = await runtime.models.getAuth(model);
    const key = auth?.auth.apiKey;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (input.api === "anthropic-messages") {
      headers["anthropic-version"] = "2023-06-01";
      if (key) headers["x-api-key"] = key;
    }
    let response: Response;
    try { response = await requestHttp(url, { headers, signal }); }
    catch { throw new Error("无法拉取模型，请检查服务地址与网络；也可手动填写模型 ID"); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`拉取失败（HTTP ${response.status}），请检查地址与认证，或手动填写模型 ID`); }
    const raw = await readHttpText(response, 2 * 1024 * 1024, "模型列表过大，请手动填写模型 ID");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new Error("服务未返回有效模型列表，可手动填写模型 ID"); }
    const list = isRecord(body) ? body.data : body;
    if (!isArray(list)) throw new Error("服务未返回有效模型列表，可手动填写模型 ID");
    const models = [...new Set(list.map(item => isRecord(item) ? item.id : item).filter((id): id is string => typeof id === "string" && !!id.trim()))].slice(0, 2000).sort();
    return { ok: true, message: models.length ? `已拉取 ${models.length} 个模型` : "服务未返回模型，可手动填写模型 ID", models };
  }
  async migrateLegacy(provider: string, model: string) {
    const existing = this.state.configs.find(c => c.provider === provider && c.model === model);
    if (existing) return existing.id;
    const base = this.state.configs.find(c => c.provider === provider) ?? this.state.configs.find(c => c.id === this.state.defaultId)!;
    const id = `legacy-${fingerprint({ provider, model }).slice(0, 16)}`;
    const config = { ...base, id, name: model, provider, model, ...(base.provider === provider ? {} : { baseUrl: "", apiKeyEnv: provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY", useCodexAuth: provider === "openai-codex", api: provider === "anthropic" ? "anthropic-messages" : provider === "openai-codex" ? "openai-codex-responses" : "openai-responses" }) };
    delete config.inputMode;
    if (base.provider !== provider) delete config.apiKey;
    const prepared = await this.prepare(config);
    this.persist({ ...this.state, configs: [...this.state.configs, config] });
    this.models.setProvider(prepared);
    return id;
  }
  async apply(cmd: ModelCommand, referencedIds: string[]) {
    const digest = fingerprint(cmd);
    const previous = this.state.requests[cmd.requestId];
    if (previous) { if (previous !== digest) throw new Error("requestId 已被其他内容使用"); return; }
    const next = structuredClone(this.state);
    const prepared: Provider[] = [];
    if (cmd.type === "model.upsert" || cmd.type === "model.add-many") {
      if (!cmd.config || typeof cmd.config !== "object") throw new Error("模型配置无效");
      let drafts: ModelDraft[] = [cmd.config];
      if (cmd.type === "model.add-many") {
        if (typeof cmd.config.id !== "string" || !cmd.config.id.trim()) throw new Error("模型配置编号无效");
        if (!Array.isArray(cmd.models) || cmd.models.length < 2 || cmd.models.length > 2000 ||
            cmd.models.some(model => typeof model !== "string" || !model.trim())) throw new Error("批量添加需要 2 至 2000 个有效模型 ID");
        const models = cmd.models.map(model => model.trim());
        if (new Set(models).size !== models.length) throw new Error("所选模型 ID 重复");
        drafts = models.map((model, i) => ({ ...cmd.config, id: `${cmd.config.id}-${i + 1}`, name: model, model }));
      }
      const configs = drafts.map(patch => {
        const index = next.configs.findIndex(c => c.id === patch.id);
        if (index >= 0 && cmd.type === "model.add-many") throw new Error("模型配置编号已存在");
        const old = next.configs[index];
        const input = { ...old, ...patch } as StoredConfig;
        // Explicit allowlist prevents credentials from leaking into public metadata.
        const apiKey = cmd.apiKey === undefined || cmd.apiKey === "" ? (old?.provider === input.provider ? old?.apiKey : undefined) : cmd.apiKey;
        const mode = patch.inputMode ?? (old?.provider === input.provider && old?.model === input.model ? old?.inputMode : undefined);
        const config: StoredConfig = {
          id: input.id, name: input.name, provider: input.provider, model: input.model, api: input.api,
          baseUrl: input.baseUrl, apiKeyEnv: input.apiKeyEnv, useCodexAuth: input.useCodexAuth,
          ...(mode === undefined ? {} : { inputMode: mode }),
          ...(old?.codexAuthFile ? { codexAuthFile: old.codexAuthFile } : {}),
          ...(apiKey !== undefined ? { apiKey } : {}),
        };
        validate(config);
        if (index >= 0) next.configs[index] = config;
        else next.configs.push(config);
        return config;
      });
      for (const config of configs) prepared.push(await this.prepare(config));
    } else {
      if (!next.configs.some(c => c.id === cmd.modelConfigId)) throw new Error("模型配置不存在");
      if (cmd.type === "model.default") next.defaultId = cmd.modelConfigId;
      else {
        if (next.defaultId === cmd.modelConfigId) throw new Error("这是默认模型，请先将其他模型设为默认后再删除；没有其他模型时请先添加模型");
        if (referencedIds.includes(cmd.modelConfigId)) throw new Error("模型正在被 Bot 或运行事项使用，请先选中对应 Bot，在右侧「配置」中切换模型，并结束使用此模型的运行事项后再删除");
        next.configs = next.configs.filter(c => c.id !== cmd.modelConfigId);
      }
    }
    next.requests[cmd.requestId] = digest;
    this.persist(next);
    for (const provider of prepared) this.models.setProvider(provider);
    if (cmd.type === "model.delete") this.models.deleteProvider(this.providerId(cmd.modelConfigId));
  }
}

/** Shared startup path for the sidecar and opt-in live acceptance runners. */
export async function createConfiguredModelRuntime(options: Parameters<typeof ModelSettings.open>[0] = {}) {
  const modelSettings = await ModelSettings.open(options);
  const view = modelSettings.view();
  const config = view.modelConfigs.find(c => c.id === view.defaultModelConfigId)!;
  return { modelSettings, models: modelSettings.models, provider: config.provider, modelId: config.model, configured: !!await modelSettings.models.checkAuth(modelSettings.providerId(config.id)) };
}
