export function processStatus(pid: number): "invalid" | "running" | "missing" | "denied" {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) return "invalid";
  try {
    process.kill(pid, 0);
    return "running";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return "denied";
    if (code === "ESRCH") return "missing";
    throw error;
  }
}

export function staleProcessLock(pid: number, modifiedAt: number): boolean {
  const status = processStatus(pid);
  return status === "missing" || status === "invalid" && Date.now() - modifiedAt > 10_000;
}
