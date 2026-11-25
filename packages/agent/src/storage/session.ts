import { join } from "node:path";
import type { Storage } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

export function sessionDatabasePath(dataDir: string): string {
  return join(dataDir, "session.sqlite");
}

export async function openSessionStorage(dataDir: string): Promise<Storage> {
  return openNodeSqliteStorage(sessionDatabasePath(dataDir));
}
