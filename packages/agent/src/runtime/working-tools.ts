import { createHash } from "node:crypto";
import { open, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { num, obj, opt, str } from "@earendil-works/pi-schema";
import { allowedPath, allowedUrl, PolicyError, type WorkingContext } from "../policy/gate.ts";
import { readHttpText, requestHttp } from "./http.ts";
import { toolOutput as output } from "../bot/tool-output.ts";
export type { WorkingContext } from "../policy/gate.ts";
export interface WorkingToolsHost {
  contextFor(conversationId: string): Promise<WorkingContext>;
}
/** Read-only tools the Bot uses to verify delivered work; real permission data is read for every call. */
export function createWorkingTools(host: WorkingToolsHost) {
  return defineExtension({ name: "deepbot.working", tools: [
    defineTool({ name: "read_file", description: "读取事项目录、Bot 工作区和关联文件夹、公共文件夹或已连接文件夹内的 UTF-8 文件，可指定行区间；返回 SHA-256 用于验收", parameters: obj({ path: str(), startLine: opt(num()), maxLines: opt(num()) }), replay: "safe", execute: async (a, api) => {
      const path = await allowedPath(await host.contextFor(String(api.conversationId)), a.path), file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { const info = await file.stat(); if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new PolicyError("只允许读取 2 MB 以内的普通文件"); const data = await file.readFile(); const lines = data.toString("utf8").split("\n"); const start = Math.max(0, (a.startLine ?? 1) - 1); return output({ path, hash: createHash("sha256").update(data).digest("hex"), totalLines: lines.length, content: lines.slice(start, start + Math.min(a.maxLines ?? 400, 2000)).join("\n") }); } finally { await file.close(); }
    } }),
    defineTool({ name: "list_files", description: "列出事项目录、Bot 工作区和关联文件夹、公共文件夹或已连接文件夹中的目录条目", parameters: obj({ path: str() }), replay: "safe", execute: async (a, api) => { const path = await allowedPath(await host.contextFor(String(api.conversationId)), a.path); return output((await readdir(path, { withFileTypes: true })).slice(0, 2000).map(e => ({ name: e.name, kind: e.isDirectory() ? "directory" : e.isSymbolicLink() ? "link" : "file" }))); } }),
    defineTool({ name: "web_read", description: "使用浏览器权限读取 HTTP/HTTPS 网页，只发送 GET；不用于发布或发送", parameters: obj({ url: str() }), replay: "safe", execute: async (a, api, context) => {
      const current = await host.contextFor(String(api.conversationId));
      if (!current.settings.permissions.browser) throw new PolicyError("使用浏览器权限已关闭");
      const url = allowedUrl(a.url);
      const response = await requestHttp(url, context.abortSignal ? { signal: context.abortSignal } : {});
      return output({ url: url.href, status: response.status, content: await readHttpText(response, 1024 * 1024, "网页超过 1 MB 读取上限") });
    } }),
  ] });
}
