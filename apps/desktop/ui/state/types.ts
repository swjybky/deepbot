import type { AvatarShapeId } from "../theme/avatar";
import type { ChatImage } from "../../../../packages/agent/src/protocol";

export interface Bot {
  id: string;
  name: string;
  shape: AvatarShapeId;
  /** A hex from botColors; also the accent color while the bot is open. */
  color: string;
  pinned?: boolean;
  pinnedAt?: number;
  hidden?: boolean;
  createdAt?: number;
  threadId?: string;
  tasks: BotTask[];
  library: LibraryItem[];
  messages: ChatMessage[];
}

export interface BotTask {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
}

export interface LibraryItem {
  name: string;
  meta: string;
}

export type ChatMessage =
  | { id: string; role: "user" | "assistant"; kind: "text"; text: string; workId?: string; workTitle?: string; attentionId?: string; replyTo?: string; reactions?: readonly string[]; images?: readonly ChatImage[] }
  | { id: string; role: "user" | "assistant"; kind: "link"; host: string; url: string };
