// JSON-lines protocol between the desktop host (NSH, Rust side) and this
// sidecar. One JSON object per line on stdin (host → agent) and stdout
// (agent → host). Logs go to stderr only.

/** Host → agent. */
export type HostMessage =
  | { type: "input"; content: string; requestId?: string }
  | { type: "abort" };

/** One message as the UI shows it. */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/** Agent → host. */
export type AgentMessage =
  | { type: "ready"; model: string; storage: string }
  | {
      type: "snapshot";
      messages: ChatMessage[];
      /** Text streamed so far for the in-flight answer, if any. */
      partial: string | null;
      busy: boolean;
      /** Why the last run ended without an answer (pi.live runFailure). */
      error: string | null;
    }
  | { type: "fatal"; message: string };
