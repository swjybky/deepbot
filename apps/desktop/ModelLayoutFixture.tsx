/** Model-page render fixture; no sidecar, credentials, or remote requests. */
import { host, mount, signal, Scroll, Storage, Text, View, type Bounds } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { Card, DisclosureRow, Modal, NavItem, NavList } from "./ui/components";
import { ModelSettings } from "./ui/features/settings/sections/ModelSettings";
import { ModelEditor } from "./ui/features/settings/models/ModelEditor";
import { providerPresets } from "./ui/features/settings/models/model-options";
import { connectAgent } from "./ui/state/runtime";
import { setAgentTransport } from "./ui/services/agent";
import { emptySnapshot } from "../../packages/agent/src/defaults";
import type { AgentMessage } from "../../packages/agent/src/protocol";

const modelConfigs = providerPresets.map((p, i) => ({
  id: `demo-${i}`, name: `${p.title} 模型`, provider: p.value, model: "example-model",
  api: p.api, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv, useCodexAuth: p.value === "openai-codex", hasApiKey: false,
}));
const initial: AgentMessage = { type: "snapshot", seq: 1, snapshot: { ...emptySnapshot(), modelConfigs, defaultModelConfigId: "demo-0" } };
let snapshotPending = true;
setAgentTransport({
  start() {},
  send() {},
  next() {
    if (!snapshotPending) return new Promise(() => {});
    snapshotPending = false;
    return Promise.resolve(JSON.stringify(initial));
  },
});
connectAgent();
const metrics: Record<string, Bounds> = {};
const record = (name: string, bounds: Bounds) => { metrics[name] = bounds; void Storage.setItem("model-layout", JSON.stringify(metrics)); };
function InlineEditor() {
  const source = modelConfigs[Number(host.params.modelIndex ?? 0)]!;
  const model = host.params.modelIndex === 2 ? { ...source, name: "默认模型", model: "gpt-6.1-terra", api: "openai-responses" } : source;
  const editing = signal(false);
  host.on("edit-model", () => editing.set(true));
  return <Card>
    <View><Each of={[model.provider]} key={p => p}>{() => <View class="border-b border-divider">
    <View onLayout={({ bounds }) => record("provider", bounds)}><DisclosureRow title={model.provider} detail="1 个模型" icon="model" open onPress={() => {}} /></View>
    <View class="mb-3 ml-4 gap-1 border-l border-border pl-4">
      <Each of={[model]} key={c => c.id}>{(item) => <View class="gap-2 py-3" onLayout={({ bounds }) => record("slot", bounds)}>
        {editing() ? <ModelEditor id="draft" original={item()} saving={false} onSave={() => {}} onCancel={() => {}} onLayout={({ bounds }) => record("editor", bounds)} /> : <>
          <View class="flex-row items-center gap-2"><Text class="min-w-0 flex-1 text-body text-foreground">{item().name}</Text><Text class="text-caption text-muted-foreground">默认</Text></View>
          <Text class="text-caption text-muted-foreground">{item().model} · {item().api}</Text>
          <View class="flex-row flex-wrap items-center gap-1"><Text class="text-label text-foreground">默认模型　编辑　测试连接　删除</Text></View>
        </>}
      </View>}</Each>
    </View>
    </View>}</Each></View>
  </Card>;
}
function Fixture() {
  return <View class="flex-1 bg-background"><Modal open onClose={() => {}} width={920} height={660} row>
    <View class="w-[210px] border-r border-divider px-3 py-4"><NavList><NavItem label="通用" icon="settings" selected={false} onPress={() => {}} /><NavItem label="模型" icon="model" selected onPress={() => {}} /></NavList></View>
    <Scroll class="flex-1" contentClass="px-10 pb-10 pt-8">
      <Text class="mb-6 text-heading font-semibold text-foreground">模型</Text>
      {host.params.editor ? <InlineEditor /> : <ModelSettings />}
    </Scroll>
  </Modal></View>;
}
if (isAvailable) { Window.setTitle("DeepBot 模型布局验收"); Window.setFrame({ size: { width: 1280, height: 800 } }); Window.orderFront(); }
mount(Fixture);
