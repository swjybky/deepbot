import type { ExecutorSettings, Settings, Snapshot } from "./protocol.ts";

export const DEFAULT_BOT_MAX_CONCURRENT = 10;
export const DEFAULT_FOREGROUND_MAX_TURNS = 24;
export const FOREGROUND_MAX_TURNS_LIMIT = 32;

export function isForegroundMaxTurns(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= FOREGROUND_MAX_TURNS_LIMIT;
}

export const defaultExecutor = (): ExecutorSettings => ({
  thinkingLevel: "medium",
  contextWindow: 0,
  images: true,
  projectInstructions: true,
});

export const defaultSettings = (): Settings => ({
  permissions: { files: true, browser: true, confirmPublish: true, deleteFiles: false },
  executor: defaultExecutor(),
  connectedFolders: [],
  debounceMs: 1200,
  foregroundMaxTurns: DEFAULT_FOREGROUND_MAX_TURNS,
  maxConcurrent: 3,
});

export function emptySnapshot(): Snapshot {
  return {
    modelConfigs: [],
    defaultModelConfigId: "",
    bots: [],
    threads: [],
    messages: [],
    works: [],
    assignments: [],
    attentions: [],
    artifacts: [],
    rules: [],
    routines: [],
    memories: [],
    settings: defaultSettings(),
    connectors: [],
    sharedFolder: "",
    typing: {},
    errors: {},
  };
}
