import type { Command } from "../protocol.ts";
import { fingerprint } from "../runtime/fingerprint.ts";
import { type RemoteT3Config } from "./config.ts";
import { remoteT3Endpoint, resolveT3ApprovalCredential, resolveT3Credential, t3ApprovalEndpoint, t3EnvironmentId } from "./t3-pairing.ts";
import { T3CodeConnector } from "./t3code.ts";

export type RemoteT3Command = Extract<Command, { type: "connector.t3.save" | "connector.t3.connect" }>;

export function remoteT3Connector(dataDir: string, config: RemoteT3Config, previous?: T3CodeConnector) {
  const { id, name, environmentId, enabled, token, approvalToken, runtimeMode } = config;
  return new T3CodeConnector({
    dataDir, url: remoteT3Endpoint(config.url), token, approvalToken, runtimeMode,
    remote: { id, name, environmentId, enabled },
    // Local path grants cannot authorize actions on another computer.
  }, previous);
}

export async function remoteT3Candidate(
  cmd: RemoteT3Command & { requestId: string },
  digest: string,
  saved: RemoteT3Config[],
  names: { id: string; name: string }[],
  signal: AbortSignal,
): Promise<RemoteT3Config> {
  const id = cmd.connectorId ?? `t3-remote-${fingerprint(cmd.requestId, 24)}`;
  const previous = saved.find(config => config.id === id);
  const replay = saved.find(config => config.requestId === cmd.requestId);
  if (replay) {
    if (replay.digest !== digest) throw new Error("requestId 已被其他内容使用");
    return replay;
  }
  if (cmd.connectorId && !previous) throw new Error("远端 T3 Code 执行器不存在");
  const request = { requestId: cmd.requestId, digest };
  if (cmd.type === "connector.t3.connect") return { ...previous!, ...request, enabled: cmd.enabled };
  if (!cmd.connectorId && previous) throw new Error("远端 T3 Code 执行器已存在");

  const name = cmd.name.trim();
  if (!name || name.length > 80 || /[\r\n]/.test(name)) throw new Error("请输入有效的执行器名称");
  const lower = name.toLowerCase();
  if (["self", "t3", "t3 code", "t3code", "bot 自己", "codex acp", "acp", "hermes"].includes(lower) ||
    names.some(entry => entry.id !== id && (entry.name.toLowerCase() === lower || entry.id.toLowerCase() === lower)))
    throw new Error("已有同名执行器，请使用不同名称");
  const url = remoteT3Endpoint(cmd.url?.trim() || previous?.url || "");
  const sameAddress = previous?.url === url;
  const input = cmd.token?.trim();
  if (!input && !sameAddress) throw new Error("请填写此地址的 T3 Code 配对凭据");
  const approvalInput = cmd.approvalCredential?.trim();
  if (approvalInput) t3ApprovalEndpoint(url);
  const environmentId = await t3EnvironmentId(url, signal);
  if (previous && previous.environmentId !== environmentId)
    throw new Error("此地址属于另一台 T3 Code 电脑，请添加独立的执行器");
  const token = input ? await resolveT3Credential(input, url, signal, cmd.runtimeMode) : previous!.token;
  const approvalToken = approvalInput ? await resolveT3ApprovalCredential(approvalInput, url, signal) : sameAddress ? previous?.approvalToken : undefined;
  return { id, name, url, environmentId, token, runtimeMode: cmd.runtimeMode, enabled: true, ...request,
    ...(approvalToken ? { approvalToken } : {}) };
}
