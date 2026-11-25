import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { processStatus } from "./process-id.ts";

const directoryName = ".deepbot";

/** All DeepBot-owned runtime files share one root, including isolated instances. */
export function dataDirectory(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return resolve(env.DEEPBOT_DATA_DIR ?? join(home, directoryName));
}

export function projectSkillDirectory(projectDir: string): string {
  return join(projectDir, directoryName, "skills");
}

/** Move old data without copying an incomplete SQLite database or overwriting a new one. */
export function prepareDataDirectory(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const target = dataDirectory(env, home);
  if (target !== resolve(home, directoryName)) {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    return target;
  }
  const sources = [...new Set([
    join(home, ".local", "share", "deepbot"), join(home, ".config", "deepbot"),
    ...(env.XDG_DATA_HOME ? [join(env.XDG_DATA_HOME, "deepbot")] : []),
    ...(env.XDG_CONFIG_HOME ? [join(env.XDG_CONFIG_HOME, "deepbot")] : []),
  ].map(path => resolve(path)))].filter(path => path !== target && existsSync(path) && realpathSync(path) !== (existsSync(target) ? realpathSync(target) : target));
  const moves: { from: string; to: string }[] = [], destinations = new Set<string>();
  for (const source of sources) {
    if (!lstatSync(source).isDirectory()) throw new Error(`旧数据目录不是普通目录，无法自动迁移：${source}`);
    const lock = join(source, "agent.lock");
    if (existsSync(lock)) {
      const status = processStatus(Number(readFileSync(lock, "utf8")));
      if (status === "running" || status === "denied")
        throw new Error("请先退出使用旧数据目录的 DeepBot，再迁移到 ~/.deepbot");
    }
    for (const name of readdirSync(source)) {
      const to = join(target, name);
      if (destinations.has(to) || lstatSync(to, { throwIfNoEntry: false })) throw new Error(`数据迁移遇到同名文件，未覆盖：${to}`);
      destinations.add(to); moves.push({ from: join(source, name), to });
    }
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  chmodSync(target, 0o700);
  const moved: typeof moves = [], linked: string[] = [], removed: string[] = [];
  try {
    for (const move of moves) { renameSync(move.from, move.to); moved.push(move); }
    // Old absolute paths (including installed tools) keep resolving to the single new root.
    for (const source of sources) {
      rmdirSync(source); removed.push(source);
      symlinkSync(target, source, "dir"); linked.push(source);
    }
  } catch (error) {
    for (const source of linked.reverse()) unlinkSync(source);
    for (const source of removed) mkdirSync(source, { recursive: true, mode: 0o700 });
    for (const move of moved.reverse()) renameSync(move.to, move.from);
    throw error;
  }
  return target;
}
