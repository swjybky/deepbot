import { createHash } from "node:crypto";

export function fingerprint(value: unknown, length = 64): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}
