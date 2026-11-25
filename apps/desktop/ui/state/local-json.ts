import { Storage } from "nsh";
import type { Guard } from "../../../../packages/agent/src/wire-values";

export async function readLocalJson<T>(key: string, check: Guard<T>): Promise<T | undefined> {
  try {
    const saved = await Storage.getItem(key);
    if (saved === null || saved === undefined) return undefined;
    const value: unknown = JSON.parse(saved);
    return check(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalJson<T>(key: string, value: T) {
  void Storage.setItem(key, JSON.stringify(value)).catch(() => {});
}
