import { signal } from "nsh";
import { notify } from "./feedback";
import { runtime, type Attention } from "./runtime";

let openDesktop: ((url: string) => Promise<boolean>) | undefined;
export function setT3DesktopOpener(opener: typeof openDesktop) { openDesktop = opener; }
type OpenAttempt = { state: "opening" } | { state: "failed"; browserUrl: string };
const attempts = signal(new Map<string, OpenAttempt>());

export const t3ThreadOpening = (id: string) => attempts().get(id)?.state === "opening";
export function t3ThreadBrowserFallback(attention: Attention) {
  const attempt = attempts().get(attention.id);
  return attempt?.state === "failed" && attempt.browserUrl === t3ThreadTarget(attention).browserUrl
    ? attempt.browserUrl : undefined;
}

function recordAttempt(id: string, attempt?: OpenAttempt) {
  const openIds = new Set(runtime().attentions.filter(attention => attention.state === "open").map(attention => attention.id));
  const next = new Map([...attempts()].filter(([key]) => openIds.has(key)));
  if (attempt && openIds.has(id)) next.set(id, attempt);
  else next.delete(id);
  attempts.set(next);
}

function assignmentFor(attention: Attention) {
  return runtime().assignments.find(assignment => assignment.id === attention.assignmentId && assignment.workId === attention.workId);
}

export function isT3Request(attention: Attention) {
  if (attention.remoteRequest) return true;
  const assignee = assignmentFor(attention)?.assignee;
  return assignee === "t3code" || !!assignee?.startsWith("t3-remote-");
}

function webUrl(value: string | undefined): URL | undefined {
  try {
    const url = new URL(value ?? "");
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { /* A legacy record may lack a usable web link. */ }
  return undefined;
}

function threadRoute(url: URL | undefined) {
  // T3 serves /<environment>/<thread> itself; hosted thread links add /threads.
  const path = /^\/(?:threads\/)?([^/]+)\/([^/]+)\/?$/.exec(url?.pathname ?? "");
  if (!path) return undefined;
  try {
    const environmentId = decodeURIComponent(path[1]!);
    const threadId = decodeURIComponent(path[2]!);
    if (![environmentId, threadId].some(id => id === "." || id === ".." || /[\x00-\x1f\x7f]/.test(id)))
      return { environmentId, threadId };
  } catch { /* Malformed percent encoding cannot be routed. */ }
  return undefined;
}

function t3ThreadTarget(attention: Attention) {
  const assignment = assignmentFor(attention);
  const ref = assignment?.sessionRef;
  const original = webUrl(ref?.url);
  const browser = original ?? webUrl(attention.externalUrl);
  const route = threadRoute(original);
  const browserThreadId = (original ? route : threadRoute(browser))?.threadId;
  if (ref?.conversationId && browserThreadId && browserThreadId !== ref.conversationId)
    return { reason: "T3 Code 链接与原派工线程不一致" };
  const browserUrl = browser?.href;
  if (!assignment || ref?.assignee !== assignment.assignee || !route || ref.conversationId !== route.threadId)
    return { browserUrl, reason: "尚未同步到原派工的 T3 Code 环境和线程" };
  if (assignment.assignee !== "t3code" || !runtime().connectors.find(connector => connector.id === assignment.assignee)?.t3?.desktopLocal)
    return { browserUrl, reason: "无法确认本机 T3 Code 桌面版已连接原执行器" };
  // T3's desktop app accepts this route on startup and on second-instance.
  return { browserUrl, desktopUrl: `t3code://threads/${encodeURIComponent(route.environmentId)}/${encodeURIComponent(route.threadId)}` };
}

export async function openT3Thread(attention: Attention): Promise<void> {
  if (attention.state !== "open" || t3ThreadOpening(attention.id)) return;
  const target = t3ThreadTarget(attention);
  let reason = target.reason;
  if (target.desktopUrl) {
    recordAttempt(attention.id, { state: "opening" });
    try {
      if (await openDesktop?.(target.desktopUrl)) {
        recordAttempt(attention.id);
        return;
      }
      reason = "无法打开 T3 Code 桌面版，请检查是否已安装并注册打开协议";
    } catch {
      reason = "调用 T3 Code 桌面版失败";
    }
  }
  recordAttempt(attention.id, target.browserUrl ? { state: "failed", browserUrl: target.browserUrl } : undefined);
  notify("error", `${reason}。${target.browserUrl ? "可点「在浏览器打开」查看原线程。" : "当前没有可用的线程网页链接。"}`);
}
