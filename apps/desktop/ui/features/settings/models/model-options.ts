import { MODEL_API_IDS, MODEL_INPUT_MODES, type ModelInputMode } from "../../../../../../packages/agent/src/protocol";

export const providerPresets = [
  { value: "openai", title: "OpenAI", api: "openai-responses", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  { value: "anthropic", title: "Anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com", apiKeyEnv: "ANTHROPIC_API_KEY" },
  { value: "openai-codex", title: "Codex · 本机登录", api: "openai-codex-responses", baseUrl: "", apiKeyEnv: "" },
  { value: "deepseek", title: "DeepSeek", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "" },
  { value: "dashscope", title: "阿里千问 · 百炼", api: "openai-completions", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "" },
  { value: "magpie", title: "Magpie", api: "openai-completions", baseUrl: "http://127.0.0.1:3425/v1", apiKeyEnv: "" },
  { value: "custom", title: "其他兼容服务", api: "openai-completions", baseUrl: "", apiKeyEnv: "" },
];
const apiTitles: Record<typeof MODEL_API_IDS[number], string> = {
  "openai-responses": "OpenAI Responses",
  "openai-completions": "OpenAI Chat Completions",
  "anthropic-messages": "Anthropic Messages",
  "openai-codex-responses": "Codex Responses",
};
export const apiOptions = MODEL_API_IDS.map(value => ({ value, title: apiTitles[value] }));
const inputTitles: Record<ModelInputMode, string> = {
  auto: "自动识别",
  text: "仅文本",
  image: "文本和图片",
};
export const inputOptions = MODEL_INPUT_MODES.map(value => ({ value, title: inputTitles[value] }));
export const providerName = (provider: string) => providerPresets.find(p => p.value === provider)?.title ?? provider;
