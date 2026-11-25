import { mount } from "nsh";
import { AppShell } from "../../ui/AppShell";
import { setAgentTransport } from "../../ui/services/agent";

// endpoint: the sandbox backend for `ui run`, or the host port `ui serve` forwards to it.
export function startBrowserApp(endpoint = "http://127.0.0.1:23113") {
  let cursor = 0;
  let pending = Promise.resolve();

  setAgentTransport({
    start() {},
    send(line) {
      pending = pending.then(async () => {
        const response = await fetch(`${endpoint}/command`, { method: "POST", body: line });
        if (!response.ok) throw new Error(await response.text());
      }).catch(error => { console.error(String(error)); });
    },
    async next() {
      for (;;) {
        const response = await fetch(`${endpoint}/event?after=${cursor}`);
        if (!response.ok) return null;
        const event = await response.json() as { cursor: number; line: string | null };
        cursor = event.cursor;
        if (event.line) return event.line;
        await new Promise(resolve => setTimeout(resolve, 60));
      }
    },
  });

  mount(AppShell);
}
