import { signal } from "nsh";
import { command, runtime } from "./runtime";
import { readLocalJson, writeLocalJson } from "./local-json";
import type { ExecutorSettings, Permissions } from "../../../../packages/agent/src/protocol";
import { boolean, hasKey, oneOf, shape, string } from "../../../../packages/agent/src/wire-values";

/** Local display preferences persist in NSH Storage; execution permissions come from the sidecar. */
export interface Preferences {
  theme: "system" | "light" | "dark";
  language: "system" | "zh-CN" | "en-US";
  microphone: "default";
  defaultBotId: string;
  spellCheck: boolean;
  hardwareAcceleration: boolean;
  /** 打开对话时展开 Bot 信息 */
  autoOpenInfo: boolean;
  autoUpdate: boolean;
  voice: { voice: string; speed: string; language: string };
}

export type PermissionId = keyof Permissions;

export const permissionList: { id: PermissionId; label: string; description: string }[] = [
  { id: "files", label: "读取和保存本地文件", description: "仅限你连接的文件夹" },
  { id: "browser", label: "使用浏览器", description: "读取网页；外发内容按发布权限确认" },
  { id: "confirmPublish", label: "发布或发送前先问我", description: "发布或发送具体内容前先确认" },
  { id: "deleteFiles", label: "允许删除文件", description: "默认关闭，删除无法撤销" },
];

const defaults: Preferences = {
  theme: "system",
  language: "system",
  microphone: "default",
  defaultBotId: "xiaocai",
  spellCheck: true,
  hardwareAcceleration: false,
  autoOpenInfo: false,
  autoUpdate: true,
  voice: { voice: "helix", speed: "1x", language: "auto" },
};
const savedPreferences = shape({}, {
  theme: oneOf("system", "light", "dark"),
  language: oneOf("system", "zh-CN", "en-US"),
  microphone: oneOf("default"),
  defaultBotId: string,
  spellCheck: boolean,
  hardwareAcceleration: boolean,
  autoOpenInfo: boolean,
  autoUpdate: boolean,
  voice: shape({ voice: string, speed: string, language: string }),
});
export const preferences = signal<Preferences>(defaults);
void readLocalJson("preferences", savedPreferences).then(saved => {
  if (!saved) return;
  const value = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (hasKey(saved, key)) Object.assign(value, { [key]: saved[key] });
  }
  preferences.set(value);
});

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  preferences.set({ ...preferences(), [key]: value });
  writeLocalJson("preferences", preferences());
}

export function setPermission(id: PermissionId, on: boolean) {
  command({ type: "settings.update", settings: { permissions: { ...runtime().settings.permissions, [id]: on } } });
}

export function setExecutor<K extends keyof ExecutorSettings>(key: K, value: ExecutorSettings[K]) {
  command({ type: "settings.update", settings: { executor: { ...runtime().settings.executor, [key]: value } } });
}
