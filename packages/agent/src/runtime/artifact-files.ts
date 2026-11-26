import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, stat, type FileHandle } from "node:fs/promises";
import { allowedPath, PolicyError, type WorkingContext } from "../policy/gate.ts";
import type { FilePreview } from "../protocol.ts";

export type ArtifactFileContext = Pick<WorkingContext, "cwd" | "roots" | "settings">;
const TEXT_LIMIT = 256 * 1024;
const IMAGE_LIMIT = 8 * 1024 * 1024;

async function withFile<T>(context: ArtifactFileContext, input: string, read: (file: FileHandle, path: string) => Promise<T>): Promise<T> {
  // A saved work directory still resolves relative paths after a folder has been disconnected.
  const path = await allowedPath(context, input, context.roots);
  let file: FileHandle;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("找不到文件");
    if ((error as NodeJS.ErrnoException).code === "EACCES") throw new Error("没有权限读取文件");
    throw error;
  }
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("只能读取普通文件");
    const current = await allowedPath(context, path, context.roots);
    const named = await stat(current);
    if (current !== path || named.dev !== info.dev || named.ino !== info.ino) throw new PolicyError("产物文件路径已变化");
    return await read(file, path);
  } finally {
    await file.close();
  }
}

export async function checkArtifactFile(context: ArtifactFileContext, input: string): Promise<string> {
  return withFile(context, input, async (_file, path) => path);
}

export async function hashArtifactFile(context: ArtifactFileContext, input: string): Promise<{ path: string; hash: string }> {
  return withFile(context, input, async (file, path) => {
    const initial = await file.stat();
    const hash = createHash("sha256");
    let offset = 0;
    const data = Buffer.allocUnsafe(64 * 1024);
    while (offset < initial.size) {
      const { bytesRead } = await file.read(data, 0, Math.min(data.length, initial.size - offset), offset);
      if (bytesRead === 0) throw new Error("计算校验值时文件发生变化，请重试");
      hash.update(data.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const current = await file.stat();
    if (current.size !== initial.size || current.mtimeMs !== initial.mtimeMs || current.ctimeMs !== initial.ctimeMs)
      throw new Error("计算校验值时文件发生变化，请重试");
    return { path, hash: hash.digest("hex") };
  });
}

async function readPrefix(file: FileHandle, size: number): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await file.read(buffer, offset, size - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const header = bytes.toString("latin1", 0, 6);
  if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  if (header.startsWith("RIFF") && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

export async function previewArtifactFile(context: ArtifactFileContext, input: string): Promise<FilePreview> {
  return withFile(context, input, async (file) => {
    const mime = imageMime(await readPrefix(file, 12));
    const limit = mime ? IMAGE_LIMIT : TEXT_LIMIT;
    const bytes = await readPrefix(file, limit + 1);
    const truncated = bytes.length > limit;
    if (mime) {
      if (truncated) throw new Error("图片较大，请使用系统应用查看");
      return { kind: "image", image: `data:${mime};base64,${bytes.toString("base64")}` };
    }
    const unsupported = "此文件格式暂不支持内置预览";
    if (bytes.toString("latin1", 0, 5) === "%PDF-") throw new Error(unsupported);
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, limit), { stream: truncated }); }
    catch { throw new Error(unsupported); }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) throw new Error(unsupported);
    return { kind: "text", text, truncated };
  });
}

function requestDesktopOpen(program: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "ignore", signal: AbortSignal.timeout(8000) });
    child.once("error", reject);
    child.once("exit", resolve);
  });
}

async function openOnLinux(path: string): Promise<void> {
  try {
    // GIO reports when it hands the file off. Some xdg-open backends wait
    // for the application to quit, so use it only when GIO is unavailable.
    const status = await requestDesktopOpen("gio", ["open", path]).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return requestDesktopOpen("xdg-open", [path]);
    });
    if (status === 0) return;
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ABORT_ERR") throw new Error("系统未及时确认打开文件，请检查默认应用");
    if (code === "ENOENT") throw new Error("找不到系统文件打开器");
  }
  throw new Error("系统打开文件失败，请检查默认应用");
}

async function openInSystem(path: string): Promise<void> {
  if (process.platform === "linux") return openOnLinux(path);
  const program = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, [path], { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

export async function openArtifactFile(context: ArtifactFileContext, input: string, launch = openInSystem): Promise<void> {
  await withFile(context, input, async (_file, path) => launch(path));
}
