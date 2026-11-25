import { isIP } from "node:net";

export function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function isPrivateIpHost(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "");
  const version = isIP(address);
  if (version === 6) return /^f[cd]/i.test(address);
  if (version !== 4) return false;
  const [first, second = 0] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function requestHttp(url: string | URL, init: RequestInit, timeoutMs = 30000): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
  return fetch(url, { ...init, redirect: "error", signal });
}

export async function readHttpText(response: Response, limit: number, tooLarge: string): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) throw new Error(tooLarge);
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
