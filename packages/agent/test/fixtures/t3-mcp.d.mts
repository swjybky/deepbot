import type { RemoteAnswers, RemoteQuestion, T3RuntimeMode } from "../../src/protocol.ts";

type Access = T3RuntimeMode | "read-only";
type Status = "waiting" | "running" | "completed" | "interrupted" | "queued" | "cancelled" | "failed";
type FixtureThread = {
  thread: {
    threadId: string;
    title: string;
    runtimeMode: Access;
    status: Status;
    latestRunId: string;
    activeRunId: string | null;
    pendingRequestCount: number;
    itemCount: number;
    link: string;
  };
  questions: Map<string, RemoteQuestion[]>;
  items: { type: "user_message" | "assistant_message"; runId: string; text: string; messageId?: string }[];
  runs: { runId: string; status: Status; startedAt?: string | null }[];
};

export function startT3Fixture(options: {
  root: string;
  token?: string;
  pairingCodes?: Record<string, Access>;
  initialAccess?: Access;
  host?: string;
  port?: number;
}): Promise<{
  url: string;
  state: {
    environmentId: string;
    initializes: number;
    launches: number;
    sends: number;
    interrupts: { threadId: string; clientRequestId: string }[];
    threads: FixtureThread[];
    projects: { id: string; workspaceRoot: string }[];
    approvals: Access[];
    replies: { action: "respond"; threadId: string; requestId: string; answers: RemoteAnswers }[];
  };
  expireSessions: () => void;
  close: () => Promise<void>;
}>;
