import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, accessSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { readJson, writePrivateJson } from "../runtime/private-json.ts";
import type { Report } from "../protocol.ts";

export function executable(command: string): boolean {
  const paths = command.includes("/") ? [resolve(command)] : (process.env.PATH ?? "").split(delimiter).map((directory) => join(directory, command));
  return paths.some((path) => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } });
}

const processVariables = [
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "TERM",
  "TMPDIR", "TMP", "TEMP", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "SystemRoot", "ComSpec", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
];

export function startConnectorProcess(command: string, args: string[], options: {
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  detached?: boolean;
}) {
  const env: Record<string, string> = {};
  for (const key of processVariables) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return spawn(command, args, {
    cwd: options.cwd, detached: options.detached ?? false, env: { ...env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
}

export class DurableRecords<T extends { assignmentId: string; reports: Report[] }> {
  readonly directory: string;
  constructor(dataDir: string, name: string) {
    // Records written before connectors replaced executors keep their files.
    const legacy = join(dataDir, "executors"), root = join(dataDir, "connectors");
    if (existsSync(legacy) && !existsSync(root)) renameSync(legacy, root);
    this.directory = join(root, name.replace(/[^a-zA-Z0-9_-]/g, "_"));
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  path(id: string): string { return join(this.directory, `${createHash("sha256").update(id).digest("hex")}.json`); }
  get(id: string): T | undefined {
    try { return readJson(this.path(id)) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  put(record: T): void {
    writePrivateJson(this.path(record.assignmentId), record);
  }
  report(record: T, input: Omit<Report, "id" | "assignmentId" | "createdAt">, key?: string): Report {
    const id = `${record.assignmentId}:${key ?? randomUUID()}`;
    const previous = record.reports.find((report) => report.id === id);
    if (previous) return previous;
    const report: Report = { ...input, id, assignmentId: record.assignmentId, createdAt: Date.now() };
    this.put({ ...record, reports: [...record.reports, report] });
    record.reports.push(report);
    return report;
  }
  after(record: T, cursor?: string): Report[] {
    if (!cursor) return record.reports;
    const index = record.reports.findIndex((report) => report.id === cursor);
    // Unknown cursors intentionally replay; the ledger also deduplicates report ids.
    return record.reports.slice(index + 1);
  }
}

/** Serializes a single assignment without blocking unrelated assignments. */
export class KeyedSerial {
  private queues = new Map<string, Promise<unknown>>();
  async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.queues.set(key, next);
    try { return await next; } finally { if (this.queues.get(key) === next) this.queues.delete(key); }
  }
}
