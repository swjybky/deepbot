import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, Settings } from "../protocol.ts";
import { fingerprint } from "../runtime/fingerprint.ts";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/** Align path normalization with pi-durable's resolveToolPath / NodeExecutionEnv.absolutePath before boundary checks. */
export function normalizeToolPathInput(input: string): string {
  let normalized = input.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized === "~") {
    normalized = homedir();
  } else if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))) {
    normalized = join(homedir(), normalized.slice(2));
  } else if (normalized.startsWith("file://")) {
    try {
      normalized = fileURLToPath(normalized);
    } catch {
      // Keep malformed file:// URLs as ordinary strings so downstream checks reject them cleanly.
    }
  }
  return normalized;
}

/** `roots`: the work's folder, the Bot's workspace and folders, the shared folder and the connected folders. */
export interface WorkingContext { workId: string; assignmentId: string; cwd: string; roots: string[]; settings: Settings; }
export class PolicyError extends Error { constructor(message: string) { super(message); this.name = "PolicyError"; } }
export function actionKey(workId: string, assignmentId: string, action: Action): string {
  return fingerprint([workId, assignmentId, action.kind, action.path ?? "", action.destination ?? "", action.content ?? "", action.description]);
}
export function within(root: string, target: string): boolean {
  const r = relative(root, target); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}
/** Resolve each existing ancestor, including symlinks, even when creating a new file. */
async function canonical(target: string): Promise<string> {
  try { return await realpath(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A dangling link is not a missing leaf and must never be followed on write.
    const info = await lstat(target).catch(() => undefined);
    if (info?.isSymbolicLink()) throw new PolicyError("不允许操作悬空符号链接");
    const parent = dirname(target);
    if (parent === target) throw error;
    return resolve(await canonical(parent), relative(parent, target));
  }
}
/** Paths inside the context's roots are readable for verification; relative paths start at its cwd. */
export async function pathInRoots(input: string, cwd: string, roots: readonly string[]): Promise<string> {
  if (!input || input.includes("\0")) throw new PolicyError("文件路径无效");
  const candidate = resolve(cwd, input);
  const target = await canonical(candidate);
  const allowed = await Promise.all(roots.map(p => canonical(resolve(p))));
  if (!allowed.some(root => within(root, target))) throw new PolicyError("路径不在事项目录、Bot 的工作区和关联文件夹、公共文件夹或已连接的文件夹内");
  return target;
}

export async function allowedPath(
  context: Pick<WorkingContext, "cwd" | "roots" | "settings">,
  input: string,
  roots: readonly string[] = [context.cwd, ...context.roots],
): Promise<string> {
  if (!context.settings.permissions.files) throw new PolicyError("读取和保存本地文件权限已关闭");
  return pathInRoots(normalizeToolPathInput(input), context.cwd, roots);
}
export function allowedUrl(input: string): URL {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new PolicyError("只允许不含登录信息的 HTTP 或 HTTPS 地址");
  return url;
}
