import { mount, signal, Scroll, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Agent } from "deepbot/native";

// Mirrors packages/agent/src/protocol.ts (the sidecar's side of the wire).
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };
type AgentMessage =
  | { type: "ready"; model: string; storage: string }
  | { type: "snapshot"; messages: ChatMessage[]; partial: string | null; busy: boolean; error: string | null }
  | { type: "fatal"; message: string };

const messages = signal<ChatMessage[]>([]);
const partial = signal<string | null>(null);
const busy = signal(false);
const status = signal("Starting agent…");
const draft = signal("");

async function pump() {
  try {
    Agent.start();
  } catch (error) {
    status.set(`Agent failed to start: ${String(error)}`);
    return;
  }
  for (;;) {
    const line = await Agent.next();
    if (line === null) {
      status.set("Agent exited");
      busy.set(false);
      return;
    }
    let message: AgentMessage;
    try {
      message = JSON.parse(line) as AgentMessage;
    } catch {
      continue;
    }
    if (message.type === "ready") status.set(message.model);
    else if (message.type === "fatal") status.set(`Agent error: ${message.message}`);
    else {
      messages.set(message.messages);
      partial.set(message.partial);
      busy.set(message.busy);
      if (message.error) status.set(`Last run failed: ${message.error}`);
    }
  }
}

function send() {
  const content = draft().trim();
  if (!content) return;
  Agent.send(JSON.stringify({ type: "input", content, requestId: `${Date.now()}` }));
  draft.set("");
}

function Bubble(props: { role: "user" | "assistant"; text: string }) {
  const mine = props.role === "user";
  return (
    <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "80%",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: mine ? "#2563eb" : "#e5e7eb",
        }}
      >
        <Text style={{ color: mine ? "#ffffff" : "#111827", fontSize: 14 }}>{props.text}</Text>
      </View>
    </View>
  );
}

function App() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>DeepBot</Text>
        <Text style={{ fontSize: 12, color: "#6b7280" }}>{status()}</Text>
      </View>

      <Scroll style={{ flex: 1 }} contentStyle={{ gap: 8 }}>
        {messages().map((m) => <Bubble role={m.role} text={m.text} />)}
        {partial() ? <Bubble role="assistant" text={partial()!} /> : null}
      </Scroll>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Input
          style={{ flex: 1 }}
          placeholder="Ask DeepBot…"
          value={draft()}
          onChange={(e) => draft.set(e.value)}
          onSubmit={send}
        />
        {busy() ? (
          <Button onPress={() => Agent.send(JSON.stringify({ type: "abort" }))}>
            <Text>Stop</Text>
          </Button>
        ) : (
          <Button onPress={send}>
            <Text>Send</Text>
          </Button>
        )}
      </View>
    </View>
  );
}

void pump();
mount(App);
