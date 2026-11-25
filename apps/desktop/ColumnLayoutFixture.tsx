/** Actual column contents in the production resizable layout; no sidecar. */
import { host, mount, Storage, View, type Bounds } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { ResizableColumns } from "./ui/components";
import { Sidebar } from "./ui/features/sidebar/Sidebar";
import { ChatPane } from "./ui/features/chat/ChatPane";
import { BotInfoPanel } from "./ui/features/bot-info/BotInfoPanel";
import { infoPanelOpen, setInfoPanel } from "./ui/state/ui";

const metrics: Record<string, Bounds> = {};
const record = (name: string, bounds: Bounds) => { metrics[name] = bounds; void Storage.setItem("column-layout", JSON.stringify(metrics)); };
host.on("info-panel", (open) => setInfoPanel(Boolean(open)));
setInfoPanel(!host.params.closed);
function Fixture() {
  return <View class="flex-1 bg-background">
    <ResizableColumns
      leading={<View class="min-w-0 flex-1" onLayout={({ bounds }) => record("left", bounds)}><Sidebar /></View>}
      trailing={<View class="min-w-0 flex-1" onLayout={({ bounds }) => record("right", bounds)}><BotInfoPanel /></View>}
      trailingVisible={infoPanelOpen()}
    >
      <View class="min-w-0 flex-1" onLayout={({ bounds }) => record("center", bounds)}><ChatPane /></View>
    </ResizableColumns>
  </View>;
}
if (isAvailable) { Window.setTitle("DeepBot 分栏布局验收"); Window.setTitleBar({ style: "hidden", height: 64 }); Window.setFrame({ size: { width: 1280, height: 800 } }); Window.orderFront(); }
mount(Fixture);
