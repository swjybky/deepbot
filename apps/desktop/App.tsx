// Entry: window chrome, then the UI. Architecture and design rules: DESIGN.md at the repository root.
import { mount } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { AppShell } from "./ui/AppShell";
import { Agent } from "deepbot/native";
import { setAgentTransport } from "./ui/services/agent";

export const TITLE_BAR_HEIGHT = 64;

if (isAvailable) {
  Window.setTitle("DeepBot");
  // The app draws edge to edge; the system keeps its window buttons, which the layout leaves room
  // for with titleBar() (nsh/desktop).
  Window.setTitleBar({ style: "hidden", height: TITLE_BAR_HEIGHT });
  Window.setFrame({ size: { width: 1280, height: 800 } });
}

setAgentTransport(Agent);
mount(AppShell);
